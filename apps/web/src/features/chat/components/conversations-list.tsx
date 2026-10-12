"use client";

import { useQuery } from "@tanstack/react-query";
import { ImageIcon, MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { getConversations } from "../api/chat-api";

export const conversationsKey = ["conversations"] as const;

export function ConversationsList(): React.JSX.Element {
  const { data, isPending, isError } = useQuery({
    queryKey: conversationsKey,
    queryFn: getConversations,
    refetchInterval: 15_000,
  });

  if (isPending) {
    return (
      <ul className="flex flex-col gap-2" aria-busy>
        {["a", "b", "c"].map((key) => (
          <li key={key} className="h-20 animate-pulse rounded-2xl bg-sand" />
        ))}
      </ul>
    );
  }
  if (isError) return <Alert tone="error">Não foi possível carregar suas conversas.</Alert>;
  if (!data.length) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-edge/50 p-6">
        <MessageCircle className="size-8 text-muted" aria-hidden />
        <p className="text-lg font-bold">Nenhuma conversa ainda</p>
        <p className="text-ink-soft">
          Quando você falar com um vizinho sobre um anúncio, a conversa aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
      {data.map((conversation) => (
        <li key={conversation.id}>
          <Link
            href={`/conversas/${conversation.id}`}
            className="flex items-center gap-3 p-3.5 transition-colors hover:bg-sand/60"
          >
            <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-sand">
              {conversation.ad.thumbUrl && (
                <Image
                  src={conversation.ad.thumbUrl}
                  alt=""
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span
                  className={cn("truncate", conversation.unread ? "font-extrabold" : "font-bold")}
                >
                  {conversation.other.name}
                </span>
                {conversation.lastMessage && (
                  <span className="shrink-0 text-[0.75rem] text-muted">
                    {timeAgo(conversation.lastMessage.createdAt)}
                  </span>
                )}
              </span>
              <span className="block truncate text-[0.82rem] text-muted">
                {conversation.ad.title}
              </span>
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "truncate text-[0.9rem]",
                    conversation.unread ? "font-semibold text-ink" : "text-ink-soft",
                  )}
                >
                  {conversation.lastMessage ? (
                    <>
                      {conversation.lastMessage.mine && "Você: "}
                      {conversation.lastMessage.body ?? (
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon className="size-3.5" aria-hidden /> Foto
                        </span>
                      )}
                    </>
                  ) : (
                    "Conversa iniciada"
                  )}
                </span>
                {conversation.unread > 0 && (
                  <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-[0.72rem] font-bold text-white">
                    {conversation.unread}
                    <span className="sr-only"> não lidas</span>
                  </span>
                )}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
