import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ConversationDetail,
  ConversationSummary,
  Message,
  SendMessageInput,
} from "@repo/shared";
import { sendMessageInputSchema } from "@repo/shared";
import { DataSource } from "typeorm";
import { containsExternalLink, moderateLocally } from "../ads/moderation/moderation.rules";
import { FeedService } from "../feed/feed.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";
import { StorageService } from "../storage/storage.service";
import { UploadsService } from "../uploads/uploads.service";
import type { User } from "../users/user.entity";
import { ChatRealtimeService } from "./chat-realtime.service";

const PAGE = 50;

/** Padrões comuns de golpe em marketplace (RN-085): marcam a mensagem com aviso, sem bloquear. */
const SCAM =
  /\b(c[oó]digo (de|do) (verifica[cç][aã]o|whats)|pix (adiantado|antecipado)|taxa de (entrega|libera[cç][aã]o)|clique no link|confirme seus dados)\b/i;

interface ConversationRow {
  id: string;
  status: "aberta" | "bloqueada";
  buyer_id: string;
  seller_id: string;
  ad_id: string;
  ad_title: string;
  ad_status: string;
  thumb_key: string | null;
  other_id: string | null;
  other_name: string | null;
  other_image: string | null;
  other_status: string | null;
  last_body: string | null;
  last_sender: string | null;
  last_at: Date | null;
  last_has_image: boolean | null;
  unread: number;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly feed: FeedService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: ChatRealtimeService,
  ) {}

  /** Abre (ou reabre) a conversa do interessado sobre um anúncio (RN-080). */
  async start(user: User, adId: string): Promise<ConversationDetail> {
    const ad = await this.feed.detail(user, adId);
    if (ad.isOwner)
      throw new BadRequestException("Você não pode conversar sobre o próprio anúncio");
    if (ad.blocked) throw new ForbiddenException("Você bloqueou este anunciante");

    const [existing] = await this.dataSource.query(
      `SELECT id FROM conversations WHERE ad_id = $1 AND buyer_id = $2`,
      [adId, user.id],
    );
    if (existing) return this.detail(user, existing.id);

    // RN-084: antispam de novas conversas por dia. Lock por usuário evita estourar com requisições paralelas.
    const limit = await this.settings.get("chat.newConversationsPerDay");
    const created: { id: string } = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('conversations:' || $1))`, [
        user.id,
      ]);
      const [{ total }] = await manager.query(
        `SELECT count(*)::int AS total FROM conversations WHERE buyer_id = $1 AND created_at > now() - interval '1 day'`,
        [user.id],
      );
      if (total >= limit) {
        throw new HttpException(
          "Você iniciou muitas conversas hoje. Tente de novo amanhã.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const [row] = await manager.query(
        `INSERT INTO conversations (ad_id, buyer_id, seller_id) VALUES ($1, $2, $3)
         ON CONFLICT (ad_id, buyer_id) DO UPDATE SET ad_id = EXCLUDED.ad_id RETURNING id`,
        [adId, user.id, ad.seller.id],
      );
      return row;
    });
    return this.detail(user, created.id);
  }

  async list(user: User): Promise<ConversationSummary[]> {
    const rows = await this.query(user.id);
    return rows.map((row) => this.toSummary(row, user.id));
  }

  async detail(
    user: User,
    conversationId: string,
    options: { after?: string; before?: string } = {},
  ): Promise<ConversationDetail> {
    const [row] = await this.query(user.id, conversationId);
    if (!row) throw new NotFoundException("Conversa não encontrada");
    const messages: {
      id: string;
      sender_id: string | null;
      sender_name: string | null;
      body: string | null;
      key: string | null;
      thumb_key: string | null;
      width: number | null;
      height: number | null;
      upload_id: string | null;
      has_link: boolean;
      flagged: boolean;
      read_at: Date | null;
      created_at: Date;
    }[] = await this.dataSource.query(
      `SELECT * FROM (
         SELECT m.id, m.sender_id, u.name AS sender_name, m.body, m.upload_id, up.key, up.thumb_key, up.width, up.height,
                m.has_link, m.flagged, m.read_at, m.created_at
         FROM messages m
         LEFT JOIN users u ON u.id = m.sender_id AND u.status <> 'excluido'
         LEFT JOIN uploads up ON up.id = m.upload_id
         WHERE m.conversation_id = $1
           AND ($2::timestamptz IS NULL OR date_trunc('milliseconds', m.created_at) > $2)
           AND ($3::timestamptz IS NULL OR date_trunc('milliseconds', m.created_at) < $3)
         ORDER BY m.created_at DESC
         LIMIT ${PAGE + 1}
       ) recent ORDER BY created_at`,
      [conversationId, options.after ?? null, options.before ?? null],
    );
    const hasOlder = !options.after && messages.length > PAGE;
    const page = hasOlder ? messages.slice(1) : messages;
    return {
      ...this.toSummary(row, user.id),
      messages: page.map(
        (message): Message => ({
          id: message.id,
          mine: message.sender_id === user.id,
          senderName: message.sender_id ? message.sender_name : null,
          body: message.body,
          image:
            message.upload_id && message.key && message.thumb_key
              ? {
                  id: message.upload_id,
                  url: this.storage.url(message.key),
                  thumbUrl: this.storage.url(message.thumb_key),
                  width: message.width ?? 0,
                  height: message.height ?? 0,
                }
              : null,
          hasLink: message.has_link,
          flagged: message.flagged,
          readAt: message.read_at?.toISOString() ?? null,
          createdAt: message.created_at.toISOString(),
        }),
      ),
      hasOlder,
    };
  }

  async send(user: User, conversationId: string, rawInput: SendMessageInput): Promise<Message> {
    const input = sendMessageInputSchema.parse(rawInput);
    const [conversation] = await this.query(user.id, conversationId);
    if (!conversation) throw new NotFoundException("Conversa não encontrada");
    if (
      conversation.status === "bloqueada" ||
      (await this.isBlocked(conversation.buyer_id, conversation.seller_id))
    ) {
      throw new ForbiddenException("Esta conversa foi encerrada");
    }
    if (conversation.other_status === "excluido" || conversation.other_status === "banido") {
      throw new ForbiddenException("Esta pessoa não está mais no app");
    }
    const [upload] = input.imageId ? await this.uploads.claim(user.id, [input.imageId]) : [];
    const body = input.body || null;
    const hasLink = body ? containsExternalLink(body) : false;
    const flagged = body ? SCAM.test(body) || moderateLocally(body).decision === "revisar" : false;

    const [saved] = await this.dataSource.query(
      `INSERT INTO messages (conversation_id, sender_id, body, upload_id, has_link, flagged)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
      [conversationId, user.id, body, upload?.id ?? null, hasLink, flagged],
    );
    await this.dataSource.query(`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, [
      conversationId,
      saved.created_at,
    ]);
    if (upload) await this.uploads.markAttached([upload.id]);

    const recipient =
      conversation.buyer_id === user.id ? conversation.seller_id : conversation.buyer_id;
    // O remetente também recebe: atualiza as outras abas/aparelhos dele.
    this.realtime.notify([recipient, user.id], conversationId);
    void this.notifications.notify(recipient, {
      type: "nova_mensagem",
      title: `${user.name} sobre “${conversation.ad_title}”`,
      body: body ? body.slice(0, 120) : "Enviou uma foto",
      url: `/conversas/${conversationId}`,
    });

    return {
      id: saved.id,
      mine: true,
      senderName: user.name,
      body,
      image: upload ? this.uploads.toImage(upload) : null,
      hasLink,
      flagged,
      readAt: null,
      createdAt: saved.created_at.toISOString(),
    };
  }

  async markRead(user: User, conversationId: string): Promise<void> {
    const [conversation] = await this.query(user.id, conversationId);
    if (!conversation) throw new NotFoundException("Conversa não encontrada");
    const [, affected]: [unknown, number] = await this.dataSource.query(
      `UPDATE messages SET read_at = now() WHERE conversation_id = $1 AND sender_id IS DISTINCT FROM $2 AND read_at IS NULL`,
      [conversationId, user.id],
    );
    // Só avisa quando algo mudou: o front marca como lida a cada mensagem recebida.
    if (affected > 0) {
      this.realtime.notify([conversation.buyer_id, conversation.seller_id], conversationId);
    }
  }

  private async isBlocked(a: string, b: string): Promise<boolean> {
    const [row] = await this.dataSource.query(
      `SELECT 1 FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [a, b],
    );
    return Boolean(row);
  }

  /** Conversas do usuário (só participantes enxergam). */
  private query(userId: string, conversationId?: string): Promise<ConversationRow[]> {
    return this.dataSource.query(
      `SELECT c.id, c.status, c.buyer_id, c.seller_id, c.ad_id,
              a.title AS ad_title, a.status AS ad_status, cover.thumb_key,
              other.id AS other_id, other.name AS other_name, other.image AS other_image, other.status AS other_status,
              last.body AS last_body, last.sender_id AS last_sender, last.created_at AS last_at,
              (last.upload_id IS NOT NULL) AS last_has_image,
              (SELECT count(*)::int FROM messages um
               WHERE um.conversation_id = c.id AND um.sender_id IS DISTINCT FROM $1 AND um.read_at IS NULL) AS unread
       FROM conversations c
       JOIN ads a ON a.id = c.ad_id
       LEFT JOIN users other ON other.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
       LEFT JOIN LATERAL (
         SELECT u.thumb_key FROM ad_images i JOIN uploads u ON u.id = i.upload_id WHERE i.ad_id = a.id ORDER BY i.position LIMIT 1
       ) cover ON true
       LEFT JOIN LATERAL (
         SELECT m.body, m.sender_id, m.created_at, m.upload_id FROM messages m WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC LIMIT 1
       ) last ON true
       WHERE $1 IN (c.buyer_id, c.seller_id) AND ($2::uuid IS NULL OR c.id = $2)
         -- Quem só abriu e não escreveu nada não aparece para o anunciante.
         AND (c.buyer_id = $1 OR last.created_at IS NOT NULL)
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
       LIMIT 100`,
      [userId, conversationId ?? null],
    );
  }

  private toSummary(row: ConversationRow, userId: string): ConversationSummary {
    const removed = !row.other_id || row.other_status === "excluido";
    return {
      id: row.id,
      status: row.status,
      role: row.buyer_id === userId ? "comprador" : "vendedor",
      ad: {
        id: row.ad_id,
        title: row.ad_title,
        thumbUrl: row.thumb_key ? this.storage.url(row.thumb_key) : null,
        active: row.ad_status === "ativo",
      },
      other: {
        id: removed ? null : row.other_id,
        name: removed ? "Usuário removido" : (row.other_name ?? "Usuário removido"),
        image: removed ? null : row.other_image,
      },
      lastMessage: row.last_at
        ? {
            body: row.last_body,
            mine: row.last_sender === userId,
            createdAt: row.last_at.toISOString(),
            hasImage: Boolean(row.last_has_image),
          }
        : null,
      unread: row.unread,
    };
  }
}
