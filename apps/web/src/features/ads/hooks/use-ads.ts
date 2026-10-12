import type { MyAd } from "@repo/shared";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { type AdAction, deleteAd, getAdFormOptions, getMyAds, runAdAction } from "../api/ads-api";

export const adKeys = {
  all: ["ads"] as const,
  mine: ["ads", "mine"] as const,
  formOptions: ["ads", "form-options"] as const,
};

export const adFormOptionsQuery = queryOptions({
  queryKey: adKeys.formOptions,
  queryFn: getAdFormOptions,
});

export function useAdFormOptions() {
  return useQuery(adFormOptionsQuery);
}

export function useMyAds() {
  return useQuery({
    queryKey: adKeys.mine,
    queryFn: getMyAds,
    // Anúncios em moderação mudam de estado sozinhos: atualiza enquanto houver algum.
    refetchInterval: (query) =>
      query.state.data?.some((ad) => ad.status === "em_moderacao") ? 4_000 : false,
  });
}

const ACTION_MESSAGES: Record<AdAction, string> = {
  pause: "Anúncio pausado",
  resume: "Anúncio reativado",
  renew: "Anúncio renovado por mais 30 dias",
  bump: "Anúncio subiu para o topo do feed",
};

export function useAdAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: AdAction }) => runAdAction(id, action),
    onSuccess: (ad: MyAd, { action }) => {
      queryClient.setQueryData<MyAd[]>(adKeys.mine, (list) =>
        list?.map((item) => (item.id === ad.id ? ad : item)),
      );
      void queryClient.invalidateQueries({ queryKey: adKeys.formOptions });
      toast.success(ACTION_MESSAGES[action]);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Não foi possível concluir. Tente de novo.",
      ),
  });
}

export function useDeleteAd() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAd,
    onSuccess: (_, id) => {
      queryClient.setQueryData<MyAd[]>(adKeys.mine, (list) =>
        list?.filter((item) => item.id !== id),
      );
      void queryClient.invalidateQueries({ queryKey: adKeys.formOptions });
      toast.success("Anúncio excluído");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Não foi possível excluir."),
  });
}
