import type { BillingStatus } from "@repo/shared";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { PlanOverview } from "@/features/billing/components/plan-overview";
import { serverGet } from "@/lib/api/server";

export const metadata: Metadata = { title: "Seu plano — Aqui no Prédio" };

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ assinatura?: string }>;
}): Promise<React.JSX.Element> {
  const [{ assinatura }, status] = await Promise.all([
    searchParams,
    // A sessão já é validada no layout; aqui só degradamos se a API falhar.
    serverGet<BillingStatus>("/billing").catch(() => null),
  ]);
  const result = assinatura === "sucesso" || assinatura === "cancelada" ? assinatura : undefined;

  return (
    <main className="mx-auto flex max-w-[52rem] flex-col gap-6 px-5 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
          Seu plano
        </h1>
        <p className="text-ink-soft">
          Mais alcance e destaque para quem presta serviço ou vende com frequência.
        </p>
      </div>
      {status ? (
        <PlanOverview initial={status} result={result} />
      ) : (
        <Alert tone="error">Não foi possível carregar seu plano agora.</Alert>
      )}
    </main>
  );
}
