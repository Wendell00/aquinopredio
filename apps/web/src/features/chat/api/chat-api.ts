import {
  type ConversationDetail,
  type ConversationSummary,
  conversationDetailSchema,
  conversationSummarySchema,
  type Message,
  messageSchema,
  type SendMessageInput,
} from "@repo/shared";
import { z } from "zod";
import { api } from "@/lib/api/client";

export async function startConversation(adId: string): Promise<ConversationDetail> {
  return conversationDetailSchema.parse(await api.post(`ads/${adId}/conversations`).json());
}

export async function getConversations(): Promise<ConversationSummary[]> {
  return z.array(conversationSummarySchema).parse(await api.get("conversations").json());
}

export async function getConversation(
  id: string,
  params: { after?: string; before?: string } = {},
): Promise<ConversationDetail> {
  const searchParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value),
  ) as Record<string, string>;
  return conversationDetailSchema.parse(
    await api.get(`conversations/${id}`, { searchParams }).json(),
  );
}

export async function sendMessage(id: string, input: SendMessageInput): Promise<Message> {
  return messageSchema.parse(
    await api.post(`conversations/${id}/messages`, { json: input, retry: 0 }).json(),
  );
}

export async function markConversationRead(id: string): Promise<void> {
  await api.post(`conversations/${id}/read`);
}
