import { createHmac } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CHAT_REALTIME_EVENT } from "@repo/shared";
import type { Env } from "../config/env";

/**
 * Avisa os participantes de que uma conversa mudou, pelo Broadcast do Supabase Realtime.
 *
 * O banco do app não é o do Supabase, então não há Postgres Changes nem RLS de lá: o aviso leva só o
 * id da conversa e o front busca os dados pela API, onde fica a autorização (RNF-012). O nome do canal
 * é um HMAC do id do usuário com a chave secreta, então ninguém escuta o canal de outra pessoa sem
 * pedir o próprio nome à API autenticada.
 */
@Injectable()
export class ChatRealtimeService {
  private readonly logger = new Logger(ChatRealtimeService.name);
  private readonly url: string | undefined;
  private readonly secretKey: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.url = config.get("SUPABASE_URL", { infer: true });
    this.secretKey = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  /** Nome do canal do usuário, ou `null` se o Realtime não estiver configurado. */
  topicFor(userId: string): string | null {
    if (!this.secretKey) return null;
    const digest = createHmac("sha256", this.secretKey)
      .update(`chat:${userId}`)
      .digest("base64url");
    return `chat:${digest}`;
  }

  /**
   * Fire-and-forget: a mensagem já está salva e o polling cobre a falha, então um erro aqui só vira log.
   */
  notify(userIds: string[], conversationId: string): void {
    if (!this.url || !this.secretKey) return;
    const messages = [...new Set(userIds)].flatMap((userId) => {
      const topic = this.topicFor(userId);
      return topic
        ? [{ topic, event: CHAT_REALTIME_EVENT, payload: { conversationId }, private: false }]
        : [];
    });
    void fetch(new URL("/realtime/v1/api/broadcast", this.url), {
      method: "POST",
      headers: {
        apikey: this.secretKey,
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(5_000),
    })
      .then((response) => {
        if (!response.ok)
          this.logger.warn(`Supabase Realtime respondeu HTTP ${response.status} ao broadcast`);
      })
      .catch((error: unknown) => {
        this.logger.warn(`Falha ao publicar no Supabase Realtime: ${String(error)}`);
      });
  }
}
