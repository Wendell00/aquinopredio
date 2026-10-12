import {
  type AdDetail,
  adDetailSchema,
  type BlockedUser,
  blockedUserSchema,
  type CreateReportInput,
  type FeedAd,
  type FeedPage,
  type FeedQuery,
  feedAdSchema,
  feedPageSchema,
} from "@repo/shared";
import { z } from "zod";
import { api } from "@/lib/api/client";

export async function getFeed(query: FeedQuery): Promise<FeedPage> {
  const searchParams = Object.fromEntries(
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return feedPageSchema.parse(await api.get("feed", { searchParams }).json());
}

export async function getAdDetail(id: string): Promise<AdDetail> {
  return adDetailSchema.parse(await api.get(`ads/${id}`).json());
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  if (favorite) await api.put(`ads/${id}/favorite`);
  else await api.delete(`ads/${id}/favorite`);
}

export async function getFavorites(): Promise<FeedAd[]> {
  return z.array(feedAdSchema).parse(await api.get("me/favorites").json());
}

export async function getWhatsappLink(id: string): Promise<string> {
  const { url } = z.object({ url: z.url() }).parse(await api.get(`ads/${id}/whatsapp`).json());
  return url;
}

export async function blockUser(id: string): Promise<void> {
  await api.post(`users/${id}/block`);
}

export async function unblockUser(id: string): Promise<void> {
  await api.delete(`users/${id}/block`);
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  return z.array(blockedUserSchema).parse(await api.get("me/blocks").json());
}

export async function report(input: CreateReportInput): Promise<void> {
  await api.post("reports", { json: input });
}
