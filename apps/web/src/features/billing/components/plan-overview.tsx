"use client";

import { type BillingStatus, formatPrice, type PlanLimits } from "@repo/shared";
import { Check, Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useBilling, useStripeRedirect } from "../hooks/use-billing";

function km(value: number): string {
  return `${value.toLocaleString("pt-BR")} km`;
}

function features(limits: PlanLimits): string[] {
  return [
    `Anúncios alcançam até ${km(limits.maxRadiusKm)} do seu prédio`,
    limits.featuredAds > 0
      ? `${limits.featuredAds} anúncio em destaque no topo do feed`
      : "Sem destaque no feed",
    limits.adActiveDays === null
      ? "Anúncios não expiram enquanto o plano durar"
      : `Anúncios saem do ar em ${limits.adActiveDays} dias (renovação grátis)`,
  ];
}

function PlanCard({
  title,
  price,
  items,
  current,
  highlight,
  children,
}: {
  title: string;
  price: string;
  items: string[];
  current: boolean;
  highlight?: boolean;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <section
      aria-labelledby={`plano-${title}`}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-white p-5",
        highlight ? "border-brand/50 ring-2 ring-brand/15" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`plano-${title}`} className="flex items-center gap-2 text-lg font-extrabold">
            {highlight && <Sparkles className="size-5 text-brand" aria-hidden />}
            {title}
          </h2>
          <p className="text-[1.35rem] font-extrabold tracking-[-0.02em]">{price}</p>
        </div>
        {current && (
          <span className="rounded-full bg-leaf-soft px-2.5 py-1 text-[0.75rem] font-bold text-leaf">
            Seu plano
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-ink-soft">
            <Check className="mt-0.5 size-4.5 shrink-0 text-leaf" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}

export function PlanOverview({
  initial,
  result,
}: {
  initial: BillingStatus;
  /** Retorno do Stripe Checkout (`?assinatura=`). */
  result?: "sucesso" | "cancelada";
}): React.JSX.Element {
  const { data } = useBilling(initial);
  const status = data ?? initial;
  const checkout = useStripeRedirect("checkout");
  const portal = useStripeRedirect("portal");
  const isPro = status.plan === "pro";
  const periodEnd = status.subscription?.currentPeriodEnd
    ? new Date(status.subscription.currentPeriodEnd).toLocaleDateString("pt-BR")
    : null;

  return (
    <div className="flex flex-col gap-5">
      {result === "sucesso" && !isPro && (
        <Alert tone="info">
          Pagamento recebido! Estamos ativando o Pro — isso leva alguns segundos. Atualize a página
          se ainda não aparecer.
        </Alert>
      )}
      {result === "sucesso" && isPro && <Alert tone="success">Bem-vindo(a) ao Pro!</Alert>}
      {result === "cancelada" && (
        <Alert tone="info">Assinatura não concluída. Nada foi cobrado.</Alert>
      )}
      {status.subscription?.status === "past_due" && (
        <Alert tone="error">
          Não conseguimos cobrar a última mensalidade. Atualize o cartão para não perder o Pro.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <PlanCard
          title="Free"
          price="Grátis"
          items={features(status.limits.free)}
          current={!isPro}
        />
        <PlanCard
          title="Pro"
          price={`${formatPrice("fixo", status.proPriceCents)}/mês`}
          items={features(status.limits.pro)}
          current={isPro}
          highlight
        >
          {isPro ? (
            <div className="flex flex-col gap-2">
              {periodEnd && (
                <p className="text-sm text-muted">
                  {status.subscription?.cancelAtPeriodEnd
                    ? `Cancelado: o Pro vale até ${periodEnd}.`
                    : `Renova em ${periodEnd}.`}
                </p>
              )}
              <Button
                variant="secondary"
                className="self-start"
                loading={portal.isPending}
                onClick={() => portal.mutate()}
              >
                Gerenciar assinatura
              </Button>
            </div>
          ) : status.checkoutEnabled ? (
            <Button
              className="self-start"
              loading={checkout.isPending}
              onClick={() => checkout.mutate()}
            >
              Assinar o Pro
            </Button>
          ) : (
            <p className="text-sm text-muted">A assinatura estará disponível em breve.</p>
          )}
        </PlanCard>
      </div>
      <p className="text-sm text-muted">
        Pagamento seguro pelo Stripe. Cancele quando quiser: o Pro continua até o fim do mês já pago
        e depois seus anúncios voltam às regras do Free.
      </p>
    </div>
  );
}
