"use client";

import { AD_AVAILABILITY_LABELS, AD_TYPE_LABELS, type AdDetail, formatPrice } from "@repo/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Ban, Flag, Heart, MapPin, MessageCircle, Pencil, Share2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonClasses } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDistance, timeAgo } from "@/lib/format";
import { blockUser, getAdDetail, getWhatsappLink } from "../api/feed-api";
import { feedKeys, useToggleFavorite } from "../hooks/use-feed";
import { AdGallery } from "./ad-gallery";
import { ReportDialog } from "./report-dialog";
import { StartConversationButton } from "./start-conversation-button";

function WhatsappIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

export function AdDetailView({ initial }: { initial: AdDetail }): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: ad } = useQuery({
    queryKey: feedKeys.detail(initial.id),
    queryFn: () => getAdDetail(initial.id),
    initialData: initial,
  });
  const toggle = useToggleFavorite();
  const [opening, setOpening] = useState(false);

  const where = ad.building.sameBuilding
    ? "No seu prédio"
    : `${ad.building.name}, ${ad.building.district}${ad.building.distanceM !== null ? ` (${formatDistance(ad.building.distanceM)})` : ""}`;

  async function openWhatsapp(): Promise<void> {
    setOpening(true);
    try {
      window.open(await getWhatsappLink(ad.id), "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível abrir o WhatsApp.");
    } finally {
      setOpening(false);
    }
  }

  async function share(): Promise<void> {
    const url = `${window.location.origin}/anuncios/${ad.id}`;
    // O link só abre para quem tem conta e mora perto (a página exige login).
    if (navigator.share) {
      await navigator
        .share({ title: ad.title, text: "Olha esse anúncio no Aqui no Prédio", url })
        .catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    }
  }

  async function block(): Promise<void> {
    if (!window.confirm(`Bloquear ${ad.seller.name}? Vocês deixam de ver os anúncios um do outro.`))
      return;
    try {
      await blockUser(ad.seller.id);
      await queryClient.invalidateQueries({ queryKey: feedKeys.all });
      toast.success(`${ad.seller.name} foi bloqueado(a)`);
      router.push("/inicio");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível bloquear.");
    }
  }

  return (
    <article className="mx-auto grid max-w-[64rem] gap-8 px-5 pb-32 pt-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:pb-12">
      <AdGallery images={ad.images} title={ad.title} />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink-soft">
            {AD_TYPE_LABELS[ad.type]} em {ad.category.name}
          </p>
          <h1 className="text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em]">
            {ad.title}
          </h1>
          <p className="text-2xl font-extrabold text-brand-dark">
            {formatPrice(ad.priceMode, ad.priceCents)}
          </p>
          <p className="flex items-center gap-1.5 text-ink-soft">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {where}
          </p>
          {ad.publishedAt && (
            <p className="text-sm text-muted">Publicado {timeAgo(ad.publishedAt)}</p>
          )}
        </div>

        <section className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-lg font-extrabold text-brand-dark">
            {ad.seller.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-bold">
              <span className="truncate">{ad.seller.name}</span>
              {ad.seller.verified && (
                <BadgeCheck
                  className="size-4.5 shrink-0 text-leaf"
                  aria-label="Morador verificado"
                />
              )}
            </p>
            <p className="text-sm text-muted">
              No app desde{" "}
              {new Date(ad.seller.memberSince).toLocaleDateString("pt-BR", {
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-bold">Descrição</h2>
          <p className="whitespace-pre-line leading-relaxed text-ink-soft">{ad.description}</p>
        </section>

        {ad.availability && (
          <section className="flex flex-col gap-1">
            <h2 className="font-bold">Disponibilidade</h2>
            <p className="text-ink-soft">{AD_AVAILABILITY_LABELS[ad.availability]}</p>
          </section>
        )}

        {ad.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Palavras-chave">
            {ad.tags.map((tag) => (
              <li key={tag} className="rounded-full bg-sand px-3 py-1 text-sm text-ink-soft">
                {tag}
              </li>
            ))}
          </ul>
        )}

        {ad.isOwner ? (
          <Link href={`/anuncios/${ad.id}/editar`} className={buttonClasses("secondary")}>
            <Pencil className="size-4" aria-hidden /> Editar anúncio
          </Link>
        ) : (
          <>
            <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 flex gap-2 border-t border-line bg-cream/95 px-5 py-3 backdrop-blur-md md:static md:border-0 md:bg-transparent md:p-0">
              <StartConversationButton adId={ad.id} className="flex-1" />
              {ad.whatsappEnabled && (
                <Button
                  variant="secondary"
                  onClick={openWhatsapp}
                  loading={opening}
                  className="flex-1 text-[#128c7e]"
                >
                  {!opening && <WhatsappIcon />}
                  WhatsApp
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                aria-pressed={ad.favorited}
                onClick={() => toggle.mutate({ id: ad.id, favorite: !ad.favorited })}
              >
                <Heart
                  className={cn("size-4", ad.favorited && "fill-brand text-brand")}
                  aria-hidden
                />
                {ad.favorited ? "Salvo" : "Salvar"}
              </Button>
              <Button variant="secondary" size="sm" onClick={share}>
                <Share2 className="size-4" aria-hidden /> Compartilhar
              </Button>
              <ReportDialog
                targetType="ad"
                targetId={ad.id}
                trigger={(open) => (
                  <Button variant="ghost" size="sm" onClick={open}>
                    <Flag className="size-4" aria-hidden /> Denunciar
                  </Button>
                )}
              />
              <Button variant="ghost" size="sm" onClick={block}>
                <Ban className="size-4" aria-hidden /> Bloquear {ad.seller.name.split(" ")[0]}
              </Button>
            </div>
          </>
        )}
        <p className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-[0.85rem] text-warn">
          <MessageCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Combine pelo chat e prefira pagar na entrega. Nunca envie códigos ou senhas.
        </p>
      </div>
    </article>
  );
}
