"use client";

import { type AdStatus, formatPrice, type MyAd } from "@repo/shared";
import {
  ArrowUp,
  Eye,
  Heart,
  MessageCircle,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useAdAction, useDeleteAd, useMyAds } from "../hooks/use-ads";

const STATUS: Record<AdStatus, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-sand text-ink-soft" },
  em_moderacao: { label: "Em análise", className: "bg-warn-soft text-warn" },
  ativo: { label: "Ativo", className: "bg-leaf-soft text-leaf" },
  pausado: { label: "Pausado", className: "bg-sand text-ink-soft" },
  expirado: { label: "Expirado", className: "bg-sand text-ink-soft" },
  removido: { label: "Removido", className: "bg-danger-soft text-danger-dark" },
  excluido: { label: "Excluído", className: "bg-sand text-muted" },
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function MyAdCard({ ad, highlight }: { ad: MyAd; highlight: boolean }): React.JSX.Element {
  const action = useAdAction();
  const remove = useDeleteAd();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = STATUS[ad.status];
  const expiresIn = daysUntil(ad.expiresAt);
  const canBump =
    ad.status === "ativo" && ad.canBumpAt !== null && new Date(ad.canBumpAt) <= new Date();
  const busy = action.isPending || remove.isPending;
  const cover = ad.images[0];

  return (
    <li
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-white p-4 sm:flex-row",
        highlight ? "border-brand/50 ring-2 ring-brand/15" : "border-line",
      )}
    >
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-sand sm:aspect-square sm:w-28">
        {cover ? (
          <Image
            src={cover.thumbUrl}
            alt=""
            fill
            sizes="(min-width: 640px) 112px, 100vw"
            className="object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center text-sm text-muted">Sem foto</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn("rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold", status.className)}
          >
            {status.label}
          </span>
          <span className="text-sm text-muted">{ad.category.name}</span>
        </div>
        <h2 className="text-[1.05rem] font-bold leading-snug">{ad.title}</h2>
        <p className="font-semibold text-ink-soft">{formatPrice(ad.priceMode, ad.priceCents)}</p>

        {ad.status === "removido" && ad.statusReason && (
          <Alert tone="error">Removido pela moderação: {ad.statusReason}</Alert>
        )}
        {ad.status === "em_moderacao" && (
          <p className="text-sm text-ink-soft">
            Estamos conferindo o anúncio. Ele aparece para os vizinhos assim que for aprovado.
          </p>
        )}
        {ad.status === "ativo" && expiresIn !== null && (
          <p className={cn("text-sm", expiresIn <= 3 ? "font-semibold text-warn" : "text-muted")}>
            {expiresIn <= 0
              ? "Expira hoje"
              : `Expira em ${expiresIn} dia${expiresIn === 1 ? "" : "s"}`}
          </p>
        )}
        {ad.status === "ativo" && (
          <p className="flex gap-4 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <Heart className="size-4" aria-hidden /> {ad.stats.favorites}
              <span className="sr-only">favoritos</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-4" aria-hidden /> {ad.stats.conversations}
              <span className="sr-only">conversas</span>
            </span>
          </p>
        )}

        <div className="mt-1 flex flex-wrap gap-2">
          {ad.status === "ativo" && (
            <Link href={`/anuncios/${ad.id}`} className={buttonClasses("secondary", "sm")}>
              <Eye className="size-4" aria-hidden /> Ver
            </Link>
          )}
          {["ativo", "em_moderacao", "pausado", "expirado"].includes(ad.status) && (
            <Link href={`/anuncios/${ad.id}/editar`} className={buttonClasses("secondary", "sm")}>
              <Pencil className="size-4" aria-hidden /> Editar
            </Link>
          )}
          {ad.status === "ativo" && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => action.mutate({ id: ad.id, action: "pause" })}
            >
              <Pause className="size-4" aria-hidden /> Pausar
            </Button>
          )}
          {ad.status === "pausado" && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => action.mutate({ id: ad.id, action: "resume" })}
            >
              <Play className="size-4" aria-hidden /> Reativar
            </Button>
          )}
          {(ad.status === "expirado" ||
            (ad.status === "ativo" && expiresIn !== null && expiresIn <= 3)) && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => action.mutate({ id: ad.id, action: "renew" })}
            >
              <RefreshCw className="size-4" aria-hidden /> Renovar
            </Button>
          )}
          {canBump && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => action.mutate({ id: ad.id, action: "bump" })}
            >
              <ArrowUp className="size-4" aria-hidden /> Subir no feed
            </Button>
          )}
          {confirmDelete ? (
            <span className="inline-flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                loading={remove.isPending}
                onClick={() => remove.mutate(ad.id)}
              >
                Excluir de vez
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden /> Excluir
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function MyAdsList({ highlightId }: { highlightId?: string }): React.JSX.Element {
  const { data, isPending, isError } = useMyAds();

  if (isPending) {
    return (
      <ul className="flex flex-col gap-4" aria-busy>
        {[0, 1].map((key) => (
          <li key={key} className="h-36 animate-pulse rounded-2xl bg-sand" />
        ))}
      </ul>
    );
  }
  if (isError) return <Alert tone="error">Não foi possível carregar seus anúncios.</Alert>;
  if (!data.length) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-edge/50 p-6">
        <p className="text-lg font-bold">Você ainda não tem anúncios</p>
        <p className="text-ink-soft">
          Ofereça um serviço, venda algo ou conte o que está procurando.
        </p>
        <Link href="/anunciar" className={buttonClasses()}>
          Criar meu primeiro anúncio
        </Link>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {data.map((ad) => (
        <MyAdCard key={ad.id} ad={ad} highlight={ad.id === highlightId} />
      ))}
    </ul>
  );
}
