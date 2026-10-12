import type { Metadata } from "next";

export const metadata: Metadata = { title: "Início — Aqui no Prédio" };

export default function HomePage(): React.JSX.Element {
  return (
    <main className="mx-auto max-w-[44rem] px-5 py-8">
      <h1 className="text-2xl font-extrabold">Início</h1>
      <p className="mt-2 text-ink-soft">O feed do seu prédio chega nas próximas etapas.</p>
    </main>
  );
}
