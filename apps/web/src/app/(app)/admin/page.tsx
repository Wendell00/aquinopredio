import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPanel } from "@/features/admin/components/admin-panel";
import { getMe } from "@/lib/session/get-me";

export const metadata: Metadata = { title: "Painel — Aqui no Prédio", robots: { index: false } };

export default async function AdminPage(): Promise<React.JSX.Element> {
  const me = await getMe();
  // A API também exige o papel; aqui só evita mostrar a tela.
  if (me?.role !== "platform_admin") notFound();
  return (
    <main className="mx-auto flex max-w-[64rem] flex-col gap-6 px-5 py-8">
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
        Painel da plataforma
      </h1>
      <AdminPanel />
    </main>
  );
}
