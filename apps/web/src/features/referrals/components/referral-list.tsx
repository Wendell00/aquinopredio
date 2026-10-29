"use client";

import { Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeedFilters } from "@/features/feed/components/feed-filters";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useReferrals } from "../hooks/use-referrals";
import { ReferralCard, ReferralCardSkeleton } from "./referral-card";

/** Aba "Indicações": prestadores de fora do app que os vizinhos recomendam (RN-089). */
export function ReferralList(): React.JSX.Element {
  // Busca e prédio ficam na URL, compartilhados com a aba de anúncios.
  const [filters, setFilters] = useFeedFilters();
  const [text, setText] = useState(filters.q ?? "");
  const debounced = useDebouncedValue(text, 400);
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useReferrals(
    { buildingId: filters.predio ?? undefined, q: filters.q ?? undefined },
  );
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = debounced.trim().length >= 2 ? debounced.trim() : null;
    if (next !== filters.q) void setFilters({ q: next });
  }, [debounced, filters.q, setFilters]);

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

  return (
    <section className="flex flex-col gap-5" aria-label="Indicações">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="referral-search" className="sr-only">
            Buscar indicações
          </label>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            id="referral-search"
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Buscar: eletricista, diarista, pintor…"
            className="pl-12 pr-12"
            enterKeyHint="search"
          />
          {text && (
            <button
              type="button"
              onClick={() => setText("")}
              className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-sand"
              aria-label="Limpar busca"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <Link href="/indicar" className={buttonClasses("primary", "md")}>
          <Plus className="size-5" aria-hidden /> Indicar alguém
        </Link>
      </div>

      {isError && <Alert tone="error">Não foi possível carregar as indicações.</Alert>}

      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ReferralCardSkeleton />
          <ReferralCardSkeleton />
        </div>
      ) : items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((referral) => (
            <ReferralCard key={referral.id} referral={referral} />
          ))}
        </div>
      ) : (
        !isError && <EmptyReferrals searching={Boolean(filters.q)} />
      )}

      <div ref={sentinel} aria-hidden />
      {isFetchingNextPage && <ReferralCardSkeleton />}
    </section>
  );
}

function EmptyReferrals({ searching }: { searching: boolean }): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-edge/50 p-6">
      <p className="text-lg font-bold">
        {searching ? "Nenhuma indicação encontrada" : "Ainda não há indicações por aqui"}
      </p>
      <p className="text-ink-soft">
        {searching
          ? "Tente outra palavra."
          : "Conhece um eletricista, diarista ou costureira de confiança? Indique para os vizinhos."}
      </p>
    </div>
  );
}
