import {
  type CreateReferralInput,
  type Referral,
  type ReferralPage,
  type ReferralQuery,
  referralPageSchema,
  referralSchema,
} from "@repo/shared";
import { api } from "@/lib/api/client";

export async function getReferrals(query: ReferralQuery): Promise<ReferralPage> {
  const searchParams = Object.fromEntries(
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return referralPageSchema.parse(await api.get("referrals", { searchParams }).json());
}

export async function createReferral(input: CreateReferralInput): Promise<Referral> {
  return referralSchema.parse(await api.post("referrals", { json: input }).json());
}

export async function deleteReferral(id: string): Promise<void> {
  await api.delete(`referrals/${id}`);
}
