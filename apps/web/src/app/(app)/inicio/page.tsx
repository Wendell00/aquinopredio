import type { Category, MyBuilding } from "@repo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { BuildingCreatedCelebration } from "@/features/buildings/components/building-created-celebration";
import { BuildingHeader } from "@/features/buildings/components/building-header";
import { HomeTabs } from "@/features/feed/components/home-tabs";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { serverGet } from "@/lib/api/server";
import { getMe } from "@/lib/session/get-me";

export const metadata: Metadata = { title: "Início — Aqui no Prédio" };

export default async function HomePage(): Promise<React.JSX.Element> {
  const [me, buildings, categories] = await Promise.all([
    getMe(),
    serverGet<MyBuilding[]>("/me/buildings"),
    serverGet<Category[]>("/categories"),
  ]);
  const list = buildings ?? [];
  const current = list.find((item) => item.building.id === me?.primaryBuildingId) ?? list[0];

  return (
    <main className="mx-auto flex max-w-[60rem] flex-col gap-6 px-5 py-6">
      <BuildingCreatedCelebration />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">{current && <BuildingHeader current={current} />}</div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <NotificationBell />
          <Link
            href="/meus-anuncios"
            className="hidden text-sm font-semibold text-brand-dark hover:underline sm:block"
          >
            Meus anúncios
          </Link>
        </div>
      </div>
      <HomeTabs
        categories={categories ?? []}
        buildings={list}
        primaryBuildingId={me?.primaryBuildingId ?? null}
      />
    </main>
  );
}
