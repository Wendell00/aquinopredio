import type { Metadata } from "next";
import { FavoritesList } from "@/features/feed/components/favorites-list";

export const metadata: Metadata = { title: "Favoritos — Aqui no Prédio" };

export default function FavoritesPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-[60rem] flex-col gap-6 px-5 py-8">
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">Favoritos</h1>
      <FavoritesList />
    </main>
  );
}
