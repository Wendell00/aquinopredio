import { Module } from "@nestjs/common";
import { FeedModule } from "../feed/feed.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [FeedModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
