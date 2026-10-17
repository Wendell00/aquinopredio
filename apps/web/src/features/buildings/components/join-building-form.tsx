"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type BuildingSummary,
  type JoinBuildingInput,
  joinBuildingInputSchema,
} from "@repo/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { joinBuilding } from "../api/buildings-api";

export function JoinBuildingForm({
  building,
  onCancel,
}: {
  building: BuildingSummary;
  onCancel: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JoinBuildingInput>({ resolver: zodResolver(joinBuildingInputSchema) });

  async function onSubmit({ unit }: JoinBuildingInput): Promise<void> {
    setError(null);
    try {
      const membership = await joinBuilding(building.id, unit);
      await queryClient.invalidateQueries();
      router.push(membership.status === "pendente" ? "/inicio?vinculo=pendente" : "/inicio");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Não foi possível entrar no prédio. Tente de novo.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field
        label="Sua unidade"
        hint="Apto, bloco ou casa. Nunca aparece para os vizinhos."
        error={errors.unit?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            placeholder="Ex.: apto 42, bloco B"
            autoFocus
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("unit")}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={isSubmitting}>
          Entrar no {building.type === "edificio" ? "prédio" : "condomínio"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Escolher outro
        </Button>
      </div>
    </form>
  );
}
