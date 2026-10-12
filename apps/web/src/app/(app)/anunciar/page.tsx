import type { AdFormOptions } from "@repo/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateAdFlow } from "@/features/ads/components/create-ad-flow";
import { serverGet } from "@/lib/api/server";

export const metadata: Metadata = { title: "Novo anúncio — Aqui no Prédio" };

export default async function NewAdPage(): Promise<React.JSX.Element> {
  const options = await serverGet<AdFormOptions>("/ads/form-options");
  if (!options) redirect("/entrar?next=/anunciar");
  return (
    <main className="mx-auto flex max-w-[44rem] flex-col gap-6 px-5 py-8">
      <div>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
          Novo anúncio
        </h1>
        <p className="mt-1 text-ink-soft">
          {options.activeAds} de {options.maxActiveAds} anúncios ativos
        </p>
      </div>
      <CreateAdFlow options={options} />
    </main>
  );
}
