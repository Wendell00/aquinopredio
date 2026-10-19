import type { CreateReferralInput, ReferralQuery } from "@repo/shared";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { createReferral, deleteReferral, getReferrals } from "../api/referrals-api";

export const referralKeys = {
  all: ["referrals"] as const,
  list: (query: ReferralQuery) => ["referrals", "list", query] as const,
};

export function useReferrals(query: ReferralQuery) {
  return useInfiniteQuery({
    queryKey: referralKeys.list(query),
    queryFn: ({ pageParam }) => getReferrals({ ...query, cursor: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useCreateReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReferralInput) => createReferral(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: referralKeys.all }),
  });
}

export function useDeleteReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteReferral(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: referralKeys.all });
      toast.success("Indicação apagada");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Não foi possível apagar a indicação.",
      ),
  });
}
