import type { Metadata } from "next";
import { BuildingPlate } from "@/components/building-plate";

export const metadata: Metadata = { title: "Sem conexão — Aqui no Prédio" };

export default function OfflinePage(): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[28rem] flex-col justify-center gap-6 px-5">
      <BuildingPlate size="lg" name="Sem conexão" detail="Parece que a internet caiu" />
      <p className="text-ink-soft">
        Assim que a conexão voltar, é só recarregar a página. Seus rascunhos de anúncio continuam no
        aparelho.
      </p>
    </main>
  );
}
