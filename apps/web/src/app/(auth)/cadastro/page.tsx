import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { GoogleButton, OrDivider } from "@/features/auth/components/google-button";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { getMeIfAvailable, getPublicConfig, homeFor } from "@/lib/session/get-me";

export const metadata: Metadata = { title: "Criar conta — Aqui no Prédio" };

export default async function SignUpPage(): Promise<React.JSX.Element> {
  const me = await getMeIfAvailable();
  if (me) redirect(homeFor(me));
  const { googleLogin } = await getPublicConfig();

  return (
    <AuthShell
      title="Crie sua conta"
      description={
        <>
          Já tem conta?{" "}
          <Link href="/entrar" className="font-semibold text-brand-dark hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      {googleLogin && (
        <>
          <GoogleButton next="/onboarding" />
          <OrDivider />
        </>
      )}
      <SignUpForm />
      <p className="mt-6 text-[0.82rem] leading-relaxed text-muted">
        No próximo passo você aceita os{" "}
        <Link href="/termos" className="underline">
          Termos de Uso
        </Link>{" "}
        e a{" "}
        <Link href="/privacidade" className="underline">
          Política de Privacidade
        </Link>
        . O app é para maiores de 18 anos.
      </p>
    </AuthShell>
  );
}
