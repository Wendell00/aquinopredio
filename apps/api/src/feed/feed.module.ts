import { Module } from "@nestjs/common";
import { ReferralsModule } from "../referrals/referrals.module";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { InteractionsService } from "./interactions.service";

@Module({
  imports: [ReferralsModule],
  controllers: [FeedController],
  providers: [FeedService, InteractionsService],
  exports: [FeedService],
})
export class FeedModule {}
