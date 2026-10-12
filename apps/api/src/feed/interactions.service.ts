import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { BlockedUser, CreateReportInput } from "@repo/shared";
import { createReportInputSchema } from "@repo/shared";
import { DataSource } from "typeorm";
import { SettingsService } from "../settings/settings.service";
import type { User } from "../users/user.entity";
import { FeedService } from "./feed.service";

@Injectable()
export class InteractionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly feed: FeedService,
    private readonly settings: SettingsService,
  ) {}

  /** RN-083: só favorita o que consegue ver. */
  async favorite(user: User, adId: string): Promise<void> {
    const ad = await this.feed.detail(user, adId);
    if (ad.isOwner) throw new BadRequestException("Você não pode favoritar o próprio anúncio");
    await this.dataSource.query(
      `INSERT INTO favorites (user_id, ad_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, adId],
    );
  }

  async unfavorite(user: User, adId: string): Promise<void> {
    await this.dataSource.query(`DELETE FROM favorites WHERE user_id = $1 AND ad_id = $2`, [
      user.id,
      adId,
    ]);
  }

  /** RN-081: link do WhatsApp gerado sob demanda; o número nunca vai no anúncio. */
  async whatsappLink(user: User, adId: string): Promise<{ url: string }> {
    const ad = await this.feed.detail(user, adId);
    if (!ad.whatsappEnabled || ad.isOwner || ad.blocked)
      throw new NotFoundException("WhatsApp indisponível para este anúncio");
    const [seller] = await this.dataSource.query(
      `SELECT phone FROM users WHERE id = $1 AND status IN ('ativo', 'suspenso')`,
      [ad.seller.id],
    );
    if (!seller?.phone) throw new NotFoundException("WhatsApp indisponível para este anúncio");
    const text = `Olá! Vi seu anúncio "${ad.title}" no Aqui no Prédio e tenho interesse.`;
    return {
      url: `https://wa.me/${String(seller.phone).replace(/\D/g, "")}?text=${encodeURIComponent(text)}`,
    };
  }

  /** RN-082: bloquear oculta anúncios mutuamente e encerra conversas entre os dois. */
  async block(user: User, targetId: string): Promise<void> {
    if (targetId === user.id) throw new BadRequestException("Você não pode bloquear a si mesmo");
    const [target] = await this.dataSource.query(`SELECT id FROM users WHERE id = $1`, [targetId]);
    if (!target) throw new NotFoundException("Usuário não encontrado");
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [user.id, targetId],
      );
      await manager.query(
        `UPDATE conversations SET status = 'bloqueada'
         WHERE (buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1)`,
        [user.id, targetId],
      );
    });
  }

  async unblock(user: User, targetId: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [user.id, targetId],
    );
  }

  async blocked(user: User): Promise<BlockedUser[]> {
    const rows: { id: string; name: string; image: string | null; created_at: Date }[] =
      await this.dataSource.query(
        `SELECT u.id, u.name, u.image, ub.created_at FROM user_blocks ub JOIN users u ON u.id = ub.blocked_id
       WHERE ub.blocker_id = $1 ORDER BY ub.created_at DESC`,
        [user.id],
      );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      image: row.image,
      blockedAt: row.created_at.toISOString(),
    }));
  }

  /** RN-092 + RN-093: denúncia; anúncio com N denunciantes distintos sai do ar para revisão. */
  async report(user: User, rawInput: CreateReportInput): Promise<void> {
    const input = createReportInputSchema.parse(rawInput);
    await this.assertReportable(user, input.targetType, input.targetId);
    try {
      await this.dataSource.query(
        `INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES ($1, $2, $3, $4, $5)`,
        [user.id, input.targetType, input.targetId, input.reason, input.details || null],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException("Você já denunciou isso. Obrigado!");
      throw error;
    }

    if (input.targetType === "ad") {
      const threshold = await this.settings.get("reports.autoHideThreshold");
      await this.dataSource.query(
        `UPDATE ads SET
           report_count = (SELECT count(DISTINCT reporter_id) FROM reports WHERE target_type = 'ad' AND target_id = $1 AND status = 'aberta'),
           status = CASE WHEN status = 'ativo' AND
             (SELECT count(DISTINCT reporter_id) FROM reports WHERE target_type = 'ad' AND target_id = $1 AND status = 'aberta') >= $2
             THEN 'em_moderacao'::ad_status ELSE status END,
           status_reason = CASE WHEN status = 'ativo' AND
             (SELECT count(DISTINCT reporter_id) FROM reports WHERE target_type = 'ad' AND target_id = $1 AND status = 'aberta') >= $2
             THEN 'Ocultado após denúncias. Em revisão pela equipe.' ELSE status_reason END
         WHERE id = $1`,
        [input.targetId, threshold],
      );
    }
  }

  private async assertReportable(
    user: User,
    type: CreateReportInput["targetType"],
    id: string,
  ): Promise<void> {
    if (type === "ad") {
      const ad = await this.feed.detail(user, id);
      if (ad.isOwner) throw new BadRequestException("Você não pode denunciar o próprio anúncio");
      return;
    }
    if (type === "user") {
      if (id === user.id) throw new BadRequestException("Você não pode denunciar a si mesmo");
      const [found] = await this.dataSource.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
      if (!found) throw new NotFoundException("Usuário não encontrado");
      return;
    }
    if (type === "building") {
      const [found] = await this.dataSource.query(`SELECT 1 FROM buildings WHERE id = $1`, [id]);
      if (!found) throw new NotFoundException("Prédio não encontrado");
      return;
    }
    // Mensagem: só quem participa da conversa pode denunciar, e não a própria mensagem.
    const [message] = await this.dataSource.query(
      `SELECT m.sender_id FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = $1 AND $2 IN (c.buyer_id, c.seller_id)`,
      [id, user.id],
    );
    if (!message || message.sender_id === user.id)
      throw new NotFoundException("Mensagem não encontrada");
  }
}
