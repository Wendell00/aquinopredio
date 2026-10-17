"use client";

import type { Recommendation } from "@repo/shared";
import { ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useRecommend } from "../hooks/use-reviews";

/** "Indicar" o anúncio aos vizinhos (RN-086). */
export function RecommendButton({
  adId,
  recommendation,
}: {
  adId: string;
  recommendation: Recommendation;
}): React.JSX.Element {
  const recommend = useRecommend(adId);
  const { recommendedByMe } = recommendation;
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={recommendedByMe}
      loading={recommend.isPending}
      onClick={() => recommend.mutate(!recommendedByMe)}
    >
      {!recommend.isPending && (
        <ThumbsUp
          className={cn("size-4", recommendedByMe && "fill-brand text-brand")}
          aria-hidden
        />
      )}
      {recommendedByMe ? "Indicado" : "Indicar"}
    </Button>
  );
}

export function recommendationLabel(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? "1 vizinho indica" : `${count} vizinhos indicam`;
}
