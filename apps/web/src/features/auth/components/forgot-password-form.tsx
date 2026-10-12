"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { emailSchema } from "@repo/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "@/lib/auth/auth-errors";

const schema = z.object({ email: emailSchema });
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm(): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit({ email }: Values): Promise<void> {
    setError(null);
    const { error: authError } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/redefinir-senha",
    });
    if (authError?.status === 429) {
      setError(authErrorMessage(authError));
      return;
    }
    // Mesma resposta exista ou não a conta (não revela quem está cadastrado).
    setSent(true);
  }

  if (sent) {
    return (
      <Alert tone="success">
        Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha em
        instantes.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="E-mail da conta" error={errors.email?.message}>
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
      <Button type="submit" loading={isSubmitting} className="w-full">
        Enviar link
      </Button>
    </form>
  );
}
