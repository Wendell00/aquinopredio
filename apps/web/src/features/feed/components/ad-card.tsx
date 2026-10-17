"use client";

import { AD_TYPE_LABELS, type FeedAd, formatPrice } from "@repo/shared";
import { BadgeCheck, Heart, ImageOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FeaturedBadge } from "@/features/billing/components/featured-badge";
import { cn } from "@/lib/cn";
import { formatDistance, timeAgo } from "@/lib/format";
import { useToggleFavorite } from "../hooks/use-feed";

/** Card do feed (RN-073): foto, título, preço, prédio de origem, distância, selo e tempo. */
export function AdCard({
  ad,
  priority = false,
}: {
  ad: FeedAd;
  priority?: boolean;
}): React.JSX.Element {
  const toggle = useToggleFavorite();
  const where = ad.sameBuilding
    ? "Seu prédio"
    : `${ad.buildingName}, ${formatDistance(ad.distanceM) ?? "perto"}`;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
      <div className="relative aspect-[4/3] bg-sand">
        {ad.cover ? (
          <Image
            src={ad.cover.thumbUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 260px, 50vw"
            className="object-cover"
            priority={priority}
          />
        ) : (
          <span className="grid size-full place-items-center text-muted">
            <ImageOff className="size-7" aria-hidden />
          </span>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {ad.featured && <FeaturedBadge />}
          {ad.isMine && (
            <span className="rounded-full bg-brand px-2.5 py-0.5 text-[0.72rem] font-bold text-white">
              Seu anúncio
            </span>
          )}
          {ad.type === "procura" && (
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-[0.72rem] font-bold text-white">
              {AD_TYPE_LABELS.procura}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-[0.95rem] font-bold leading-snug">
          <Link
            href={`/anuncios/${ad.id}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {ad.title}
          </Link>
        </h3>
        <p className="font-extrabold text-ink">{formatPrice(ad.priceMode, ad.priceCents)}</p>
        <p className="mt-auto flex items-center gap-1 pt-1 text-[0.8rem] text-ink-soft">
          {ad.sellerVerified && (
            <BadgeCheck className="size-3.5 shrink-0 text-leaf" aria-label="Morador verificado" />
          )}
          <span className="truncate">{where}</span>
        </p>
        <p className="text-[0.75rem] text-muted">{timeAgo(ad.publishedAt)}</p>
      </div>
      {!ad.isMine && (
        <button
          type="button"
          onClick={() => toggle.mutate({ id: ad.id, favorite: !ad.favorited })}
          aria-pressed={ad.favorited}
          aria-label={ad.favorited ? "Remover dos favoritos" : "Salvar nos favoritos"}
          className="absolute right-2 top-2 z-10 grid size-9 place-items-center rounded-full bg-white/90 shadow-sm transition-transform active:scale-90"
        >
          <Heart
            className={cn("size-5", ad.favorited ? "fill-brand text-brand" : "text-ink")}
            aria-hidden
          />
        </button>
      )}
    </article>
  );
}

export function AdCardSkeleton(): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white" aria-hidden>
      <div className="aspect-[4/3] animate-pulse bg-sand" />
      <div className="flex flex-col gap-2 p-3">
        <div className="h-4 w-4/5 animate-pulse rounded bg-sand" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-sand" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-sand" />
      </div>
    </div>
  );
}
