import { useQuery } from "@tanstack/react-query";
import { getUnread } from "../api/notifications-api";

export const unreadKey = ["unread"] as const;

/** Contadores de não lidas (badges). Atualiza a cada 30 s e ao voltar para a aba. */
export function useUnread() {
  return useQuery({
    queryKey: unreadKey,
    queryFn: getUnread,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
