import type { MyBuilding } from "@repo/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { BuildingStep } from "@/features/buildings/components/building-step";
import { OnboardingSteps } from "@/features/onboarding/components/onboarding-steps";
import { ProfileStep } from "@/features/onboarding/components/profile-step";
import { serverGet } from "@/lib/api/server";
import { getMe } from "@/lib/session/get-me";

export const metadata: Metadata = { title: "Complete seu cadastro — Aqui no Prédio" };

export default async function OnboardingPage(): Promise<React.JSX.Element> {
  const me = await getMe();
  if (!me) redirect("/entrar?next=/onboarding");
  if (me.onboardingStep === "concluido") redirect("/inicio");
  const myBuildings =
    me.onboardingStep === "predio" ? ((await serverGet<MyBuilding[]>("/me/buildings")) ?? []) : [];
  const rejected = myBuildings.find((item) => item.building.status === "rejeitado") ?? null;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[44rem] items-center justify-between px-5 py-5">
        <Logo href="/onboarding" />
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-[44rem] px-5 pb-16">
        <OnboardingSteps current={me.onboardingStep} />
        {me.onboardingStep === "perfil" && (
          <section className="mt-8">
            <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
              Boas-vindas!
            </h1>
            <p className="mt-2 max-w-[34rem] text-ink-soft">
              Confirme como quer aparecer para os vizinhos. Depois, você encontra o seu prédio.
            </p>
            <div className="mt-8 max-w-[28rem]">
              <ProfileStep me={me} />
            </div>
          </section>
        )}
        {me.onboardingStep === "predio" && (
          <section className="mt-8">
            <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
              Onde você mora?
            </h1>
            <p className="mt-2 max-w-[34rem] text-ink-soft">
              Você vê e anuncia para os vizinhos do seu prédio, e dos prédios próximos se quiser.
            </p>
            <div className="mt-8 max-w-[34rem]">
              <BuildingStep rejected={rejected} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
