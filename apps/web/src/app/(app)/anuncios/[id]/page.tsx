import type { AdDetail } from "@repo/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdDetailView } from "@/features/feed/components/ad-detail-view";
import { serverGet } from "@/lib/api/server";

type Props = { params: Promise<{ id: string }> };

async function load(id: string): Promise<AdDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return serverGet<AdDetail>(`/ads/${id}`).catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ad = await load((await params).id);
  // Anúncios são privados aos moradores: nada de prévia rica nem indexação.
  return {
    title: ad ? `${ad.title} — Aqui no Prédio` : "Anúncio — Aqui no Prédio",
    robots: { index: false },
  };
}

export default async function AdPage({ params }: Props): Promise<React.JSX.Element> {
  const ad = await load((await params).id);
  if (!ad) notFound();
  return <AdDetailView initial={ad} />;
}
