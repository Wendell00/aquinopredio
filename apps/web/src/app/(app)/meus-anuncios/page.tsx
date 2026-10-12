import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { MyAdsList } from "@/features/ads/components/my-ads-list";

export const metadata: Metadata = { title: "Meus anúncios — Aqui no Prédio" };

export default async function MyAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ novo?: string }>;
}): Promise<React.JSX.Element> {
  const { novo } = await searchParams;
  return (
    <main className="mx-auto flex max-w-[44rem] flex-col gap-6 px-5 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
          Meus anúncios
        </h1>
        <Link href="/anunciar" className={buttonClasses("primary", "sm")}>
          Novo anúncio
        </Link>
      </div>
      <MyAdsList highlightId={novo} />
    </main>
  );
}
