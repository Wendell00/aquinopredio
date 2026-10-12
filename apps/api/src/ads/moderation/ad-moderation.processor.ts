import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { AdModerationService } from "./ad-moderation.service";
import { AD_MODERATION_QUEUE, type AdModerationJob } from "./moderation.queue";

@Processor(AD_MODERATION_QUEUE, { concurrency: 4 })
export class AdModerationProcessor extends WorkerHost {
  constructor(private readonly moderation: AdModerationService) {
    super();
  }

  async process(job: Job<AdModerationJob>): Promise<void> {
    await this.moderation.moderate(job.data.adId);
  }
}
