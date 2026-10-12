"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { passwordSchema } from "@repo/shared";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "@/lib/auth/auth-errors";

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((values) => values.password === values.confirm, {
    path: ["confirm"],
    message: "As senhas não conferem",
  });
type Values = z.infer<typeof schema>;

export function ResetPasswordForm({ token }: { token: string | null }): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <Alert tone="error">
        Link inválido.{" "}
        <Link href="/esqueci-senha" className="font-semibold underline">
          Peça um novo link
        </Link>
        .
      </Alert>
    );
  }

  async function onSubmit({ password }: Values): Promise<void> {
    setError(null);
    const { error: authError } = await authClient.resetPassword({
      newPassword: password,
      token: token ?? "",
    });
    if (authError) {
      setError(authErrorMessage(authError));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <Alert tone="success">
          Senha alterada. Por segurança, encerramos as sessões abertas em outros aparelhos.
        </Alert>
        <Link href="/entrar" className={buttonClasses()}>
          Entrar com a nova senha
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Nova senha" hint="Pelo menos 10 caracteres" error={errors.password?.message}>
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
      <Field label="Repita a nova senha" error={errors.confirm?.message}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("confirm")}
          />
        )}
      </Field>
      <Button type="submit" loading={isSubmitting} className="w-full">
        Salvar nova senha
      </Button>
    </form>
  );
}
