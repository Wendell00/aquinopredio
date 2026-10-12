import type { ConversationDetail } from "@repo/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatThread } from "@/features/chat/components/chat-thread";
import { serverGet } from "@/lib/api/server";
import { getPublicConfig } from "@/lib/session/get-me";

export const metadata: Metadata = { title: "Conversa — Aqui no Prédio", robots: { index: false } };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [conversation, config] = await Promise.all([
    serverGet<ConversationDetail>(`/conversations/${id}`).catch(() => null),
    getPublicConfig(),
  ]);
  if (!conversation) notFound();
  return <ChatThread initial={conversation} config={config} />;
}
