import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type Recommendation,
  type Review,
  type UpsertReviewInput,
  type UserReviews,
  upsertReviewInputSchema,
} from "@repo/shared";
import { CurrentUser } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { User } from "../users/user.entity";
import { ReviewsService } from "./reviews.service";

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post("ads/:id/recommend")
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60 * 60_000 } })
  recommend(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) adId: string,
  ): Promise<Recommendation> {
    return this.reviews.recommend(user, adId);
  }

  @Delete("ads/:id/recommend")
  @HttpCode(200)
  unrecommend(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) adId: string,
  ): Promise<Recommendation> {
    return this.reviews.unrecommend(user, adId);
  }

  @Get("users/:id/reviews")
  list(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) reviewedId: string,
    @Query("offset") offset?: string,
  ): Promise<UserReviews> {
    return this.reviews.list(user, reviewedId, Number(offset) || 0);
  }

  @Put("users/:id/review")
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  upsert(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) reviewedId: string,
    @Body(new ZodValidationPipe(upsertReviewInputSchema)) input: UpsertReviewInput,
  ): Promise<Review> {
    return this.reviews.upsert(user, reviewedId, input);
  }

  @Delete("users/:id/review")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) reviewedId: string,
  ): Promise<void> {
    await this.reviews.remove(user, reviewedId);
  }
}
