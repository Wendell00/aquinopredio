import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type AppNotification,
  type NotificationType,
  notificationPrefsSchema,
  type PushSubscriptionInput,
  type UnreadCounts,
} from "@repo/shared";
import { DataSource } from "typeorm";
import webpush from "web-push";
import type { Env } from "../config/env";

/** Tipos que respeitam o "horário silencioso" (RN-122). Os demais chegam na hora. */
const NON_ESSENTIAL: NotificationType[] = [
  "novidades_predio",
  "anuncio_expirando",
  "favorito_alterado",
];
/** Opt-in: desligado até o usuário ativar (RN-121). */
const OPT_IN: NotificationType[] = ["novidades_predio"];

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
}

/** Horário silencioso padrão: 22h–8h em São Paulo. */
export function isQuietHours(date = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Sao_Paulo",
    }).format(date),
  );
  return hour >= 22 || hour < 8;
}

/** Central de notificações (in-app) + Web Push (RN-120 a RN-122). */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private pushEnabled = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get("VAPID_PUBLIC_KEY", { infer: true });
    const privateKey = this.config.get("VAPID_PRIVATE_KEY", { infer: true });
    if (publicKey && privateKey) {
      webpush.setVapidDetails(
        this.config.get("VAPID_SUBJECT", { infer: true }),
        publicKey,
        privateKey,
      );
      this.pushEnabled = true;
    }
  }

  /**
   * Registra a notificação e dispara o push sem segurar a requisição.
   * Preferências desligadas não geram nada; horário silencioso só segura o push.
   */
  async notify(userId: string, input: NotifyInput): Promise<void> {
    const [user] = await this.dataSource.query(
      `SELECT notification_prefs, status FROM users WHERE id = $1`,
      [userId],
    );
    if (!user || user.status === "excluido" || user.status === "banido") return;
    const prefs = notificationPrefsSchema.parse(user.notification_prefs ?? {});
    if (
      prefs.disabled.includes(input.type) ||
      (OPT_IN.includes(input.type) && !prefs.enabled.includes(input.type))
    )
      return;

    await this.dataSource.query(
      `INSERT INTO notifications (user_id, type, title, body, url) VALUES ($1, $2, $3, $4, $5)`,
      [userId, input.type, input.title, input.body, input.url ?? null],
    );
    if (prefs.quietHours && NON_ESSENTIAL.includes(input.type) && isQuietHours()) return;
    void this.push(userId, input).catch((error) =>
      this.logger.warn(`Falha no push: ${(error as Error).message}`),
    );
  }

  private async push(userId: string, input: NotifyInput): Promise<void> {
    if (!this.pushEnabled) return;
    const subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[] =
      await this.dataSource.query(
        `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
        [userId],
      );
    const payload = JSON.stringify({
      title: input.title,
      body: input.body,
      url: input.url ?? "/notificacoes",
      tag: input.type,
    });
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            { TTL: 60 * 60 * 24, urgency: NON_ESSENTIAL.includes(input.type) ? "low" : "normal" },
          );
          await this.dataSource.query(
            `UPDATE push_subscriptions SET last_used_at = now() WHERE id = $1`,
            [subscription.id],
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // 404/410: a inscrição expirou ou o usuário revogou a permissão.
          if (status === 404 || status === 410) {
            await this.dataSource.query(`DELETE FROM push_subscriptions WHERE id = $1`, [
              subscription.id,
            ]);
          } else {
            throw error;
          }
        }
      }),
    );
  }

  async list(userId: string, before?: string): Promise<AppNotification[]> {
    const rows: {
      id: string;
      type: string;
      title: string;
      body: string;
      url: string | null;
      read_at: Date | null;
      created_at: Date;
    }[] = await this.dataSource.query(
      `SELECT id, type, title, body, url, read_at, created_at FROM notifications
         WHERE user_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2)
         ORDER BY created_at DESC LIMIT 30`,
      [userId, before ?? null],
    );
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      url: row.url,
      readAt: row.read_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async markRead(userId: string, id?: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND ($2::uuid IS NULL OR id = $2)`,
      [userId, id ?? null],
    );
  }

  async unreadCounts(userId: string): Promise<UnreadCounts> {
    const [row] = await this.dataSource.query(
      `SELECT
         (SELECT count(*)::int FROM notifications WHERE user_id = $1 AND read_at IS NULL) AS notifications,
         (SELECT count(DISTINCT m.conversation_id)::int FROM messages m JOIN conversations c ON c.id = m.conversation_id
          WHERE $1 IN (c.buyer_id, c.seller_id) AND m.sender_id IS DISTINCT FROM $1 AND m.read_at IS NULL) AS conversations`,
      [userId],
    );
    return { notifications: row?.notifications ?? 0, conversations: row?.conversations ?? 0 };
  }

  async subscribe(
    userId: string,
    input: PushSubscriptionInput,
    userAgent: string | undefined,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [
        userId,
        input.endpoint,
        input.keys.p256dh,
        input.keys.auth,
        userAgent?.slice(0, 300) ?? null,
      ],
    );
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
      [userId, endpoint],
    );
  }
}
