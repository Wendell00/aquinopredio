import type { AdDetail, UpsertReviewInput } from "@repo/shared";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { feedKeys } from "@/features/feed/hooks/use-feed";
import { ApiError } from "@/lib/api/client";
import { deleteReview, getUserReviews, saveReview, setRecommended } from "../api/reviews-api";

export const reviewsQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ["reviews", { userId }],
    queryFn: () => getUserReviews(userId),
  });

export function useUserReviews(userId: string) {
  return useQuery(reviewsQueryOptions(userId));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function useRecommend(adId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recommended: boolean) => setRecommended(adId, recommended),
    onSuccess: (recommendation) => {
      queryClient.setQueryData<AdDetail>(feedKeys.detail(adId), (ad) =>
        ad ? { ...ad, recommendation } : ad,
      );
      if (recommendation.recommendedByMe) toast.success("Obrigado por indicar aos vizinhos!");
    },
    onError: (error) => toast.error(errorMessage(error, "Não foi possível indicar agora.")),
  });
}

/** Salvar ou apagar a avaliação muda a média: atualiza a lista e o detalhe dos anúncios. */
function useInvalidateReviews(userId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: reviewsQueryOptions(userId).queryKey }),
      queryClient.invalidateQueries({ queryKey: feedKeys.all }),
    ]);
}

export function useSaveReview(userId: string) {
  const invalidate = useInvalidateReviews(userId);
  return useMutation({
    mutationFn: (input: UpsertReviewInput) => saveReview(userId, input),
    onSuccess: async () => {
      await invalidate();
      toast.success("Avaliação salva");
    },
    onError: (error) => toast.error(errorMessage(error, "Não foi possível salvar a avaliação.")),
  });
}

export function useDeleteReview(userId: string) {
  const invalidate = useInvalidateReviews(userId);
  return useMutation({
    mutationFn: () => deleteReview(userId),
    onSuccess: async () => {
      await invalidate();
      toast.success("Avaliação apagada");
    },
    onError: (error) => toast.error(errorMessage(error, "Não foi possível apagar.")),
  });
}
