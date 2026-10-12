"use client";

import type { MyBuilding } from "@repo/shared";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BuildingSearch } from "./building-search";
import { CreateBuildingWizard } from "./create-building-wizard";

const MODES = ["buscar", "cadastrar", "corrigir"] as const;

/** Passo 2 do onboarding: encontrar o prédio, cadastrar um novo ou corrigir um recusado. */
export function BuildingStep({ rejected }: { rejected: MyBuilding | null }): React.JSX.Element {
  const [mode, setMode] = useQueryState("modo", parseAsStringLiteral(MODES).withDefault("buscar"));

  if (mode === "cadastrar") return <CreateBuildingWizard onBack={() => void setMode(null)} />;
  if (mode === "corrigir" && rejected?.building.canResubmit) {
    return <CreateBuildingWizard onBack={() => void setMode(null)} resubmit={rejected} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {rejected && (
        <Alert tone="error">
          <p className="font-semibold">
            Não conseguimos confirmar o prédio “{rejected.building.name}”.
          </p>
          {rejected.building.rejectionReason && (
            <p className="mt-1">{rejected.building.rejectionReason}</p>
          )}
          {rejected.building.canResubmit ? (
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => void setMode("corrigir")}
            >
              Corrigir e reenviar
            </Button>
          ) : (
            <p className="mt-1">Busque outro prédio abaixo ou fale com o suporte.</p>
          )}
        </Alert>
      )}
      <BuildingSearch onCreate={() => void setMode("cadastrar")} />
    </div>
  );
}
