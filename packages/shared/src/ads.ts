import { z } from "zod";

/** Opções de raio de alcance de um anúncio, em km (RN-057). 0 = só o próprio prédio. */
export const AD_RADII_KM = [0, 0.5, 1, 2, 3, 5] as const;
export type AdRadiusKm = (typeof AD_RADII_KM)[number];

/** Raio máximo para quem ainda não tem selo de morador verificado (RN-059). */
export const UNVERIFIED_MAX_RADIUS_KM: AdRadiusKm = 1;

export const adTypeSchema = z.enum(["servico", "produto", "procura"]);
export type AdType = z.infer<typeof adTypeSchema>;

export const AD_TYPE_LABELS: Record<AdType, string> = {
  servico: "Serviço",
  produto: "Produto",
  procura: "Procuro",
};

export const adStatusSchema = z.enum([
  "rascunho",
  "em_moderacao",
  "ativo",
  "pausado",
  "expirado",
  "removido",
  "excluido",
]);
export type AdStatus = z.infer<typeof adStatusSchema>;

/** Disponibilidade do anunciante: lista fixa para o vizinho comparar anúncios de relance. */
export const adAvailabilitySchema = z.enum([
  "todos_os_dias",
  "dias_uteis",
  "fins_de_semana",
  "horario_comercial",
  "noites",
  "a_combinar",
]);
export type AdAvailability = z.infer<typeof adAvailabilitySchema>;

export const AD_AVAILABILITY_LABELS: Record<AdAvailability, string> = {
  todos_os_dias: "Todos os dias",
  dias_uteis: "Dias úteis (seg. a sex.)",
  fins_de_semana: "Fins de semana",
  horario_comercial: "Horário comercial",
  noites: "À noite",
  a_combinar: "A combinar",
};

export const priceModeSchema = z.enum(["fixo", "a_partir_de", "a_combinar", "gratuito"]);
export type PriceMode = z.infer<typeof priceModeSchema>;

export const PRICE_MODE_LABELS: Record<PriceMode, string> = {
  fixo: "Preço fixo",
  a_partir_de: "A partir de",
  a_combinar: "A combinar",
  gratuito: "Gratuito",
};

export const aiToneSchema = z.enum(["amigavel", "formal", "direto"]);
export type AiTone = z.infer<typeof aiToneSchema>;

export const AI_TONE_LABELS: Record<AiTone, string> = {
  amigavel: "Amigável",
  formal: "Formal",
  direto: "Direto",
};

export const adRadiusKmSchema = z.literal([...AD_RADII_KM]);

/** Raios permitidos para o anunciante, considerando prédio pendente (RN-028) e selo de verificado (RN-059). */
export function allowedRadii(options: {
  buildingVerified: boolean;
  residentVerified: boolean;
  radii?: readonly number[];
  unverifiedMaxKm?: number;
}): number[] {
  const radii = options.radii ?? AD_RADII_KM;
  if (!options.buildingVerified) return [0];
  if (options.residentVerified) return [...radii];
  const max = options.unverifiedMaxKm ?? UNVERIFIED_MAX_RADIUS_KM;
  return radii.filter((km) => km <= max);
}

export const MAX_AD_IMAGES = 6;

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  icon: z.string(),
});
export type Category = z.infer<typeof categorySchema>;

export const uploadedImageSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  thumbUrl: z.url(),
  width: z.number().int(),
  height: z.number().int(),
});
export type UploadedImage = z.infer<typeof uploadedImageSchema>;

export const tagsSchema = z
  .array(z.string().trim().toLowerCase().min(2).max(24))
  .max(8, "Use no máximo 8 tags")
  .transform((tags) => [...new Set(tags)]);

/** Campos editáveis de um anúncio (RN-052). */
export const adFieldsSchema = z
  .object({
    buildingId: z.uuid({ error: "Escolha o prédio" }),
    type: adTypeSchema,
    categoryId: z.uuid({ error: "Escolha uma categoria" }),
    title: z
      .string()
      .trim()
      .min(5, "O título precisa de pelo menos 5 caracteres")
      .max(80, "Use no máximo 80 caracteres"),
    description: z
      .string()
      .trim()
      .min(20, "Descreva com pelo menos 20 caracteres")
      .max(2000, "Use no máximo 2.000 caracteres"),
    priceMode: priceModeSchema,
    priceCents: z.number().int().min(0).max(100_000_000).nullable(),
    radiusKm: z.number().min(0).max(10),
    whatsappEnabled: z.boolean(),
    availability: adAvailabilitySchema.nullable(),
    tags: tagsSchema,
    imageIds: z.array(z.uuid()).max(MAX_AD_IMAGES, `Use no máximo ${MAX_AD_IMAGES} fotos`),
  })
  .superRefine((ad, ctx) => {
    if ((ad.priceMode === "fixo" || ad.priceMode === "a_partir_de") && ad.priceCents === null) {
      ctx.addIssue({ code: "custom", path: ["priceCents"], message: "Informe o preço" });
    }
  })
  .transform((ad) => ({
    ...ad,
    priceCents: ad.priceMode === "fixo" || ad.priceMode === "a_partir_de" ? ad.priceCents : null,
  }));

export const createAdInputSchema = adFieldsSchema.and(
  z.object({
    /** Rascunho de IA usado (métrica de anúncios criados com IA). */
    aiDraftId: z.uuid().nullable().optional(),
  }),
);
export type CreateAdInput = z.input<typeof createAdInputSchema>;
export type AdFields = z.output<typeof adFieldsSchema>;

export const updateAdInputSchema = adFieldsSchema;
export type UpdateAdInput = z.input<typeof updateAdInputSchema>;

/** Pedido de geração por IA (RN-053, RN-054). */
export const generateAdDraftInputSchema = z
  .object({
    text: z.string().trim().max(2000).default(""),
    imageIds: z.array(z.uuid()).max(MAX_AD_IMAGES).default([]),
    tone: aiToneSchema.default("amigavel"),
  })
  .refine((input) => input.text.length >= 3 || input.imageIds.length > 0, {
    message: "Escreva sobre o que quer anunciar ou envie uma foto",
    path: ["text"],
  });
export type GenerateAdDraftInput = z.input<typeof generateAdDraftInputSchema>;

export const improveTextInputSchema = z.object({
  title: z.string().trim().max(80).default(""),
  description: z.string().trim().min(10, "Escreva um pouco mais para a IA melhorar").max(2000),
  tone: aiToneSchema.default("amigavel"),
});
export type ImproveTextInput = z.input<typeof improveTextInputSchema>;

export const adDraftSchema = z.object({
  draftId: z.uuid(),
  title: z.string(),
  description: z.string(),
  type: adTypeSchema.nullable(),
  categoryId: z.uuid().nullable(),
  priceMode: priceModeSchema.nullable(),
  priceCents: z.number().int().nullable(),
  tags: z.array(z.string()),
  availability: adAvailabilitySchema.nullable(),
  /** Campos que a IA não pôde inferir e o usuário deve confirmar (RN-056). */
  toConfirm: z.array(z.string()),
  /** Avisos (ex.: conteúdo possivelmente proibido). */
  warnings: z.array(z.string()),
  coverImageId: z.uuid().nullable(),
  remainingToday: z.number().int(),
});
export type AdDraft = z.infer<typeof adDraftSchema>;

export const improvedTextSchema = z.object({
  title: z.string(),
  description: z.string(),
  remainingToday: z.number().int(),
});
export type ImprovedText = z.infer<typeof improvedTextSchema>;

export const adImageSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  thumbUrl: z.url(),
  width: z.number().int(),
  height: z.number().int(),
});

/** Anúncio visto pelo dono (gestão em "Meus anúncios"). */
export const myAdSchema = z.object({
  id: z.uuid(),
  buildingId: z.uuid(),
  buildingName: z.string(),
  type: adTypeSchema,
  category: categorySchema,
  title: z.string(),
  description: z.string(),
  priceMode: priceModeSchema,
  priceCents: z.number().int().nullable(),
  radiusKm: z.number(),
  whatsappEnabled: z.boolean(),
  availability: adAvailabilitySchema.nullable(),
  tags: z.array(z.string()),
  images: z.array(adImageSchema),
  status: adStatusSchema,
  statusReason: z.string().nullable(),
  aiGenerated: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  bumpedAt: z.iso.datetime().nullable(),
  canBumpAt: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  stats: z.object({ favorites: z.number().int(), conversations: z.number().int() }),
});
export type MyAd = z.infer<typeof myAdSchema>;

/** Limites e opções que o formulário de anúncio precisa conhecer. */
export const adFormOptionsSchema = z.object({
  categories: z.array(categorySchema),
  buildings: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      allowedRadiiKm: z.array(z.number()),
      buildingVerified: z.boolean(),
      residentVerified: z.boolean(),
    }),
  ),
  activeAds: z.number().int(),
  maxActiveAds: z.number().int(),
  aiEnabled: z.boolean(),
  aiRemainingToday: z.number().int(),
  hasPhone: z.boolean(),
  canPublish: z.boolean(),
  cannotPublishReason: z.string().nullable(),
});
export type AdFormOptions = z.infer<typeof adFormOptionsSchema>;

export function formatPrice(mode: PriceMode, cents: number | null): string {
  if (mode === "gratuito") return "Gratuito";
  if (mode === "a_combinar" || cents === null) return "A combinar";
  const value = (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
  return mode === "a_partir_de" ? `A partir de ${value}` : value;
}
