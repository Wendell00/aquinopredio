import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BillingModule } from "../billing/billing.module";
import { Ad, AdImage, AdModeration, AdModerationRun, AiAdDraft, Category } from "./ad.entity";
import { AdDraftsService } from "./ad-drafts.service";
import { AdsController, CategoriesController } from "./ads.controller";
import { AdsScheduler } from "./ads.scheduler";
import { AdsService } from "./ads.service";
import { AdModerationService } from "./moderation/ad-moderation.service";
import { AdModerationRunsService } from "./moderation/ad-moderation-runs.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Ad, AdImage, Category, AiAdDraft, AdModeration, AdModerationRun]),
    BillingModule,
  ],
  controllers: [CategoriesController, AdsController],
  providers: [
    AdsService,
    AdDraftsService,
    AdModerationService,
    AdModerationRunsService,
    AdsScheduler,
  ],
  exports: [AdsService, AdModerationService, TypeOrmModule],
})
export class AdsModule {}
