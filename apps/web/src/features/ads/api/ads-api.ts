import {
  type AdDraft,
  type AdFormOptions,
  adDraftSchema,
  adFormOptionsSchema,
  type CreateAdInput,
  type GenerateAdDraftInput,
  type ImprovedText,
  type ImproveTextInput,
  improvedTextSchema,
  type MyAd,
  myAdSchema,
  type UpdateAdInput,
  type UploadedImage,
  uploadedImageSchema,
} from "@repo/shared";
import { z } from "zod";
import { api } from "@/lib/api/client";
import { compressImage } from "@/lib/image/compress";

export async function getAdFormOptions(): Promise<AdFormOptions> {
  return adFormOptionsSchema.parse(await api.get("ads/form-options").json());
}

export async function uploadAdImage(
  file: File,
  purpose: "ad" | "chat" | "avatar" = "ad",
): Promise<UploadedImage> {
  const body = new FormData();
  body.append("file", await compressImage(file), file.name.replace(/\.\w+$/, ".jpg"));
  // Upload pode demorar em 4G: timeout maior e sem retry automático.
  const response = await api.post("uploads/images", {
    body,
    searchParams: { purpose },
    timeout: 60_000,
    retry: 0,
  });
  return uploadedImageSchema.parse(await response.json());
}

export async function generateAdDraft(input: GenerateAdDraftInput): Promise<AdDraft> {
  return adDraftSchema.parse(
    await api.post("ads/ai-drafts", { json: input, timeout: 45_000, retry: 0 }).json(),
  );
}

export async function improveAdText(input: ImproveTextInput): Promise<ImprovedText> {
  return improvedTextSchema.parse(
    await api.post("ads/improve-text", { json: input, timeout: 45_000, retry: 0 }).json(),
  );
}

export async function createAd(input: CreateAdInput): Promise<MyAd> {
  return myAdSchema.parse(await api.post("ads", { json: input }).json());
}

export async function updateAd(id: string, input: UpdateAdInput): Promise<MyAd> {
  return myAdSchema.parse(await api.patch(`ads/${id}`, { json: input }).json());
}

export async function getMyAds(): Promise<MyAd[]> {
  return z.array(myAdSchema).parse(await api.get("ads/mine").json());
}

export async function getMyAd(id: string): Promise<MyAd> {
  return myAdSchema.parse(await api.get(`ads/mine/${id}`).json());
}

export type AdAction = "pause" | "resume" | "renew" | "bump";

export async function runAdAction(id: string, action: AdAction): Promise<MyAd> {
  return myAdSchema.parse(await api.post(`ads/${id}/${action}`).json());
}

/** Destaque do plano Pro (RN-144). */
export async function setFeatured(id: string, featured: boolean): Promise<MyAd> {
  const request = featured ? api.post(`ads/${id}/feature`) : api.delete(`ads/${id}/feature`);
  return myAdSchema.parse(await request.json());
}

export async function deleteAd(id: string): Promise<void> {
  await api.delete(`ads/${id}`);
}
