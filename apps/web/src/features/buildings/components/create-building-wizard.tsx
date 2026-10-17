"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  BRAZIL_STATES,
  BUILDING_LABELS,
  type BuildingSummary,
  type CreateBuildingInput,
  createBuildingInputSchema,
  type MyBuilding,
} from "@repo/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type FieldPath, useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatCep, formatDistance } from "@/lib/format";
import {
  checkDuplicates,
  createBuilding,
  geocode,
  lookupCep,
  resubmitBuilding,
} from "../api/buildings-api";
import { JoinBuildingForm } from "./join-building-form";
import { PinMap } from "./pin-map";

type Step = "endereco" | "mapa" | "duplicados" | "dados";

// No reenvio a unidade já existe; no formulário ela é opcional e validada só na criação.
const formSchema = createBuildingInputSchema.extend({ unit: z.string().trim().max(30).optional() });
type FormValues = z.input<typeof formSchema>;

const ADDRESS_FIELDS: FieldPath<FormValues>[] = [
  "cep",
  "street",
  "number",
  "district",
  "city",
  "state",
];

const PRECISION_HINT = {
  exato: "Encontramos o endereço. Confira se o pino está na entrada do prédio.",
  rua: "Encontramos a rua, mas não o número. Arraste o pino até a entrada do prédio.",
  cep: "Só encontramos a região do CEP. Arraste o pino até a entrada do prédio.",
  manual: "Não encontramos o endereço no mapa. Toque no mapa ou arraste o pino até o prédio.",
} as const;

export function CreateBuildingWizard({
  onBack,
  resubmit,
}: {
  onBack: () => void;
  /** Prédio recusado sendo corrigido (RN-029). */
  resubmit?: MyBuilding;
}): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("endereco");
  const [precision, setPrecision] = useState<keyof typeof PRECISION_HINT>("exato");
  const [candidates, setCandidates] = useState<BuildingSummary[]>([]);
  const [joining, setJoining] = useState<BuildingSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = resubmit?.building;
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    trigger,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existing
      ? {
          name: existing.suggestedName ?? existing.name,
          type: existing.type,
          cep: formatCep(existing.cep),
          street: existing.street,
          number: existing.number,
          district: existing.district,
          city: existing.city,
          state: existing.state as FormValues["state"],
          lat: existing.lat,
          lng: existing.lng,
          ignoreDuplicates: true,
        }
      : { type: "edificio", ignoreDuplicates: false },
  });
  const [lat, lng] = watch(["lat", "lng"]);
  const address = watch(["street", "number", "district", "city", "state", "cep"]);
  const [street, number, district, city, state, cep] = address.map((part) => String(part ?? ""));
  const fullAddress = {
    line1: `${street}, ${number}`,
    line2: [district, city && state ? `${city}/${state}` : city, cep && `CEP ${formatCep(cep)}`]
      .filter(Boolean)
      .join(" · "),
  };

  function fail(cause: unknown, fallback: string): void {
    setError(cause instanceof ApiError ? cause.message : fallback);
  }

  async function fillFromCep(raw: string): Promise<void> {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const address = await lookupCep(cep);
      if (address.street) setValue("street", address.street, { shouldValidate: true });
      if (address.district) setValue("district", address.district, { shouldValidate: true });
      setValue("city", address.city, { shouldValidate: true });
      setValue("state", address.state as FormValues["state"], { shouldValidate: true });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404)
        setFieldError("cep", { message: "CEP não encontrado" });
    }
  }

  async function goToMap(): Promise<void> {
    setError(null);
    if (!(await trigger(ADDRESS_FIELDS))) return;
    setBusy(true);
    const values = getValues();
    try {
      const result = await geocode({
        cep: String(values.cep),
        street: String(values.street),
        number: String(values.number),
        city: String(values.city),
        state: values.state as CreateBuildingInput["state"],
      });
      setValue("lat", result.lat);
      setValue("lng", result.lng);
      setPrecision(result.precision);
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.status === 404)) {
        fail(cause, "Não foi possível localizar o endereço agora.");
        setBusy(false);
        return;
      }
      // RN-024: sem geocodificação, o usuário marca no mapa (centro aproximado do Brasil urbano).
      if (getValues("lat") === undefined) {
        setValue("lat", -23.5505);
        setValue("lng", -46.6333);
      }
      setPrecision("manual");
    }
    setBusy(false);
    setStep("mapa");
  }

  async function confirmLocation(): Promise<void> {
    setError(null);
    if (resubmit) {
      setStep("dados");
      return;
    }
    setBusy(true);
    try {
      const values = getValues();
      const found = await checkDuplicates({
        cep: String(values.cep),
        number: String(values.number),
        lat: Number(values.lat),
        lng: Number(values.lng),
      });
      setCandidates(found);
      setStep(found.length ? "duplicados" : "dados");
    } catch (cause) {
      fail(cause, "Não foi possível conferir prédios próximos.");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(values: FormValues): Promise<void> {
    setError(null);
    const input = formSchema.parse(values);
    try {
      if (resubmit) {
        const { unit: _unit, ignoreDuplicates: _ignore, ...fields } = input;
        await resubmitBuilding(resubmit.building.id, fields);
      } else {
        if (!input.unit) {
          setFieldError("unit", { message: "Informe a unidade (ex.: apto 42, bloco B)" });
          return;
        }
        const result = await createBuilding({ ...input, unit: input.unit, ignoreDuplicates: true });
        if (result.result === "duplicates") {
          setCandidates(result.candidates);
          setStep("duplicados");
          return;
        }
      }
      await queryClient.invalidateQueries();
      router.push("/inicio?cadastro=predio");
      router.refresh();
    } catch (cause) {
      fail(cause, "Não foi possível cadastrar o prédio. Tente de novo.");
    }
  }

  if (joining) {
    return <JoinBuildingForm building={joining} onCancel={() => setJoining(null)} />;
  }

  const back = (): void => {
    setError(null);
    if (step === "endereco") onBack();
    else if (step === "mapa") setStep("endereco");
    else if (step === "duplicados") setStep("mapa");
    else setStep(candidates.length ? "duplicados" : "mapa");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <Button variant="secondary" size="sm" onClick={back} className="self-start">
        <ArrowLeft className="size-4.5" aria-hidden />
        Voltar
      </Button>

      {error && <Alert tone="error">{error}</Alert>}

      {step === "endereco" && (
        <fieldset className="flex flex-col gap-5">
          <legend className="mb-4 text-lg font-extrabold">Endereço do prédio</legend>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4">
            <Field label="CEP" error={errors.cep?.message}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  {...register("cep", {
                    onChange: (event) => void fillFromCep(event.target.value),
                  })}
                />
              )}
            </Field>
            <Field label="Número" error={errors.number?.message}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  {...register("number")}
                />
              )}
            </Field>
          </div>
          <Field label="Rua" error={errors.street?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                {...register("street")}
              />
            )}
          </Field>
          <Field label="Bairro" error={errors.district?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                {...register("district")}
              />
            )}
          </Field>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-4">
            <Field label="Cidade" error={errors.city?.message}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  {...register("city")}
                />
              )}
            </Field>
            <Field label="UF" error={errors.state?.message}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  {...register("state")}
                >
                  <option value="">—</option>
                  {BRAZIL_STATES.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Button onClick={goToMap} loading={busy} className="self-start">
            <MapPin className="size-4.5" aria-hidden />
            Ver no mapa
          </Button>
        </fieldset>
      )}

      {step === "mapa" && lat !== undefined && lng !== undefined && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold">Confirme o local</h2>
          <div className="flex items-start gap-3 rounded-xl border border-line bg-white p-4">
            <MapPin className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <p>
              <span className="block font-bold">{fullAddress.line1}</span>
              <span className="block text-sm text-ink-soft">{fullAddress.line2}</span>
            </p>
          </div>
          <p className="text-ink-soft">{PRECISION_HINT[precision]}</p>
          <PinMap
            lat={Number(lat)}
            lng={Number(lng)}
            onChange={(newLat, newLng) => {
              setValue("lat", newLat);
              setValue("lng", newLng);
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={confirmLocation} loading={busy}>
              O prédio fica aqui
            </Button>
            <Button variant="secondary" onClick={back}>
              <ArrowLeft className="size-4.5" aria-hidden />
              Corrigir endereço
            </Button>
          </div>
        </section>
      )}

      {step === "duplicados" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold">Seu prédio é um destes?</h2>
          <p className="text-ink-soft">
            Já existem prédios cadastrados neste endereço ou muito perto dele.
          </p>
          <ul className="flex flex-col gap-3">
            {candidates.map((candidate) => (
              <li
                key={candidate.id}
                className="flex items-center gap-4 rounded-xl border border-line bg-white p-4"
              >
                <Building2 className="size-5 shrink-0 text-ink-soft" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{candidate.name}</p>
                  <p className="text-sm text-ink-soft">
                    {candidate.street}, {candidate.district}
                    {candidate.distanceM !== null && `, ${formatDistance(candidate.distanceM)}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setJoining(candidate)}
                  disabled={candidate.status === "pendente_validacao"}
                >
                  É este
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" className="self-start" onClick={() => setStep("dados")}>
            Não, é outro prédio
          </Button>
        </section>
      )}

      {step === "dados" && (
        <fieldset className="flex flex-col gap-5">
          <legend className="mb-4 text-lg font-extrabold">Sobre o prédio</legend>
          <Field
            label="Nome do prédio ou condomínio"
            hint="Como está na fachada. Ex.: Edifício Solar das Flores"
            error={errors.name?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                {...register("name")}
              />
            )}
          </Field>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Tipo">
            <span className="text-sm font-semibold">Tipo</span>
            <div className="grid grid-cols-2 gap-3">
              {(["edificio", "condominio_horizontal"] as const).map((type) => (
                <label
                  key={type}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3 font-semibold has-checked:border-brand has-checked:bg-brand-soft/40",
                    "border-line",
                  )}
                >
                  <input type="radio" value={type} className="accent-brand" {...register("type")} />
                  {BUILDING_LABELS[type]}
                </label>
              ))}
            </div>
          </div>
          <Field
            label="Quantas unidades, mais ou menos? (opcional)"
            error={errors.unitsEstimate?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                className="max-w-40"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                {...register("unitsEstimate", {
                  setValueAs: (value) => (value === "" ? null : Number(value)),
                })}
              />
            )}
          </Field>
          {!resubmit && (
            <Field
              label="Sua unidade"
              hint="Apto, bloco ou casa. Nunca aparece para os vizinhos."
              error={errors.unit?.message}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  placeholder="Ex.: apto 42"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  {...register("unit")}
                />
              )}
            </Field>
          )}
          <p className="text-sm text-muted">
            Vamos conferir o endereço automaticamente. Enquanto isso, você já pode usar o app com
            anúncios só para o seu prédio.
          </p>
          <Button type="submit" loading={isSubmitting} className="self-start">
            {resubmit ? "Reenviar para análise" : "Cadastrar prédio"}
          </Button>
        </fieldset>
      )}
    </form>
  );
}
