import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Ad, AdModeration } from "./ad.entity";
import { AdsScheduler } from "./ads.scheduler";
import { AdModerationProcessor } from "./moderation/ad-moderation.processor";
import { AdModerationService } from "./moderation/ad-moderation.service";
import { AD_MODERATION_QUEUE } from "./moderation/moderation.queue";

@Module({
  imports: [
    TypeOrmModule.forFeature([Ad, AdModeration]),
    BullModule.registerQueue({ name: AD_MODERATION_QUEUE }),
  ],
  providers: [AdModerationService, AdModerationProcessor, AdsScheduler],
})
export class AdsWorkersModule {}
