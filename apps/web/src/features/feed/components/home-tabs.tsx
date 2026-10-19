"use client";

import type { Category, MyBuilding } from "@repo/shared";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Select } from "@/components/ui/input";
import { ReferralList } from "@/features/referrals/components/referral-list";
import { cn } from "@/lib/cn";
import { useFeedFilters } from "./feed-filters";
import { FeedList } from "./feed-list";

const TABS = ["anuncios", "indicacoes"] as const;
const LABELS: Record<(typeof TABS)[number], string> = {
  anuncios: "Anúncios",
  indicacoes: "Indicações",
};

export function HomeTabs({
  categories,
  buildings,
  primaryBuildingId,
}: {
  categories: Category[];
  buildings: MyBuilding[];
  primaryBuildingId: string | null;
}): React.JSX.Element {
  const [tab, setTab] = useQueryState(
    "aba",
    parseAsStringLiteral(TABS).withDefault("anuncios").withOptions({ history: "replace" }),
  );
  const [filters, setFilters] = useFeedFilters();
  const activeBuildings = buildings.filter((item) => item.status === "ativo");

  return (
    <div className="flex flex-col gap-5">
      {activeBuildings.length > 1 && (
        <div className="flex items-center gap-3">
          <label htmlFor="feed-building" className="text-sm font-semibold">
            Ver a partir de
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

      <div role="tablist" aria-label="O que ver" className="flex gap-1 border-b border-line">
        {TABS.map((key) => (
          <button
            key={key}
            id={`tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            onClick={() => void setTab(key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-[0.95rem] font-bold transition-colors",
              tab === key
                ? "border-brand text-ink"
                : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {LABELS[key]}
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "anuncios" ? <FeedList categories={categories} /> : <ReferralList />}
      </div>
    </div>
  );
}
