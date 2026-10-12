import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  type AppNotification,
  type Me,
  type NotificationPrefs,
  type PushSubscriptionInput,
  pushSubscriptionInputSchema,
  type UnreadCounts,
  updateNotificationPrefsSchema,
} from "@repo/shared";
import { z } from "zod";
import { CurrentUser } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { User } from "../users/user.entity";
import { toMe } from "../users/users.mapper";
import { UsersService } from "../users/users.service";
import { NotificationsService } from "./notifications.service";

@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  @Get("notifications")
  list(
    @CurrentUser() user: User,
    @Query("before", new ZodValidationPipe(z.iso.datetime().optional())) before?: string,
  ): Promise<AppNotification[]> {
    return this.notifications.list(user.id, before);
  }

  @Get("me/unread")
  unread(@CurrentUser() user: User): Promise<UnreadCounts> {
    return this.notifications.unreadCounts(user.id);
  }

  @Post("notifications/read")
  @HttpCode(204)
  async readAll(@CurrentUser() user: User): Promise<void> {
    await this.notifications.markRead(user.id);
  }

  @Post("notifications/:id/read")
  @HttpCode(204)
  async read(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.notifications.markRead(user.id, id);
  }

  @Put("me/notification-prefs")
  async prefs(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateNotificationPrefsSchema)) prefs: NotificationPrefs,
  ): Promise<Me> {
    return toMe(await this.users.updateNotificationPrefs(user, prefs));
  }

  @Post("push/subscriptions")
  @HttpCode(204)
  async subscribe(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(pushSubscriptionInputSchema)) input: PushSubscriptionInput,
    @Headers("user-agent") userAgent?: string,
  ): Promise<void> {
    await this.notifications.subscribe(user.id, input, userAgent);
  }

  @Post("push/subscriptions/remove")
  @HttpCode(204)
  async unsubscribe(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(z.object({ endpoint: z.url() }))) input: { endpoint: string },
  ): Promise<void> {
    await this.notifications.unsubscribe(user.id, input.endpoint);
  }
}
