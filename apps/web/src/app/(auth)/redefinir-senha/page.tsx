import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = { title: "Nova senha — Aqui no Prédio" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}): Promise<React.JSX.Element> {
  const { token, error } = await searchParams;
  return (
    <AuthShell title="Crie uma nova senha">
      <ResetPasswordForm token={error ? null : (token ?? null)} />
    </AuthShell>
  );
}
