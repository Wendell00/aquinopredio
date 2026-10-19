import { z } from "zod";
import {
  adAvailabilitySchema,
  adImageSchema,
  adTypeSchema,
  categorySchema,
  priceModeSchema,
} from "./ads";
import { ratingSummarySchema, recommendationSchema } from "./reviews";

/** Faixas de distância do filtro (RN-072). 0 = só meu prédio. */
export const FEED_DISTANCES_KM = [0, 1, 3, 5, 10] as const;

const optionalBool = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1")
  .optional();

export const feedQuerySchema = z.object({
  buildingId: z.uuid().optional(),
  type: adTypeSchema.optional(),
  categoryId: z.uuid().optional(),
  distanceKm: z.coerce
    .number()
    .refine((km) => (FEED_DISTANCES_KM as readonly number[]).includes(km), "Distância inválida")
    .optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  verifiedOnly: optionalBool,
  q: z.string().trim().min(2).max(80).optional(),
  cursor: z.coerce.number().int().min(0).max(10_000).optional(),
});
export type FeedQuery = z.input<typeof feedQuerySchema>;

/** Card do feed (RN-073): sem endereço, só nome do prédio e distância aproximada (RN-034). */
export const feedAdSchema = z.object({
  id: z.uuid(),
  type: adTypeSchema,
  title: z.string(),
  priceMode: priceModeSchema,
  priceCents: z.number().int().nullable(),
  cover: adImageSchema.nullable(),
  category: categorySchema,
  sameBuilding: z.boolean(),
  buildingName: z.string(),
  distanceM: z.number().int().nullable(),
  sellerVerified: z.boolean(),
  publishedAt: z.iso.datetime(),
  favorited: z.boolean(),
  /** Anúncio do próprio leitor (RN-074): aparece no feed, mas sem favoritar. */
  isMine: z.boolean(),
  /** Destaque do plano Pro, fixado no topo (RN-144). */
  featured: z.boolean(),
});
export type FeedAd = z.infer<typeof feedAdSchema>;

export const feedPageSchema = z.object({
  items: z.array(feedAdSchema),
  nextCursor: z.number().int().nullable(),
  building: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Motivo de o feed estar vazio por regra (ex.: vínculo pendente). */
  notice: z.string().nullable(),
});
export type FeedPage = z.infer<typeof feedPageSchema>;

/** Dados públicos do anunciante (RN-130): nunca unidade, telefone, e-mail ou endereço. */
export const publicUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  username: z.string().nullable(),
  image: z.string().nullable(),
  verified: z.boolean(),
  memberSince: z.iso.datetime(),
  /** Avaliações recebidas como anunciante (RN-087). */
  rating: ratingSummarySchema,
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const adDetailSchema = z.object({
  id: z.uuid(),
  type: adTypeSchema,
  category: categorySchema,
  title: z.string(),
  description: z.string(),
  priceMode: priceModeSchema,
  priceCents: z.number().int().nullable(),
  availability: adAvailabilitySchema.nullable(),
  tags: z.array(z.string()),
  images: z.array(adImageSchema),
  status: z.string(),
  building: z.object({
    name: z.string(),
    district: z.string(),
    sameBuilding: z.boolean(),
    distanceM: z.number().int().nullable(),
  }),
  seller: publicUserSchema,
  /** Vizinhos que indicam este anúncio (RN-086). */
  recommendation: recommendationSchema,
  whatsappEnabled: z.boolean(),
  favorited: z.boolean(),
  isOwner: z.boolean(),
  blocked: z.boolean(),
  publishedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
});
export type AdDetail = z.infer<typeof adDetailSchema>;

export const reportTargetSchema = z.enum(["ad", "user", "message", "building", "referral"]);
export const reportReasonSchema = z.enum([
  "golpe",
  "conteudo_improprio",
  "spam",
  "item_proibido",
  "outro",
]);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  golpe: "Golpe ou fraude",
  conteudo_improprio: "Conteúdo impróprio",
  spam: "Spam ou repetido",
  item_proibido: "Item ou serviço proibido",
  outro: "Outro motivo",
};

export const createReportInputSchema = z
  .object({
    targetType: reportTargetSchema,
    targetId: z.uuid(),
    reason: reportReasonSchema,
    details: z.string().trim().max(500).optional(),
  })
  .refine((input) => input.reason !== "outro" || (input.details?.length ?? 0) >= 5, {
    path: ["details"],
    message: "Conte o que aconteceu",
  });
export type CreateReportInput = z.input<typeof createReportInputSchema>;

export const blockedUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  image: z.string().nullable(),
  blockedAt: z.iso.datetime(),
});
export type BlockedUser = z.infer<typeof blockedUserSchema>;
