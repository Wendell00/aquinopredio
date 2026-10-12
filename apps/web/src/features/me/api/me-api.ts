import {
  type CompleteProfileInput,
  type Me,
  meSchema,
  type UpdateProfileInput,
} from "@repo/shared";
import { api } from "@/lib/api/client";

export async function getMe(): Promise<Me> {
  return meSchema.parse(await api.get("me").json());
}

export async function completeProfile(input: CompleteProfileInput): Promise<Me> {
  return meSchema.parse(await api.post("me/profile", { json: input }).json());
}

export async function updateProfile(input: UpdateProfileInput): Promise<Me> {
  return meSchema.parse(await api.patch("me", { json: input }).json());
}
