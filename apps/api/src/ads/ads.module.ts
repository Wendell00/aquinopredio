import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConditionalModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BillingModule } from "../billing/billing.module";
import { Ad, AdImage, AdModeration, AiAdDraft, Category } from "./ad.entity";
import { AdDraftsService } from "./ad-drafts.service";
import { AdsController, CategoriesController } from "./ads.controller";
import { AdsService } from "./ads.service";
import { AdsWorkersModule } from "./ads-workers.module";
import { AdModerationService } from "./moderation/ad-moderation.service";
import { AD_MODERATION_QUEUE } from "./moderation/moderation.queue";

@Module({
  imports: [
    TypeOrmModule.forFeature([Ad, AdImage, Category, AiAdDraft, AdModeration]),
    BullModule.registerQueue({ name: AD_MODERATION_QUEUE }),
    BillingModule,
    ConditionalModule.registerWhen(AdsWorkersModule, (env) => env.WORKERS_ENABLED !== "false"),
  ],
  controllers: [CategoriesController, AdsController],
  // AdModerationService também fica aqui para uso direto (revisão manual pelo admin, testes).
  // O AdsScheduler (@Cron) fica só no módulo de workers, para não rodar em réplicas só de HTTP.
  providers: [AdsService, AdDraftsService, AdModerationService],
  exports: [AdsService, AdModerationService, TypeOrmModule],
})
export class AdsModule {}
