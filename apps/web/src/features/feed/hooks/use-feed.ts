import type { FeedAd, FeedPage, FeedQuery } from "@repo/shared";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { getFavorites, getFeed, setFavorite } from "../api/feed-api";

export const feedKeys = {
  all: ["feed"] as const,
  list: (query: FeedQuery) => ["feed", "list", query] as const,
  favorites: ["feed", "favorites"] as const,
  detail: (id: string) => ["feed", "detail", id] as const,
};

export function useFeed(query: FeedQuery) {
  return useInfiniteQuery({
    queryKey: feedKeys.list(query),
    queryFn: ({ pageParam }) => getFeed({ ...query, cursor: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useFavorites() {
  return useQuery({ queryKey: feedKeys.favorites, queryFn: getFavorites });
}

/** Favoritar com atualização otimista em todas as listas do feed em cache. */
export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const patch = (id: string, favorited: boolean) => {
    queryClient.setQueriesData<InfiniteData<FeedPage>>({ queryKey: ["feed", "list"] }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((ad) => (ad.id === id ? { ...ad, favorited } : ad)),
            })),
          }
        : data,
    );
    queryClient.setQueryData<FeedAd[]>(feedKeys.favorites, (list) =>
      favorited ? list : list?.filter((ad) => ad.id !== id),
    );
  };
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => setFavorite(id, favorite),
    onMutate: ({ id, favorite }) => patch(id, favorite),
    onError: (error, { id, favorite }) => {
      patch(id, !favorite);
      toast.error(
        error instanceof ApiError ? error.message : "Não foi possível atualizar os favoritos.",
      );
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: feedKeys.favorites });
      void queryClient.invalidateQueries({ queryKey: feedKeys.detail(id) });
    },
  });
}
