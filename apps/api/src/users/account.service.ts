import { ForbiddenException, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "../storage/storage.service";
import type { User } from "./user.entity";

/** Login recente exigido para excluir a conta (mesmo valor do freshAge do Better Auth). */
const FRESH_SESSION_MS = 15 * 60_000;

/** Direitos do titular (LGPD): exportação (RN-133) e exclusão (RN-008). */
@Injectable()
export class AccountService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async export(user: User): Promise<Record<string, unknown>> {
    const q = <T>(sql: string) => this.dataSource.query(sql, [user.id]) as Promise<T[]>;
    const [profile] = await q<Record<string, unknown>>(
      `SELECT id, name, username, email, phone, image, status, created_at, terms_accepted_at, notification_prefs FROM users WHERE id = $1`,
    );
    return {
      exportado_em: new Date().toISOString(),
      perfil: profile,
      predios: await q(
        `SELECT b.name AS predio, b.street, b.number, b.city, m.unit AS unidade, m.status, m.created_at
         FROM building_memberships m JOIN buildings b ON b.id = m.building_id WHERE m.user_id = $1`,
      ),
      anuncios: await q(
        `SELECT id, title, description, type, price_mode, price_cents, status, created_at, expires_at FROM ads WHERE user_id = $1`,
      ),
      mensagens_enviadas: await q(
        `SELECT conversation_id, body, created_at FROM messages WHERE sender_id = $1 ORDER BY created_at`,
      ),
      favoritos: await q(`SELECT ad_id, created_at FROM favorites WHERE user_id = $1`),
      bloqueios: await q(`SELECT blocked_id, created_at FROM user_blocks WHERE blocker_id = $1`),
      denuncias_feitas: await q(
        `SELECT target_type, reason, details, status, created_at FROM reports WHERE reporter_id = $1`,
      ),
      notificacoes: await q(
        `SELECT type, title, body, created_at, read_at FROM notifications WHERE user_id = $1`,
      ),
      uso_de_ia: await q(
        `SELECT kind, input_text, output, created_at FROM ai_ad_drafts WHERE user_id = $1`,
      ),
    };
  }

  /**
   * Exclui a conta (RN-008): anúncios saem do ar, mensagens ficam como "Usuário removido",
   * dados pessoais são apagados na hora. Ficam só os registros de moderação exigidos por segurança.
   */
  async delete(user: User, sessionCreatedAt: Date): Promise<void> {
    if (Date.now() - sessionCreatedAt.getTime() > FRESH_SESSION_MS) {
      throw new ForbiddenException({
        message: "Por segurança, entre de novo para excluir a conta",
        code: "FRESH_LOGIN_REQUIRED",
      });
    }
    const uploads: { key: string; thumb_key: string }[] = await this.dataSource.query(
      `SELECT key, thumb_key FROM uploads WHERE owner_id = $1`,
      [user.id],
    );
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE ads SET status = 'excluido', updated_at = now() WHERE user_id = $1 AND status <> 'excluido'`,
        [user.id],
      );
      await manager.query(
        `UPDATE building_memberships SET status = 'removido', unit = '-' WHERE user_id = $1`,
        [user.id],
      );
      await manager.query(
        `UPDATE conversations SET status = 'bloqueada' WHERE $1 IN (buyer_id, seller_id)`,
        [user.id],
      );
      for (const table of [
        "favorites",
        "user_blocks",
        "notifications",
        "push_subscriptions",
        "sessions",
        "accounts",
      ]) {
        const column = table === "user_blocks" ? "blocker_id" : "user_id";
        await manager.query(`DELETE FROM ${table} WHERE ${column} = $1`, [user.id]);
      }
      await manager.query(`DELETE FROM user_blocks WHERE blocked_id = $1`, [user.id]);
      await manager.query(
        `UPDATE ai_ad_drafts SET input_text = NULL, output = '{}' WHERE user_id = $1`,
        [user.id],
      );
      await manager.query(`UPDATE messages SET upload_id = NULL WHERE sender_id = $1`, [user.id]);
      await manager.query(`DELETE FROM uploads WHERE owner_id = $1`, [user.id]);
      await manager.query(
        `UPDATE users SET status = 'excluido', deleted_at = now(), name = 'Usuário removido', username = NULL,
           email = 'removido+' || id || '@invalid.local', email_verified = false, phone = NULL, image = NULL,
           primary_building_id = NULL, notification_prefs = '{}', updated_at = now()
         WHERE id = $1`,
        [user.id],
      );
      await this.audit.log(user.id, "conta.excluir", { type: "user", id: user.id }, {}, manager);
    });
    await this.storage
      .deleteMany(uploads.flatMap((upload) => [upload.key, upload.thumb_key]))
      .catch(() => undefined);
  }
}
