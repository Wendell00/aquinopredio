import type { BuildingAdminView } from "@repo/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuildingAdminPanel } from "@/features/building-admin/components/building-admin-panel";
import { serverGet } from "@/lib/api/server";

export const metadata: Metadata = { title: "Administrar prédio — Aqui no Prédio" };

export default async function BuildingAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await serverGet<BuildingAdminView>(`/buildings/${id}/admin`).catch(() => null);
  if (!view) notFound();
  return (
    <main className="mx-auto flex max-w-[48rem] flex-col gap-6 px-5 py-8">
      <h1 className="sr-only">Administrar prédio</h1>
      <BuildingAdminPanel initial={view} />
    </main>
  );
}
