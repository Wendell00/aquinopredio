import type { Metadata } from "next";
import { BuildingStep } from "@/features/buildings/components/building-step";

export const metadata: Metadata = { title: "Entrar em outro prédio — Aqui no Prédio" };

export default function AddBuildingPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-[34rem] flex-col gap-6 px-5 py-8">
      <div>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
          Entrar em outro prédio
        </h1>
        <p className="mt-2 text-ink-soft">
          Para quem tem imóvel em mais de um lugar. Você pode participar de até 3 prédios.
        </p>
      </div>
      <BuildingStep rejected={null} />
    </main>
  );
}
