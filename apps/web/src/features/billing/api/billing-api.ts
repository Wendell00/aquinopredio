import {
  type BillingStatus,
  billingStatusSchema,
  type RedirectUrl,
  redirectUrlSchema,
} from "@repo/shared";
import { api } from "@/lib/api/client";

export async function getBillingStatus(): Promise<BillingStatus> {
  return billingStatusSchema.parse(await api.get("billing").json());
}

/** Sessão do Stripe Checkout para assinar o Pro. */
export async function startCheckout(): Promise<RedirectUrl> {
  return redirectUrlSchema.parse(await api.post("billing/checkout").json());
}

/** Portal do cliente no Stripe (cartão, notas, cancelamento). */
export async function openPortal(): Promise<RedirectUrl> {
  return redirectUrlSchema.parse(await api.post("billing/portal").json());
}
