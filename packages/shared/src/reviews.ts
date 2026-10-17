import { z } from "zod";

export const REVIEW_COMMENT_MAX = 500;

/** Avaliação do anunciante por quem conversou com ele (RN-087). */
export const upsertReviewInputSchema = z.object({
  rating: z.number().int().min(1, "Escolha de 1 a 5 estrelas").max(5, "Escolha de 1 a 5 estrelas"),
  comment: z
    .string()
    .trim()
    .max(REVIEW_COMMENT_MAX, `Use no máximo ${REVIEW_COMMENT_MAX} caracteres`)
    .nullable()
    .transform((value) => value || null),
});
export type UpsertReviewInput = z.input<typeof upsertReviewInputSchema>;

export const ratingSummarySchema = z.object({
  /** Média com 1 casa; nula sem avaliações. */
  average: z.number().nullable(),
  count: z.number().int(),
});
export type RatingSummary = z.infer<typeof ratingSummarySchema>;

export const reviewSchema = z.object({
  id: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  reviewer: z.object({ name: z.string(), username: z.string().nullable() }),
  /** Título do anúncio sobre o qual conversaram, se ainda existir. */
  adTitle: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  isMine: z.boolean(),
});
export type Review = z.infer<typeof reviewSchema>;

export const userReviewsSchema = z.object({
  summary: ratingSummarySchema,
  items: z.array(reviewSchema),
  /** Pode avaliar: conversou com a pessoa e ela respondeu (RN-087). */
  canReview: z.boolean(),
  myReview: reviewSchema.nullable(),
});
export type UserReviews = z.infer<typeof userReviewsSchema>;

export const recommendationSchema = z.object({
  count: z.number().int(),
  recommendedByMe: z.boolean(),
});
export type Recommendation = z.infer<typeof recommendationSchema>;
