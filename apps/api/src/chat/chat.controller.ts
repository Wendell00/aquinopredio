import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type ConversationDetail,
  type ConversationSummary,
  type Message,
  messagesQuerySchema,
  type SendMessageInput,
  sendMessageInputSchema,
} from "@repo/shared";
import { CurrentUser } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { User } from "../users/user.entity";
import { ChatService } from "./chat.service";

@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post("ads/:id/conversations")
  start(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) adId: string,
  ): Promise<ConversationDetail> {
    return this.chat.start(user, adId);
  }

  @Get("conversations")
  list(@CurrentUser() user: User): Promise<ConversationSummary[]> {
    return this.chat.list(user);
  }

  @Get("conversations/:id")
  detail(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) query: { after?: string; before?: string },
  ): Promise<ConversationDetail> {
    return this.chat.detail(user, id, query);
  }

  @Post("conversations/:id/messages")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  send(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageInputSchema)) input: SendMessageInput,
  ): Promise<Message> {
    return this.chat.send(user, id, input);
  }

  @Post("conversations/:id/read")
  @HttpCode(204)
  async read(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.chat.markRead(user, id);
  }
}
