"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { useFavorites } from "../hooks/use-feed";
import { AdCard, AdCardSkeleton } from "./ad-card";

export function FavoritesList(): React.JSX.Element {
  const { data, isPending, isError } = useFavorites();
  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <AdCardSkeleton />
        <AdCardSkeleton />
      </div>
    );
  }
  if (isError) return <Alert tone="error">Não foi possível carregar seus favoritos.</Alert>;
  if (!data.length) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-edge/50 p-6">
        <p className="text-lg font-bold">Nenhum favorito ainda</p>
        <p className="text-ink-soft">
          Toque no coração dos anúncios para encontrá-los aqui depois.
        </p>
        <Link href="/inicio" className={buttonClasses("secondary", "sm")}>
          Ver anúncios
        </Link>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {data.map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  );
}
