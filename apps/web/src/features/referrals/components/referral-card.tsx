"use client";

import { formatPhone, type Referral } from "@repo/shared";
import { Flag, MessageCircle, Phone, Trash2 } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { ReportDialog } from "@/features/feed/components/report-dialog";
import { timeAgo } from "@/lib/format";
import { useDeleteReferral } from "../hooks/use-referrals";

export function ReferralCard({ referral }: { referral: Referral }): React.JSX.Element {
  const remove = useDeleteReferral();
  const digits = referral.providerPhone.replace(/\D/g, "");
  const whatsapp = `https://wa.me/${digits}?text=${encodeURIComponent(
    `Olá, ${referral.providerName}! Recebi sua indicação pelo Aqui no Prédio.`,
  )}`;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-[1.05rem] font-bold leading-snug">{referral.providerName}</h3>
        <p className="whitespace-pre-line text-ink-soft">{referral.service}</p>
      </div>
      <p className="font-semibold tabular-nums">{formatPhone(referral.providerPhone)}</p>
      <div className="flex flex-wrap gap-2">
        <a href={`tel:${referral.providerPhone}`} className={buttonClasses("secondary", "sm")}>
          <Phone className="size-4" aria-hidden /> Ligar
        </a>
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses("secondary", "sm")}
        >
          <MessageCircle className="size-4" aria-hidden /> WhatsApp
        </a>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-[0.82rem] text-muted">
          {referral.isMine ? "Você indicou" : `Indicado por ${referral.author.name}`},{" "}
          {referral.sameBuilding ? "seu prédio" : referral.buildingName},{" "}
          {timeAgo(referral.createdAt)}
        </p>
        {referral.isMine ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm("Apagar esta indicação?")) remove.mutate(referral.id);
            }}
          >
            <Trash2 className="size-4" aria-hidden /> Apagar
          </Button>
        ) : (
          <ReportDialog
            targetType="referral"
            targetId={referral.id}
            trigger={(open) => (
              <Button variant="ghost" size="sm" onClick={open}>
                <Flag className="size-4" aria-hidden /> Denunciar
              </Button>
            )}
          />
        )}
      </div>
    </article>
  );
}

export function ReferralCardSkeleton(): React.JSX.Element {
  return <div className="h-48 animate-pulse rounded-2xl bg-sand" />;
}
