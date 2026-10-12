"use client";

import type { BuildingSearchQuery, BuildingSummary } from "@repo/shared";
import { BUILDING_LABELS } from "@repo/shared";
import { Building2, LocateFixed, Search } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatDistance, plural } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useBuildingSearch } from "../hooks/use-buildings";
import { BuildingStatusBadge } from "./building-status-badge";
import { JoinBuildingForm } from "./join-building-form";

type Position = { lat: number; lng: number };

function toQuery(text: string, position: Position | null): BuildingSearchQuery | null {
  if (position) return { ...position };
  const value = text.trim();
  const digits = value.replace(/\D/g, "");
  if (/^\d{5}-?\d{3}$/.test(value)) return { cep: digits };
  if (value.length >= 2) return { q: value };
  return null;
}

export function BuildingSearch({ onCreate }: { onCreate: () => void }): React.JSX.Element {
  const [text, setText] = useQueryState("q", parseAsString.withDefault(""));
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BuildingSummary | null>(null);

  const debounced = useDebouncedValue(text, 350);
  const query = useMemo(() => toQuery(debounced, position), [debounced, position]);
  const { data, isFetching, isError } = useBuildingSearch(query);

  function locate(): void {
    if (!("geolocation" in navigator)) {
      setLocationError("Seu navegador não oferece localização. Busque pelo nome ou CEP.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    // A localização é usada só nesta busca e não é salva (RN-131).
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setLocating(false);
        void setText(null);
        setPosition({ lat: result.coords.latitude, lng: result.coords.longitude });
      },
      () => {
        setLocating(false);
        setLocationError(
          "Não conseguimos sua localização. Permita o acesso ou busque pelo nome ou CEP.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  if (selected) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-line bg-white p-5">
          <p className="text-lg font-extrabold">{selected.name}</p>
          <p className="text-ink-soft">
            {selected.street} — {selected.district}, {selected.city}/{selected.state}
          </p>
        </div>
        <JoinBuildingForm building={selected} onCancel={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="building-search" className="sr-only">
            Nome do prédio ou CEP
          </label>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            id="building-search"
            type="search"
            value={text}
            onChange={(event) => {
              setPosition(null);
              void setText(event.target.value || null);
            }}
            placeholder="Nome do prédio ou CEP"
            className="pl-12"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <Button variant="secondary" onClick={locate} loading={locating}>
          {!locating && <LocateFixed className="size-4.5" aria-hidden />}
          Perto de mim
        </Button>
      </div>

      {locationError && <Alert tone="info">{locationError}</Alert>}
      {isError && (
        <Alert tone="error">Não foi possível buscar agora. Tente de novo em instantes.</Alert>
      )}

      {query && data && (
        <div
          aria-live="polite"
          className={cn("flex flex-col gap-3 transition-opacity", isFetching && "opacity-60")}
        >
          {data.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {data.map((building) => (
                <li key={building.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(building)}
                    className="flex w-full items-start gap-4 rounded-xl border border-line bg-white p-4 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/30"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-sand text-ink-soft">
                      <Building2 className="size-5" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 font-bold">
                        {building.name}
                        {building.status !== "verificado" && (
                          <BuildingStatusBadge status={building.status} />
                        )}
                      </span>
                      <span className="text-sm text-ink-soft">
                        {BUILDING_LABELS[building.type]} na {building.street}, {building.district}
                      </span>
                      <span className="text-sm text-muted">
                        {[
                          formatDistance(building.distanceM),
                          plural(building.residents, "morador", "moradores"),
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-soft">Nenhum prédio encontrado com essa busca.</p>
          )}
        </div>
      )}

      <div className="mt-2 rounded-xl border border-dashed border-edge/60 p-5">
        <p className="font-bold">Não encontrou seu prédio?</p>
        <p className="mt-1 text-[0.95rem] text-ink-soft">
          Cadastre em 2 minutos. Você vira o administrador do prédio e os vizinhos podem entrar
          depois.
        </p>
        <Button variant="secondary" className="mt-4" onClick={onCreate}>
          Cadastrar meu prédio
        </Button>
      </div>
    </div>
  );
}
