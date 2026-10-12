import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Recuperar senha — Aqui no Prédio" };

export default function ForgotPasswordPage(): React.JSX.Element {
  return (
    <AuthShell
      title="Recuperar senha"
      description="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."
    >
      <ForgotPasswordForm />
      <Link
        href="/entrar"
        className="mt-6 inline-block text-sm font-semibold text-brand-dark hover:underline"
      >
        Voltar para o login
      </Link>
    </AuthShell>
  );
}
