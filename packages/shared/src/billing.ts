import { z } from "zod";

/** Planos do anunciante (RN-140 a RN-145). */
export const planSchema = z.enum(["free", "pro"]);
export type Plan = z.infer<typeof planSchema>;

export const PLAN_LABELS: Record<Plan, string> = { free: "Free", pro: "Pro" };

/** Limites de cada plano. Os valores reais vêm das configurações da API; estes são os padrões. */
export const planLimitsSchema = z.object({
  maxRadiusKm: z.number(),
  featuredAds: z.number().int(),
  /** Dias até o anúncio sair do ar; nulo = não expira enquanto o plano durar. */
  adActiveDays: z.number().int().nullable(),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

/** Situação da assinatura vista pelo próprio usuário. */
export const billingStatusSchema = z.object({
  plan: planSchema,
  /** Falso quando o pagamento não está configurado neste ambiente. */
  checkoutEnabled: z.boolean(),
  proPriceCents: z.number().int(),
  limits: z.object({ free: planLimitsSchema, pro: planLimitsSchema }),
  subscription: z
    .object({
      status: z.string(),
      currentPeriodEnd: z.iso.datetime().nullable(),
      cancelAtPeriodEnd: z.boolean(),
    })
    .nullable(),
});
export type BillingStatus = z.infer<typeof billingStatusSchema>;

export const redirectUrlSchema = z.object({ url: z.url() });
export type RedirectUrl = z.infer<typeof redirectUrlSchema>;
