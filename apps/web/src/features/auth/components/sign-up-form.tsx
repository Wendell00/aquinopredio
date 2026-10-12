"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type SignUpInput, signUpInputSchema } from "@repo/shared";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "@/lib/auth/auth-errors";

export function SignUpForm(): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpInputSchema) });

  async function onSubmit(values: SignUpInput): Promise<void> {
    setError(null);
    const { error: authError } = await authClient.signUp.email({
      ...values,
      callbackURL: "/onboarding",
    });
    if (authError) {
      setError(authErrorMessage(authError));
      return;
    }
    setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-start gap-4">
        <span className="grid size-12 place-items-center rounded-full bg-leaf-soft text-leaf">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h2 className="text-xl font-bold">Confira seu e-mail</h2>
        <p className="text-ink-soft">
          Enviamos um link de confirmação para <strong className="text-ink">{sentTo}</strong>. Abra
          o link para ativar sua conta — ele vale por 1 hora.
        </p>
        <p className="text-sm text-muted">
          Não chegou? Olhe a caixa de spam ou tente entrar para receber outro link.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}
      <Field
        label="Como quer ser chamado(a)"
        hint="Aparece para os vizinhos nos seus anúncios"
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
      <Field label="E-mail" error={errors.email?.message}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("email")}
          />
        )}
      </Field>
      <Field
        label="Senha"
        hint="Pelo menos 10 caracteres. Uma frase curta é fácil de lembrar."
        error={errors.password?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("password")}
          />
        )}
      </Field>
      <Button type="submit" loading={isSubmitting} className="w-full">
        Criar conta
      </Button>
    </form>
  );
}
