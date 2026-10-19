"use client";

import type { Category, FeedQuery } from "@repo/shared";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { useFeed } from "../hooks/use-feed";
import { AdCard, AdCardSkeleton } from "./ad-card";
import { FeedFilters, useFeedFilters } from "./feed-filters";

type Filters = ReturnType<typeof useFeedFilters>[0];

function toFeedQuery(filters: Filters): FeedQuery {
  return {
    buildingId: filters.predio ?? undefined,
    q: filters.q ?? undefined,
    type: filters.tipo ?? undefined,
    categoryId: filters.cat ?? undefined,
    distanceKm: filters.dist ?? undefined,
    priceMin: filters.min !== null ? filters.min * 100 : undefined,
    priceMax: filters.max !== null ? filters.max * 100 : undefined,
    verifiedOnly: filters.verificados ? "true" : undefined,
  };
}

function isFiltering(filters: Filters): boolean {
  return Boolean(
    filters.q ||
      filters.tipo ||
      filters.cat ||
      filters.dist !== null ||
      filters.min ||
      filters.max ||
      filters.verificados,
  );
}

function EmptyFeed({ filtering }: { filtering: boolean }): React.JSX.Element {
  return (
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
  );
}

export function FeedList({ categories }: { categories: Category[] }): React.JSX.Element {
  const [filters] = useFeedFilters();
  const query = useMemo(() => toFeedQuery(filters), [filters]);
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
  const filtering = isFiltering(filters);

  return (
    <section className="flex flex-col gap-5" aria-label="Anúncios">
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
        !notice && <EmptyFeed filtering={filtering} />
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
