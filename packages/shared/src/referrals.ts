import { z } from "zod";
import { phoneSchema } from "./users";

export const REFERRAL_SERVICE_MAX = 300;

/**
 * Indicação de prestador de fora do app (RN-089): o morador conta o que a pessoa faz, o nome e o
 * telefone. Como são dados de terceiro, quem indica declara que a pessoa autorizou a divulgação.
 */
export const createReferralInputSchema = z.object({
  service: z
    .string()
    .trim()
    .min(10, "Conte em poucas palavras o que a pessoa faz")
    .max(REFERRAL_SERVICE_MAX, `Use no máximo ${REFERRAL_SERVICE_MAX} caracteres`),
  providerName: z
    .string()
    .trim()
    .min(2, "Informe o nome de quem presta o serviço")
    .max(60, "Use no máximo 60 caracteres"),
  providerPhone: phoneSchema,
  /** Prédio a partir do qual a indicação aparece; sem ele, vale o prédio principal. */
  buildingId: z.uuid().optional(),
  providerConsent: z.literal(true, {
    error: "Confirme que a pessoa autorizou compartilhar o contato",
  }),
});
export type CreateReferralInput = z.input<typeof createReferralInputSchema>;

export const referralQuerySchema = z.object({
  buildingId: z.uuid().optional(),
  q: z.string().trim().min(2).max(80).optional(),
  cursor: z.coerce.number().int().min(0).max(10_000).optional(),
});
export type ReferralQuery = z.input<typeof referralQuerySchema>;

export const referralSchema = z.object({
  id: z.uuid(),
  service: z.string(),
  providerName: z.string(),
  /** E.164 (+55…). */
  providerPhone: z.string(),
  author: z.object({ name: z.string(), username: z.string().nullable() }),
  sameBuilding: z.boolean(),
  buildingName: z.string(),
  createdAt: z.iso.datetime(),
  isMine: z.boolean(),
});
export type Referral = z.infer<typeof referralSchema>;

export const referralPageSchema = z.object({
  items: z.array(referralSchema),
  nextCursor: z.number().int().nullable(),
});
export type ReferralPage = z.infer<typeof referralPageSchema>;

/** (11) 98765-4321 a partir de +5511987654321. */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "").replace(/^55/, "");
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  const split = rest.length === 9 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}
