import type { AdFormOptions, MyAd } from "@repo/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditAdForm } from "@/features/ads/components/edit-ad-form";
import { serverGet } from "@/lib/api/server";

export const metadata: Metadata = { title: "Editar anúncio — Aqui no Prédio" };

export default async function EditAdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [ad, options] = await Promise.all([
    serverGet<MyAd>(`/ads/mine/${id}`).catch(() => null),
    serverGet<AdFormOptions>("/ads/form-options"),
  ]);
  if (!ad || !options) notFound();
  return (
    <main className="mx-auto flex max-w-[44rem] flex-col gap-6 px-5 py-8">
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
        Editar anúncio
      </h1>
      <EditAdForm ad={ad} options={options} />
    </main>
  );
}
