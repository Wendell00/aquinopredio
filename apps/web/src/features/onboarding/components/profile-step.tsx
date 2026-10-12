"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type CompleteProfileInput, completeProfileInputSchema, type Me } from "@repo/shared";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { completeProfile } from "@/features/me/api/me-api";
import { ApiError } from "@/lib/api/client";

export function ProfileStep({ me }: { me: Me }): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompleteProfileInput>({
    resolver: zodResolver(completeProfileInputSchema),
    defaultValues: { name: me.name },
  });

  async function onSubmit(values: CompleteProfileInput): Promise<void> {
    setError(null);
    try {
      queryClient.setQueryData(["me"], await completeProfile(values));
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Não foi possível salvar. Tente de novo.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {error && <Alert tone="error">{error}</Alert>}
      <Field
        label="Nome de exibição"
        hint="É assim que os vizinhos vão ver você"
        error={errors.name?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            autoComplete="name"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("name")}
          />
        )}
      </Field>
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-white p-4">
        <Checkbox
          id="acceptTerms"
          error={errors.acceptTerms?.message}
          label={
            <>
              Li e aceito os{" "}
              <Link href="/termos" target="_blank" className="font-semibold text-ink underline">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link
                href="/privacidade"
                target="_blank"
                className="font-semibold text-ink underline"
              >
                Política de Privacidade
              </Link>
            </>
          }
          {...register("acceptTerms")}
        />
        <Checkbox
          id="isAdult"
          error={errors.isAdult?.message}
          label="Tenho 18 anos ou mais"
          {...register("isAdult")}
        />
      </div>
      <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto sm:self-start">
        Continuar
      </Button>
    </form>
  );
}
