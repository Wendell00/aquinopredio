import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type AdDraft,
  type AdFormOptions,
  type Category,
  type CreateAdInput,
  createAdInputSchema,
  type GenerateAdDraftInput,
  generateAdDraftInputSchema,
  type ImprovedText,
  type ImproveTextInput,
  improveTextInputSchema,
  type MyAd,
  type UpdateAdInput,
  updateAdInputSchema,
} from "@repo/shared";
import { CurrentUser, Public } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { User } from "../users/user.entity";
import { AdDraftsService } from "./ad-drafts.service";
import { AdsService } from "./ads.service";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  @Public()
  async list(): Promise<Category[]> {
    return (await this.ads.listCategories()).map(({ id, name, slug, icon }) => ({
      id,
      name,
      slug,
      icon,
    }));
  }
}

@Controller("ads")
export class AdsController {
  constructor(
    private readonly ads: AdsService,
    private readonly drafts: AdDraftsService,
  ) {}

  @Get("form-options")
  formOptions(@CurrentUser() user: User): Promise<AdFormOptions> {
    return this.ads.formOptions(user);
  }

  @Post("ai-drafts")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  generate(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(generateAdDraftInputSchema)) input: GenerateAdDraftInput,
  ): Promise<AdDraft> {
    return this.drafts.generate(user, input);
  }

  @Post("improve-text")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  improve(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(improveTextInputSchema)) input: ImproveTextInput,
  ): Promise<ImprovedText> {
    return this.drafts.improve(user, input);
  }

  @Get("mine")
  mine(@CurrentUser() user: User): Promise<MyAd[]> {
    return this.ads.listMine(user.id);
  }

  @Get("mine/:id")
  getMine(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<MyAd> {
    return this.ads.getMine(user.id, id);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createAdInputSchema)) input: CreateAdInput,
  ): Promise<MyAd> {
    return this.ads.create(user, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAdInputSchema)) input: UpdateAdInput,
  ): Promise<MyAd> {
    return this.ads.update(user, id, input);
  }

  @Post(":id/pause")
  @HttpCode(200)
  pause(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<MyAd> {
    return this.ads.pause(user, id);
  }

  @Post(":id/resume")
  @HttpCode(200)
  resume(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<MyAd> {
    return this.ads.resume(user, id);
  }

  @Post(":id/renew")
  @HttpCode(200)
  renew(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<MyAd> {
    return this.ads.renew(user, id);
  }

  @Post(":id/bump")
  @HttpCode(200)
  bump(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<MyAd> {
    return this.ads.bump(user, id);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.ads.remove(user, id);
  }
}
