import type { Metadata } from "next";
import { BlockedUsers } from "@/features/profile/components/blocked-users";

export const metadata: Metadata = { title: "Pessoas bloqueadas — Aqui no Prédio" };

export default function BlockedPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-[44rem] flex-col gap-6 px-5 py-8">
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
        Pessoas bloqueadas
      </h1>
      <p className="text-ink-soft">Vocês não veem os anúncios um do outro e não podem conversar.</p>
      <BlockedUsers />
    </main>
  );
}
