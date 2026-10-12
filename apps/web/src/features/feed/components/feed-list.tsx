"use client";

import type { Category, FeedQuery, MyBuilding } from "@repo/shared";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useFeed } from "../hooks/use-feed";
import { AdCard, AdCardSkeleton } from "./ad-card";
import { FeedFilters, useFeedFilters } from "./feed-filters";

export function FeedList({
  categories,
  buildings,
  primaryBuildingId,
}: {
  categories: Category[];
  buildings: MyBuilding[];
  primaryBuildingId: string | null;
}): React.JSX.Element {
  const [filters, setFilters] = useFeedFilters();
  const query = useMemo<FeedQuery>(
    () => ({
      buildingId: filters.predio ?? undefined,
      q: filters.q ?? undefined,
      type: filters.tipo ?? undefined,
      categoryId: filters.cat ?? undefined,
      distanceKm: filters.dist ?? undefined,
      priceMin: filters.min !== null ? filters.min * 100 : undefined,
      priceMax: filters.max !== null ? filters.max * 100 : undefined,
      verifiedOnly: filters.verificados ? "true" : undefined,
    }),
    [filters],
  );
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFeed(query);
  const sentinel = useRef<HTMLDivElement>(null);

  // Carrega a próxima página quando o fim da lista aparece na tela.
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const notice = data?.pages[0]?.notice;
  const activeBuildings = buildings.filter((item) => item.status === "ativo");
  const filtering = Boolean(
    filters.q ||
      filters.tipo ||
      filters.cat ||
      filters.dist !== null ||
      filters.min ||
      filters.max ||
      filters.verificados,
  );

  return (
    <section className="flex flex-col gap-5" aria-label="Anúncios">
      {activeBuildings.length > 1 && (
        <div className="flex items-center gap-3">
          <label htmlFor="feed-building" className="text-sm font-semibold">
            Ver anúncios a partir de
          </label>
          <Select
            id="feed-building"
            className="max-w-64 min-h-10"
            value={filters.predio ?? primaryBuildingId ?? ""}
            onChange={(event) => void setFilters({ predio: event.target.value || null })}
          >
            {activeBuildings.map((item) => (
              <option key={item.building.id} value={item.building.id}>
                {item.building.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <FeedFilters categories={categories} />

      {notice && <Alert tone="info">{notice}</Alert>}
      {isError && (
        <Alert tone="error">
          Não foi possível carregar os anúncios. Puxe para atualizar ou tente de novo.
        </Alert>
      )}

      {isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {["a", "b", "c", "d", "e", "f"].map((key) => (
            <AdCardSkeleton key={key} />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {items.map((ad, index) => (
            <AdCard key={ad.id} ad={ad} priority={index < 4} />
          ))}
        </div>
      ) : (
        !notice && (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-edge/50 p-6">
            <p className="text-lg font-bold">
              {filtering ? "Nada encontrado com esses filtros" : "Ainda não há anúncios por aqui"}
            </p>
            <p className="text-ink-soft">
              {filtering
                ? "Tente outra palavra ou aumente a distância."
                : "Seja o primeiro a anunciar no prédio. Os vizinhos de prédios próximos também aparecem aqui."}
            </p>
            {!filtering && (
              <Link href="/anunciar" className={buttonClasses("primary", "sm")}>
                Criar anúncio
              </Link>
            )}
          </div>
        )
      )}

      <div ref={sentinel} aria-hidden />
      {isFetchingNextPage && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <AdCardSkeleton />
          <AdCardSkeleton />
        </div>
      )}
    </section>
  );
}
