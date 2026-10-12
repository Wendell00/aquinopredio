"use client";

import { AD_TYPE_LABELS, adTypeSchema, type Category, FEED_DISTANCES_KM } from "@repo/shared";
import { Search, SlidersHorizontal, X } from "lucide-react";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsNumberLiteral,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { useEffect, useState } from "react";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

/** Filtros do feed na URL (compartilháveis e preservados ao voltar da página do anúncio). */
export const feedFilterParsers = {
  q: parseAsString,
  tipo: parseAsStringLiteral(adTypeSchema.options),
  cat: parseAsString,
  dist: parseAsNumberLiteral(FEED_DISTANCES_KM),
  min: parseAsInteger,
  max: parseAsInteger,
  verificados: parseAsBoolean,
  predio: parseAsString,
};

export function useFeedFilters() {
  return useQueryStates(feedFilterParsers, { history: "replace" });
}

const DISTANCE_LABEL = (km: number) => (km === 0 ? "Só meu prédio" : `Até ${km} km`);

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-[0.88rem] font-semibold transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-line bg-white text-ink hover:border-ink-soft/40",
      )}
    >
      {children}
    </button>
  );
}

export function FeedFilters({ categories }: { categories: Category[] }): React.JSX.Element {
  const [filters, setFilters] = useFeedFilters();
  const [text, setText] = useState(filters.q ?? "");
  const debounced = useDebouncedValue(text, 400);
  const [open, setOpen] = useState(
    Boolean(filters.cat || filters.min || filters.max || filters.verificados),
  );

  useEffect(() => {
    const next = debounced.trim().length >= 2 ? debounced.trim() : null;
    if (next !== filters.q) void setFilters({ q: next });
  }, [debounced, filters.q, setFilters]);

  const activeCount = [filters.cat, filters.min, filters.max, filters.verificados].filter(
    Boolean,
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor="feed-search" className="sr-only">
          Buscar anúncios
        </label>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          id="feed-search"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Buscar: manicure, bolo, conserto…"
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

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        <Chip active={!filters.tipo} onClick={() => void setFilters({ tipo: null })}>
          Tudo
        </Chip>
        {adTypeSchema.options.map((type) => (
          <Chip
            key={type}
            active={filters.tipo === type}
            onClick={() => void setFilters({ tipo: filters.tipo === type ? null : type })}
          >
            {type === "servico"
              ? "Serviços"
              : type === "produto"
                ? "Produtos"
                : AD_TYPE_LABELS.procura}
          </Chip>
        ))}
        <span aria-hidden className="mx-1 w-px shrink-0 bg-line" />
        {FEED_DISTANCES_KM.map((km) => (
          <Chip
            key={km}
            active={filters.dist === km}
            onClick={() => void setFilters({ dist: filters.dist === km ? null : km })}
          >
            {DISTANCE_LABEL(km)}
          </Chip>
        ))}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-[0.88rem] font-semibold"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Mais filtros{activeCount > 0 && ` (${activeCount})`}
        </button>
      </div>

      {open && (
        <div className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="feed-category" className="text-sm font-semibold">
              Categoria
            </label>
            <Select
              id="feed-category"
              value={filters.cat ?? ""}
              onChange={(event) => void setFilters({ cat: event.target.value || null })}
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <fieldset className="flex items-end gap-2">
            <legend className="mb-1.5 text-sm font-semibold">Preço (R$)</legend>
            <Input
              aria-label="Preço mínimo"
              inputMode="numeric"
              placeholder="mín."
              className="w-24"
              defaultValue={filters.min ?? ""}
              onBlur={(event) =>
                void setFilters({
                  min: event.target.value ? Number.parseInt(event.target.value, 10) || null : null,
                })
              }
            />
            <Input
              aria-label="Preço máximo"
              inputMode="numeric"
              placeholder="máx."
              className="w-24"
              defaultValue={filters.max ?? ""}
              onBlur={(event) =>
                void setFilters({
                  max: event.target.value ? Number.parseInt(event.target.value, 10) || null : null,
                })
              }
            />
          </fieldset>
          <label className="flex min-h-12 cursor-pointer items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="size-5 accent-brand"
              checked={Boolean(filters.verificados)}
              onChange={(event) => void setFilters({ verificados: event.target.checked || null })}
            />
            Só verificados
          </label>
        </div>
      )}
    </div>
  );
}
