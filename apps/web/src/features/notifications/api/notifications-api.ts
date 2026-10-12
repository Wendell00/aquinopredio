import {
  type AppNotification,
  type Me,
  meSchema,
  type NotificationPrefs,
  notificationSchema,
  type UnreadCounts,
  unreadCountsSchema,
} from "@repo/shared";
import { z } from "zod";
import { api } from "@/lib/api/client";

export async function getUnread(): Promise<UnreadCounts> {
  return unreadCountsSchema.parse(await api.get("me/unread").json());
}

export async function getNotifications(): Promise<AppNotification[]> {
  return z.array(notificationSchema).parse(await api.get("notifications").json());
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post("notifications/read");
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`notifications/${id}/read`);
}

export async function updateNotificationPrefs(prefs: NotificationPrefs): Promise<Me> {
  return meSchema.parse(await api.put("me/notification-prefs", { json: prefs }).json());
}
