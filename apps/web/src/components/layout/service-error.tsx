"use client";

import { RotateCw } from "lucide-react";
import { BuildingPlate } from "@/components/building-plate";
import { Button } from "@/components/ui/button";

/** Tela de erro amigável (API fora do ar ou falha inesperada), com opção de tentar de novo. */
export function ServiceError({ reset }: { reset: () => void }): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-[28rem] flex-col justify-center gap-6 px-5">
      <BuildingPlate
        size="lg"
        name="Algo saiu do lugar"
        detail="Não conseguimos carregar esta página"
      />
      <p className="text-ink-soft">
        Pode ser a conexão ou o serviço reiniciando. Espere alguns segundos e tente de novo.
      </p>
      <Button className="self-start" onClick={() => reset()}>
        <RotateCw className="size-4" aria-hidden />
        Tentar de novo
      </Button>
    </main>
  );
}
