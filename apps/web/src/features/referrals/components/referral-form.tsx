"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type CreateReferralInput,
  createReferralInputSchema,
  type MyBuilding,
  REFERRAL_SERVICE_MAX,
} from "@repo/shared";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { useCreateReferral } from "../hooks/use-referrals";

/** Indicar um prestador de fora do app (RN-089). */
export function ReferralForm({
  buildings,
  primaryBuildingId,
}: {
  buildings: MyBuilding[];
  primaryBuildingId: string | null;
}): React.JSX.Element {
  const router = useRouter();
  const create = useCreateReferral();
  const activeBuildings = buildings.filter((item) => item.status === "ativo");
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateReferralInput, unknown, z.output<typeof createReferralInputSchema>>({
    resolver: zodResolver(createReferralInputSchema),
    defaultValues: {
      service: "",
      providerName: "",
      providerPhone: "",
      buildingId: primaryBuildingId ?? activeBuildings[0]?.building.id,
    },
  });
  const service = useWatch({ control, name: "service" });

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) =>
        create.mutate(values, {
          onSuccess: () => {
            toast.success("Obrigado por indicar aos vizinhos!");
            router.push("/inicio?aba=indicacoes");
          },
        }),
      )}
      className="flex flex-col gap-5"
    >
      {activeBuildings.length > 1 && (
        <Field label="Indicar para os vizinhos de" error={errors.buildingId?.message}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...register("buildingId")}
            >
              {activeBuildings.map((item) => (
                <option key={item.building.id} value={item.building.id}>
                  {item.building.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <Field
        label="O que a pessoa faz"
        hint={`${service?.length ?? 0}/${REFERRAL_SERVICE_MAX}`}
        error={errors.service?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            rows={4}
            maxLength={REFERRAL_SERVICE_MAX}
            placeholder="Ex.: Eletricista. Trocou o chuveiro e as tomadas aqui de casa, pontual e caprichoso."
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("service")}
          />
        )}
      </Field>

      <Field label="Nome" error={errors.providerName?.message}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            maxLength={60}
            autoComplete="off"
            placeholder="Ex.: Seu João"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("providerName")}
          />
        )}
      </Field>

      <Field label="Telefone (com DDD)" error={errors.providerPhone?.message}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="(11) 98765-4321"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("providerPhone")}
          />
        )}
      </Field>

      <Checkbox
        id="referral-consent"
        label="A pessoa indicada autorizou compartilhar o nome e o telefone com os vizinhos."
        error={errors.providerConsent?.message}
        {...register("providerConsent")}
      />

      {create.error && (
        <Alert tone="error">
          {create.error instanceof ApiError
            ? create.error.message
            : "Não foi possível salvar a indicação. Tente de novo."}
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending}>
          Publicar indicação
        </Button>
      </div>
    </form>
  );
}
