import { Module } from "@nestjs/common";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { InteractionsService } from "./interactions.service";

@Module({
  controllers: [FeedController],
  providers: [FeedService, InteractionsService],
  exports: [FeedService],
})
export class FeedModule {}
