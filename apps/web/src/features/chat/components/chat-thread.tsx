"use client";

import type { ConversationDetail, Message, PublicConfig } from "@repo/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Flag, ImagePlus, Loader2, SendHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadAdImage } from "@/features/ads/api/ads-api";
import { ReportDialog } from "@/features/feed/components/report-dialog";
import { unreadKey } from "@/features/notifications/hooks/use-unread";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { getConversation, markConversationRead, sendMessage } from "../api/chat-api";
import { useRealtimeConnected } from "../hooks/use-realtime-connected";
import { PushPrompt } from "./push-prompt";

const dayLabel = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
};
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function Bubble({ message }: { message: Message }): React.JSX.Element {
  return (
    <div className={cn("group flex flex-col gap-1", message.mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-[0.95rem] leading-snug",
          message.mine
            ? "rounded-br-md bg-brand text-white"
            : "rounded-bl-md border border-line bg-white text-ink",
        )}
      >
        {message.image && (
          <a
            href={message.image.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-1 block"
          >
            <Image
              src={message.image.thumbUrl}
              alt="Foto enviada na conversa"
              width={220}
              height={220}
              className="h-auto max-h-56 w-56 rounded-xl object-cover"
            />
          </a>
        )}
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
      </div>
      {!message.mine && (message.hasLink || message.flagged) && (
        <p className="flex max-w-[80%] items-start gap-1.5 text-[0.78rem] text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {message.flagged
            ? "Cuidado: esta mensagem parece um golpe comum. Nunca compartilhe códigos nem pague adiantado."
            : "Esta mensagem tem um link externo. Só abra se confiar na pessoa."}
        </p>
      )}
      <span className="flex items-center gap-2 px-1 text-[0.7rem] text-muted">
        {timeLabel(message.createdAt)}
        {message.mine && message.readAt && <span>Lida</span>}
        {!message.mine && message.senderName === null && "Usuário removido"}
        {!message.mine && message.senderName && (
          <ReportDialog
            targetType="message"
            targetId={message.id}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                aria-label="Denunciar mensagem"
              >
                <Flag className="size-3" aria-hidden />
              </button>
            )}
          />
        )}
      </span>
    </div>
  );
}

export function ChatThread({
  initial,
  config,
}: {
  initial: ConversationDetail;
  config: PublicConfig;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const realtime = useRealtimeConnected();
  const key = ["conversations", initial.id];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getConversation(initial.id),
    initialData: initial,
    // Com o Supabase Realtime conectado, o aviso dispara o refetch e o polling vira rede de segurança;
    // sem ele, polling curto enquanto a conversa está aberta (o push avisa com o app fechado).
    refetchInterval: realtime ? 60_000 : 4_000,
    refetchIntervalInBackground: false,
  });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const closed = data.status === "bloqueada" || data.other.id === null;

  const lastIncoming = [...data.messages].reverse().find((message) => !message.mine)?.id;
  useEffect(() => {
    if (!lastIncoming) return;
    void markConversationRead(initial.id).then(() =>
      queryClient.invalidateQueries({ queryKey: unreadKey }),
    );
  }, [lastIncoming, initial.id, queryClient]);

  const count = data.messages.length;
  useEffect(() => {
    if (count) bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);

  async function send(payload: { body?: string; imageId?: string }): Promise<void> {
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      mine: true,
      senderName: null,
      body: payload.body ?? null,
      image: null,
      hasLink: false,
      flagged: false,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    queryClient.setQueryData<ConversationDetail>(key, (current) =>
      current && payload.body
        ? { ...current, messages: [...current.messages, optimistic] }
        : current,
    );
    try {
      await sendMessage(initial.id, payload);
      setSentOnce(true);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Mensagem não enviada. Tente de novo.",
      );
      queryClient.setQueryData<ConversationDetail>(key, (current) =>
        current
          ? {
              ...current,
              messages: current.messages.filter((message) => message.id !== optimistic.id),
            }
          : current,
      );
      if (payload.body) setText(payload.body);
    } finally {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  async function submit(event?: React.FormEvent): Promise<void> {
    event?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    await send({ body });
    setSending(false);
  }

  async function attach(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const image = await uploadAdImage(file, "chat");
      await send({ imageId: image.id });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  let lastDay = "";
  return (
    <div className="mx-auto flex h-[calc(100dvh-4.5rem)] max-w-[44rem] flex-col lg:h-dvh">
      <header className="flex items-center gap-3 border-b border-line bg-cream/95 px-4 py-3 backdrop-blur-md">
        <Link
          href="/conversas"
          className="grid size-10 place-items-center rounded-full hover:bg-sand"
          aria-label="Voltar para conversas"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{data.other.name}</p>
          <Link
            href={`/anuncios/${data.ad.id}`}
            className="block truncate text-[0.82rem] text-ink-soft hover:underline"
          >
            {data.ad.title}
            {!data.ad.active && " (anúncio fora do ar)"}
          </Link>
        </div>
        {data.ad.thumbUrl && (
          <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-sand">
            <Image src={data.ad.thumbUrl} alt="" fill sizes="44px" className="object-cover" />
          </span>
        )}
      </header>

      <section
        className="flex-1 overflow-y-auto px-4 py-4"
        aria-live="polite"
        aria-label="Mensagens"
      >
        {data.messages.length === 0 && (
          <p className="mx-auto mt-10 max-w-[18rem] text-center text-ink-soft">
            Diga oi e conte o que você precisa.{" "}
            {data.role === "comprador" && "O anunciante recebe um aviso."}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {data.messages.map((message) => {
            const day = dayLabel(message.createdAt);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={message.id} className="flex flex-col gap-2">
                {showDay && (
                  <p className="my-2 text-center text-[0.75rem] font-semibold text-muted">{day}</p>
                )}
                <Bubble message={message} />
              </div>
            );
          })}
        </div>
        {sentOnce && config.vapidPublicKey && <PushPrompt vapidPublicKey={config.vapidPublicKey} />}
        <div ref={bottom} />
      </section>

      {closed ? (
        <p className="border-t border-line bg-sand px-4 py-4 text-center text-sm text-ink-soft">
          Esta conversa foi encerrada.
        </p>
      ) : (
        <form
          onSubmit={submit}
          className="flex items-end gap-2 border-t border-line bg-cream px-3 py-3"
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            id="chat-photo"
            onChange={(event) => void attach(event.target.files)}
          />
          <label
            htmlFor="chat-photo"
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-ink-soft hover:bg-sand"
            aria-label="Enviar foto"
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-5" aria-hidden />
            )}
          </label>
          <label htmlFor="chat-input" className="sr-only">
            Mensagem
          </label>
          <textarea
            id="chat-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) void submit(event);
            }}
            rows={1}
            maxLength={2000}
            placeholder="Escreva uma mensagem"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-edge bg-white px-4 py-2.5 text-[0.95rem] focus:border-brand focus:outline-none [field-sizing:content]"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim()}
            loading={sending}
            aria-label="Enviar"
          >
            {!sending && <SendHorizontal className="size-5" aria-hidden />}
          </Button>
        </form>
      )}
    </div>
  );
}
