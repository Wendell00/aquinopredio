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
  type AdDetail,
  type BlockedUser,
  type CreateReportInput,
  createReportInputSchema,
  type FeedAd,
  type FeedPage,
  type FeedQuery,
  feedQuerySchema,
} from "@repo/shared";
import { CurrentUser } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { User } from "../users/user.entity";
import { FeedService } from "./feed.service";
import { InteractionsService } from "./interactions.service";

@Controller()
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly interactions: InteractionsService,
  ) {}

  @Get("feed")
  list(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(feedQuerySchema)) query: FeedQuery,
  ): Promise<FeedPage> {
    return this.feed.feed(user, query);
  }

  @Get("ads/:id")
  detail(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<AdDetail> {
    return this.feed.detail(user, id);
  }

  @Get("ads/:id/whatsapp")
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  whatsapp(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ url: string }> {
    return this.interactions.whatsappLink(user, id);
  }

  @Put("ads/:id/favorite")
  @HttpCode(204)
  async favorite(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.interactions.favorite(user, id);
  }

  @Delete("ads/:id/favorite")
  @HttpCode(204)
  async unfavorite(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.interactions.unfavorite(user, id);
  }

  @Get("me/favorites")
  favorites(@CurrentUser() user: User): Promise<FeedAd[]> {
    return this.feed.favorites(user);
  }

  @Post("users/:id/block")
  @HttpCode(204)
  async block(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.interactions.block(user, id);
  }

  @Delete("users/:id/block")
  @HttpCode(204)
  async unblock(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.interactions.unblock(user, id);
  }

  @Get("me/blocks")
  blocks(@CurrentUser() user: User): Promise<BlockedUser[]> {
    return this.interactions.blocked(user);
  }

  @Post("reports")
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  async report(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createReportInputSchema)) input: CreateReportInput,
  ): Promise<void> {
    await this.interactions.report(user, input);
  }
}
