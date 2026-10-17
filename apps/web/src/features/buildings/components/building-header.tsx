import type { MyBuilding } from "@repo/shared";
import { BadgeCheck } from "lucide-react";
import { BuildingPlate } from "@/components/building-plate";
import { Alert } from "@/components/ui/alert";
import { BuildingStatusBadge } from "./building-status-badge";

/** Cabeçalho do início: a placa do prédio principal + avisos sobre a situação do vínculo. */
export function BuildingHeader({ current }: { current: MyBuilding }): React.JSX.Element {
  const { building } = current;
  const pending =
    building.status === "pendente_validacao" || building.status === "pendente_revisao";
  return (
    <div className="flex flex-col gap-4">
      <BuildingPlate
        size="lg"
        name={building.name}
        detail={`${building.district}, ${building.city}`}
        badge={
          building.status === "verificado" ? (
            <BadgeCheck className="size-5 shrink-0 text-leaf" aria-label="Prédio verificado" />
          ) : (
            <BuildingStatusBadge status={building.status} />
          )
        }
      />
      {pending && (
        <Alert tone="info">
          Estamos confirmando o endereço do prédio. Até lá, seus anúncios aparecem só para quem mora
          nele.
        </Alert>
      )}
    </div>
  );
}
