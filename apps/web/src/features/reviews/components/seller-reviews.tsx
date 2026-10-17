"use client";

import type { Review } from "@repo/shared";
import { Alert } from "@/components/ui/alert";
import { timeAgo } from "@/lib/format";
import { useUserReviews } from "../hooks/use-reviews";
import { ReviewForm } from "./review-form";
import { Stars } from "./stars";

function ReviewItem({ review }: { review: Review }): React.JSX.Element {
  return (
    <li className="flex flex-col gap-1.5 border-b border-line py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Stars value={review.rating} />
        <span className="text-sm font-semibold">
          {review.reviewer.name}
          {review.isMine && " (você)"}
        </span>
        <span className="text-sm text-muted">{timeAgo(review.updatedAt)}</span>
      </div>
      {review.comment && <p className="text-ink-soft">{review.comment}</p>}
      {review.adTitle && <p className="text-[0.8rem] text-muted">Sobre: {review.adTitle}</p>}
    </li>
  );
}

/** Avaliações de um anunciante (RN-087), com formulário para quem pode avaliar. */
export function SellerReviews({
  userId,
  name,
  isSelf = false,
}: {
  userId: string;
  name: string;
  isSelf?: boolean;
}): React.JSX.Element {
  const { data, isPending, isError } = useUserReviews(userId);

  if (isPending) return <div className="h-24 animate-pulse rounded-2xl bg-sand" aria-busy />;
  if (isError) return <Alert tone="error">Não foi possível carregar as avaliações.</Alert>;

  const { summary } = data;
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2">
        {summary.average !== null ? (
          <>
            <Stars value={summary.average} />
            <span className="font-bold">{summary.average.toLocaleString("pt-BR")}</span>
            <span className="text-sm text-muted">
              ({summary.count} avaliaç{summary.count === 1 ? "ão" : "ões"})
            </span>
          </>
        ) : (
          <span className="text-ink-soft">
            {isSelf ? "Você ainda não recebeu avaliações." : "Ainda sem avaliações."}
          </span>
        )}
      </p>
      {!isSelf &&
        (data.canReview ? (
          <ReviewForm userId={userId} name={name} current={data.myReview} />
        ) : (
          <p className="text-sm text-muted">
            Você pode avaliar depois de conversar com {name.split(" ")[0]} pelo chat e receber
            resposta.
          </p>
        ))}
      {data.items.length > 0 && (
        <ul className="rounded-2xl border border-line bg-white px-4">
          {data.items.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </ul>
      )}
    </div>
  );
}
