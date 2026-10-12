import type { ReactNode } from "react";
import { BuildingPlate } from "@/components/building-plate";
import { Logo } from "@/components/ui/logo";

/** Moldura das telas de entrada: formulário à esquerda, a vizinhança à direita (desktop). */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center py-10">
          <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
            {title}
          </h1>
          {description && <p className="mt-2 text-ink-soft">{description}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>

      <aside
        aria-hidden
        className="relative hidden overflow-hidden bg-sand lg:flex lg:flex-col lg:justify-center lg:px-14"
      >
        <div className="mx-auto flex w-full max-w-[22rem] flex-col gap-4">
          <BuildingPlate size="lg" name="Ed. Solar das Flores" detail="Seu prédio" />
          <BuildingPlate className="ml-10" name="Cond. Bela Vista" detail="a 600 m" />
          <BuildingPlate className="ml-4" name="Ed. Jardins" detail="a 1,2 km" />
          <p className="mt-6 text-[1.05rem] leading-relaxed text-ink-soft">
            Bolo de pote no 4º andar, manicure no bloco B, aula de violão no prédio da esquina. Tudo
            de quem mora perto de você.
          </p>
        </div>
      </aside>
    </div>
  );
}
