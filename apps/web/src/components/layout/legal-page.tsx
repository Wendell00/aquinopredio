import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";

/** Moldura das páginas de texto legal: leitura confortável, até ~70 caracteres por linha. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto max-w-[44rem] px-5 py-5">
        <Logo />
      </header>
      <main className="mx-auto max-w-[40rem] px-5 pb-20">
        <h1 className="text-[2rem] font-extrabold leading-tight tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-sm text-muted">Atualizado em {updated}</p>
        <div className="mt-8 flex flex-col gap-4 leading-relaxed text-ink-soft [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </main>
    </div>
  );
}
