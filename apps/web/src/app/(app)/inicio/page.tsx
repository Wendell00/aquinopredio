import type { MyBuilding } from "@repo/shared";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { BuildingHeader } from "@/features/buildings/components/building-header";
import { serverGet } from "@/lib/api/server";
import { getMe } from "@/lib/session/get-me";

export const metadata: Metadata = { title: "Início — Aqui no Prédio" };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ predio?: string }>;
}): Promise<React.JSX.Element> {
  const [{ predio }, me, buildings] = await Promise.all([
    searchParams,
    getMe(),
    serverGet<MyBuilding[]>("/me/buildings"),
  ]);
  const current =
    buildings?.find((item) => item.building.id === me?.primaryBuildingId) ?? buildings?.[0];

  return (
    <main className="mx-auto flex max-w-[44rem] flex-col gap-6 px-5 py-8">
      {predio === "novo" && (
        <Alert tone="success">
          Prédio cadastrado! Você é o administrador e já pode convidar os vizinhos.
        </Alert>
      )}
      {current && <BuildingHeader current={current} />}
      <p className="text-ink-soft">O feed com os anúncios dos vizinhos chega na próxima etapa.</p>
    </main>
  );
}
