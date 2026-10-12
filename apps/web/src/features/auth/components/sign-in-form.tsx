"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type SignInInput, signInInputSchema } from "@repo/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "@/lib/auth/auth-errors";

export function SignInForm({ next }: { next: string }): React.JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInInputSchema) });

  async function onSubmit(values: SignInInput): Promise<void> {
    setError(null);
    const { error: authError } = await authClient.signIn.email({ ...values, callbackURL: next });
    if (authError) {
      setError(authErrorMessage(authError));
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}
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
      <Field label="Senha" error={errors.password?.message}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("password")}
          />
        )}
      </Field>
      <Link
        href="/esqueci-senha"
        className="-mt-2 self-end text-sm font-semibold text-brand-dark hover:underline"
      >
        Esqueci minha senha
      </Link>
      <Button type="submit" loading={isSubmitting} className="w-full">
        Entrar
      </Button>
    </form>
  );
}
