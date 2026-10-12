import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { GoogleButton, OrDivider } from "@/features/auth/components/google-button";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { safeNextPath } from "@/lib/auth/safe-redirect";
import { getMeIfAvailable, getPublicConfig, homeFor } from "@/lib/session/get-me";

export const metadata: Metadata = { title: "Entrar — Aqui no Prédio" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string; error?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const me = await getMeIfAvailable();
  if (me) redirect(homeFor(me));
  const next = safeNextPath(params.next);
  const { googleLogin } = await getPublicConfig();

  return (
    <AuthShell
      title="Entrar"
      description={
        <>
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="font-semibold text-brand-dark hover:underline">
            Cadastre-se
          </Link>
        </>
      }
    >
      {(params.erro || params.error) && (
        <Alert tone="error" className="mb-6">
          Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.
        </Alert>
      )}
      {googleLogin && (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      )}
      <SignInForm next={next} />
    </AuthShell>
  );
}
