"use client";

import { CHAT_REALTIME_EVENT, chatRealtimePayloadSchema } from "@repo/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { unreadKey } from "@/features/notifications/hooks/use-unread";
import { getChatRealtime } from "../api/chat-api";
import { setRealtimeConnected } from "../hooks/use-realtime-connected";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Escuta o canal do usuário no Supabase Realtime e invalida as queries do chat quando chega um aviso.
 * O aviso não traz conteúdo: os dados continuam vindo da API, que aplica a autorização.
 */
export function ChatRealtime(): null {
  const queryClient = useQueryClient();
  const enabled = Boolean(supabaseUrl && supabaseKey);
  const { data } = useQuery({
    queryKey: ["chat-realtime"],
    queryFn: getChatRealtime,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const topic = data?.topic;

  useEffect(() => {
    if (!topic || !supabaseUrl || !supabaseKey) return;
    let disposed = false;
    let cleanup = (): void => {};

    const refresh = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: unreadKey });
    };

    // Import dinâmico: o cliente só entra no bundle de quem está logado e com o Realtime ligado.
    void import("@supabase/realtime-js").then(({ RealtimeClient }) => {
      if (disposed) return;
      const client = new RealtimeClient(`${supabaseUrl.replace(/^http/, "ws")}/realtime/v1`, {
        params: { apikey: supabaseKey },
      });
      const channel = client
        .channel(topic)
        .on("broadcast", { event: CHAT_REALTIME_EVENT }, ({ payload }) => {
          if (chatRealtimePayloadSchema.safeParse(payload).success) refresh();
        })
        .subscribe((status) => {
          const isConnected = status === "SUBSCRIBED";
          setRealtimeConnected(isConnected);
          // Ao (re)conectar, busca o que pode ter chegado enquanto o canal estava fora.
          if (isConnected) refresh();
        });
      cleanup = () => {
        void client.removeChannel(channel);
        client.disconnect();
      };
    });

    return () => {
      disposed = true;
      setRealtimeConnected(false);
      cleanup();
    };
  }, [topic, queryClient]);

  return null;
}
