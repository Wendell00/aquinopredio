import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { BuildingVerificationService } from "./building-verification.service";
import { BUILDING_VERIFICATION_QUEUE, type BuildingVerificationJob } from "./verification.queue";

@Processor(BUILDING_VERIFICATION_QUEUE, { concurrency: 2 })
export class BuildingVerificationProcessor extends WorkerHost {
  private readonly logger = new Logger(BuildingVerificationProcessor.name);

  constructor(private readonly verification: BuildingVerificationService) {
    super();
  }

  async process(job: Job<BuildingVerificationJob>): Promise<void> {
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const outcome = await this.verification.verify(job.data.buildingId, {
      requireEvidence: !lastAttempt,
    });
    if (outcome)
      this.logger.log(`Prédio ${job.data.buildingId}: ${outcome.decision} (${outcome.decidedBy})`);
  }
}
