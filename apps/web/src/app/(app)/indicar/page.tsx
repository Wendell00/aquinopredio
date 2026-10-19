import type { MyBuilding } from "@repo/shared";
import type { Metadata } from "next";
import { ReferralForm } from "@/features/referrals/components/referral-form";
import { serverGet } from "@/lib/api/server";
import { getMe } from "@/lib/session/get-me";

export const metadata: Metadata = { title: "Indicar alguém — Aqui no Prédio" };

export default async function NewReferralPage(): Promise<React.JSX.Element> {
  const [me, buildings] = await Promise.all([getMe(), serverGet<MyBuilding[]>("/me/buildings")]);
  return (
    <main className="mx-auto flex max-w-[44rem] flex-col gap-6 px-5 py-8">
      <div>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
          Indicar alguém
        </h1>
        <p className="mt-1 text-ink-soft">
          Conhece um prestador de confiança que não está no app? Conte para os vizinhos do seu
          prédio e de prédios próximos.
        </p>
      </div>
      <ReferralForm buildings={buildings ?? []} primaryBuildingId={me?.primaryBuildingId ?? null} />
    </main>
  );
}
