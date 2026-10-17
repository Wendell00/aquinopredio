import {
  type Recommendation,
  type Review,
  recommendationSchema,
  reviewSchema,
  type UpsertReviewInput,
  type UserReviews,
  userReviewsSchema,
} from "@repo/shared";
import { api } from "@/lib/api/client";

/** Indicar (ou deixar de indicar) um anúncio (RN-086). */
export async function setRecommended(adId: string, recommended: boolean): Promise<Recommendation> {
  const request = recommended
    ? api.post(`ads/${adId}/recommend`)
    : api.delete(`ads/${adId}/recommend`);
  return recommendationSchema.parse(await request.json());
}

export async function getUserReviews(userId: string): Promise<UserReviews> {
  return userReviewsSchema.parse(await api.get(`users/${userId}/reviews`).json());
}

export async function saveReview(userId: string, input: UpsertReviewInput): Promise<Review> {
  return reviewSchema.parse(await api.put(`users/${userId}/review`, { json: input }).json());
}

export async function deleteReview(userId: string): Promise<void> {
  await api.delete(`users/${userId}/review`);
}
