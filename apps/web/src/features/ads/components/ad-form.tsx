"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AD_AVAILABILITY_LABELS,
  AD_TYPE_LABELS,
  type AdFormOptions,
  adAvailabilitySchema,
  adTypeSchema,
  type CreateAdInput,
  PRICE_MODE_LABELS,
  phoneSchema,
  priceModeSchema,
  type UploadedImage,
} from "@repo/shared";
import { Lock, Sparkles } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { updateProfile } from "@/features/me/api/me-api";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { improveAdText } from "../api/ads-api";
import { ImagePicker } from "./image-picker";

const formSchema = z
  .object({
    buildingId: z.string().min(1, "Escolha o prédio"),
    type: adTypeSchema,
    categoryId: z.string().min(1, "Escolha uma categoria"),
    title: z
      .string()
      .trim()
      .min(5, "O título precisa de pelo menos 5 caracteres")
      .max(80, "Use no máximo 80 caracteres"),
    description: z.string().trim().min(20, "Descreva com pelo menos 20 caracteres").max(2000),
    priceMode: priceModeSchema,
    price: z.string(),
    radiusKm: z.number(),
    whatsappEnabled: z.boolean(),
    phone: z.string(),
    availability: adAvailabilitySchema.or(z.literal("")),
    tagsText: z.string(),
    images: z.array(z.custom<UploadedImage>()),
  })
  .superRefine((values, ctx) => {
    if (
      (values.priceMode === "fixo" || values.priceMode === "a_partir_de") &&
      parsePrice(values.price) === null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "Informe o preço, ex.: 10 ou 35,50",
      });
    }
    if (values.whatsappEnabled && values.phone && !phoneSchema.safeParse(values.phone).success) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Informe um celular com DDD" });
    }
  });

export type AdFormValues = z.infer<typeof formSchema>;

/** "35,50" / "R$ 1.200" → centavos. */
export function parsePrice(raw: string): number | null {
  const cleaned = raw
    .replace(/[^\d,.]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

export function formatPriceInput(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: cents % 100 ? 2 : 0 });
}

export function toAdInput(values: AdFormValues): Omit<CreateAdInput, "aiDraftId"> {
  const priceCents =
    values.priceMode === "fixo" || values.priceMode === "a_partir_de"
      ? parsePrice(values.price)
      : null;
  return {
    buildingId: values.buildingId,
    type: values.type,
    categoryId: values.categoryId,
    title: values.title,
    description: values.description,
    priceMode: values.priceMode,
    priceCents,
    radiusKm: values.radiusKm,
    whatsappEnabled: values.whatsappEnabled,
    availability: values.availability || null,
    tags: values.tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length >= 2)
      .slice(0, 8),
    imageIds: values.images.map((image) => image.id),
  };
}

const RADIUS_LABEL = (km: number) =>
  km === 0 ? "Só meu prédio" : `${km.toLocaleString("pt-BR")} km`;

export function AdForm({
  options,
  defaultValues,
  toConfirm = [],
  submitLabel,
  onSubmit,
}: {
  options: AdFormOptions;
  defaultValues: AdFormValues;
  /** Campos que a IA pediu para confirmar (RN-056). */
  toConfirm?: string[];
  submitLabel: string;
  onSubmit: (values: AdFormValues) => Promise<void>;
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [improving, setImproving] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<AdFormValues>({ resolver: zodResolver(formSchema), defaultValues });

  const [buildingId, priceMode, whatsappEnabled, title, description] = useWatch({
    control,
    name: ["buildingId", "priceMode", "whatsappEnabled", "title", "description"],
  });
  const building = options.buildings.find((item) => item.id === buildingId);
  const allRadii = [0, 0.5, 1, 2, 3, 5];

  async function improve(): Promise<void> {
    setImproving(true);
    try {
      const result = await improveAdText({
        title: getValues("title"),
        description: getValues("description"),
      });
      setValue("title", result.title, { shouldValidate: true });
      setValue("description", result.description, { shouldValidate: true });
      toast.success(
        `Texto revisado. Você ainda pode usar a IA ${result.remainingToday} vez(es) hoje.`,
      );
    } catch (cause) {
      toast.error(
        cause instanceof ApiError ? cause.message : "Não foi possível melhorar o texto agora.",
      );
    } finally {
      setImproving(false);
    }
  }

  async function submit(values: AdFormValues): Promise<void> {
    setError(null);
    try {
      if (values.whatsappEnabled && !options.hasPhone) {
        if (!values.phone) {
          setError("Para receber mensagens no WhatsApp, informe seu celular.");
          return;
        }
        await updateProfile({ phone: values.phone });
      }
      await onSubmit(values);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Não foi possível salvar o anúncio. Tente de novo.",
      );
    }
  }

  const confirmLabels: Record<string, string> = {
    preco: "preço",
    disponibilidade: "disponibilidade",
    categoria: "categoria",
    tipo: "tipo",
  };

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-7">
      {error && <Alert tone="error">{error}</Alert>}
      {toConfirm.length > 0 && (
        <Alert tone="info">
          Confira antes de publicar:{" "}
          {toConfirm.map((field) => confirmLabels[field] ?? field).join(", ")}. A IA não inventa
          dados que você não informou.
        </Alert>
      )}

      {options.buildings.length > 1 && (
        <Field label="Publicar a partir de" error={errors.buildingId?.message}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...register("buildingId")}
            >
              {options.buildings.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">O que você quer anunciar?</legend>
        <div className="grid grid-cols-3 gap-2">
          {adTypeSchema.options.map((type) => (
            <label
              key={type}
              className="flex cursor-pointer items-center justify-center rounded-xl border border-line bg-white px-3 py-3 text-center font-semibold has-checked:border-brand has-checked:bg-brand-soft/40 has-focus-visible:outline-2 has-focus-visible:outline-brand"
            >
              <input type="radio" value={type} className="sr-only" {...register("type")} />
              {AD_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Categoria" error={errors.categoryId?.message}>
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("categoryId")}
          >
            <option value="">Escolha…</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Título" hint={`${title?.length ?? 0}/80`} error={errors.title?.message}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            maxLength={80}
            placeholder="Ex.: Bolo de pote caseiro — chocolate e ninho"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("title")}
          />
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <Field
          label="Descrição"
          hint={`${description?.length ?? 0}/2000`}
          error={errors.description?.message}
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              rows={6}
              maxLength={2000}
              placeholder="Conte o que você oferece, como funciona e o que está incluso."
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...register("description")}
            />
          )}
        </Field>
        {options.aiEnabled && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start text-brand-dark"
            loading={improving}
            disabled={(description?.trim().length ?? 0) < 10 || options.aiRemainingToday <= 0}
            onClick={improve}
          >
            {!improving && <Sparkles className="size-4" aria-hidden />}
            Melhorar texto com IA
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Fotos</span>
        <Controller
          control={control}
          name="images"
          render={({ field }) => <ImagePicker images={field.value} onChange={field.onChange} />}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Preço</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {priceModeSchema.options.map((mode) => (
            <label
              key={mode}
              className="flex cursor-pointer items-center justify-center rounded-xl border border-line bg-white px-3 py-2.5 text-center text-[0.92rem] font-semibold has-checked:border-brand has-checked:bg-brand-soft/40 has-focus-visible:outline-2 has-focus-visible:outline-brand"
            >
              <input type="radio" value={mode} className="sr-only" {...register("priceMode")} />
              {PRICE_MODE_LABELS[mode]}
            </label>
          ))}
        </div>
        {(priceMode === "fixo" || priceMode === "a_partir_de") && (
          <Field label="Valor (R$)" error={errors.price?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                placeholder="10,00"
                className="max-w-44"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                {...register("price")}
              />
            )}
          </Field>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Quem pode ver</legend>
        <Controller
          control={control}
          name="radiusKm"
          render={({ field }) => (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Alcance do anúncio">
              {allRadii.map((km) => {
                const allowed = building?.allowedRadiiKm.includes(km) ?? km === 0;
                const selected = field.value === km;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: chips com role=radio têm melhor toque no celular
                  <button
                    key={km}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!allowed}
                    onClick={() => field.onChange(km)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[0.92rem] font-semibold transition-colors",
                      selected
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-white text-ink hover:border-ink-soft/40",
                      !allowed &&
                        "cursor-not-allowed border-dashed bg-transparent text-muted hover:border-line",
                    )}
                  >
                    {!allowed && <Lock className="size-3.5" aria-hidden />}
                    {RADIUS_LABEL(km)}
                  </button>
                );
              })}
            </div>
          )}
        />
        <p className="text-[0.82rem] text-muted">
          {!building?.buildingVerified
            ? "Enquanto o prédio está em verificação, o anúncio aparece só para quem mora nele."
            : !building.residentVerified
              ? "Com o selo de morador verificado você pode alcançar até 5 km."
              : "Vizinhos dos prédios dentro do raio escolhido verão o seu anúncio."}
        </p>
      </fieldset>

      <Field
        label="Disponibilidade (opcional)"
        hint="Quando você costuma atender ou entregar. Detalhes vão na descrição."
        error={errors.availability?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(toConfirm.includes("disponibilidade") && "border-warn")}
            {...register("availability")}
          >
            <option value="">Não informar</option>
            {adAvailabilitySchema.options.map((option) => (
              <option key={option} value={option}>
                {AD_AVAILABILITY_LABELS[option]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field
        label="Palavras-chave (opcional)"
        hint="Separe por vírgula. Ajudam os vizinhos a encontrar seu anúncio."
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            placeholder="bolo, doce, caseiro"
            aria-describedby={describedBy}
            {...register("tagsText")}
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
        <legend className="sr-only">Contato</legend>
        <p className="text-sm font-semibold">Contato</p>
        <p className="text-[0.9rem] text-ink-soft">
          Os vizinhos sempre podem falar com você pelo chat do app.
        </p>
        <label className="flex cursor-pointer items-center gap-3 font-semibold">
          <input type="checkbox" className="size-5 accent-brand" {...register("whatsappEnabled")} />
          Também quero receber mensagens no WhatsApp
        </label>
        {whatsappEnabled && !options.hasPhone && (
          <Field
            label="Seu celular com DDD"
            hint="O número não aparece no anúncio; o botão abre a conversa."
            error={errors.phone?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(11) 91234-5678"
                className="max-w-60"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                {...register("phone")}
              />
            )}
          </Field>
        )}
      </fieldset>

      <Button
        type="submit"
        loading={isSubmitting}
        className="sm:self-start"
        disabled={!options.canPublish}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
