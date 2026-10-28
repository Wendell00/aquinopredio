import { Module } from "@nestjs/common";
import { FeedModule } from "../feed/feed.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { ChatRealtimeService } from "./chat-realtime.service";

@Module({
  imports: [FeedModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRealtimeService],
})
export class ChatModule {}
