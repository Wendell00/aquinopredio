"use client";

import type { MyBuilding } from "@repo/shared";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonClasses } from "@/components/ui/button";
import { setPrimaryBuilding } from "@/features/buildings/api/buildings-api";
import { BuildingStatusBadge } from "@/features/buildings/components/building-status-badge";
import { useMyBuildings } from "@/features/buildings/hooks/use-buildings";
import { ApiError } from "@/lib/api/client";

const MEMBERSHIP_LABEL: Record<MyBuilding["status"], string> = {
  ativo: "Morador",
  pendente: "Aguardando aprovação",
  recusado: "Pedido recusado",
  removido: "Removido",
};

export function MyBuildings({
  initial,
  max,
}: {
  initial: MyBuilding[];
  max: number;
}): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data = initial } = useMyBuildings(initial);
  const open = data.filter((item) => item.status === "ativo" || item.status === "pendente");

  async function makePrimary(buildingId: string): Promise<void> {
    try {
      await setPrimaryBuilding(buildingId);
      await queryClient.invalidateQueries();
      toast.success("Prédio principal alterado");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível alterar.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {data.map((item) => (
          <li
            key={item.membershipId}
            className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {item.building.name}
                  {item.building.status !== "verificado" && (
                    <BuildingStatusBadge status={item.building.status} />
                  )}
                </p>
                <p className="text-sm text-ink-soft">
                  {item.building.street}, {item.building.number}, {item.building.district}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted">
                  <span>
                    {MEMBERSHIP_LABEL[item.status]}, unidade {item.unit}
                  </span>
                  {item.verifiedResident && (
                    <span className="inline-flex items-center gap-1 text-leaf">
                      <BadgeCheck className="size-4" aria-hidden /> Verificado
                    </span>
                  )}
                </p>
              </div>
              {item.isPrimary && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[0.75rem] font-bold text-brand-dark">
                  <Star className="size-3.5" aria-hidden /> Principal
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!item.isPrimary && item.status === "ativo" && (
                <Button variant="secondary" size="sm" onClick={() => makePrimary(item.building.id)}>
                  Tornar principal
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {open.length < max && (
        <Link
          href="/perfil/predios/novo"
          className={`${buttonClasses("ghost", "sm")} self-start text-brand-dark`}
        >
          Entrar em outro prédio
        </Link>
      )}
    </div>
  );
}
