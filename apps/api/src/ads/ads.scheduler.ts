import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { NotificationsService } from "../notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";

/** Jobs periódicos dos anúncios (expiração e aviso de expiração). */
@Injectable()
export class AdsScheduler {
  private readonly logger = new Logger(AdsScheduler.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  /** RN-063: anúncios ativos expiram ao fim da validade — exceto os de quem é Pro (RN-143). */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireAds(): Promise<number> {
    const result: [unknown[], number] = await this.dataSource.query(
      `UPDATE ads SET status = 'expirado', updated_at = now()
       WHERE status = 'ativo' AND expires_at <= now()
         AND user_id IN (SELECT id FROM users WHERE plan = 'free')`,
    );
    const count = result[1] ?? 0;
    if (count) this.logger.log(`${count} anúncio(s) expirado(s)`);
    return count;
  }

  /** RN-063: avisa o anunciante alguns dias antes de expirar, uma vez por ciclo. */
  @Cron(CronExpression.EVERY_HOUR)
  async warnExpiring(): Promise<number> {
    const days = await this.settings.get("ads.expiryWarningDays");
    const [rows]: [{ id: string; user_id: string; title: string }[], number] =
      await this.dataSource.query(
        `UPDATE ads SET expiry_warned_at = now()
       WHERE status = 'ativo' AND expiry_warned_at IS NULL AND expires_at <= now() + make_interval(days => $1)
         AND user_id IN (SELECT id FROM users WHERE plan = 'free')
       RETURNING id, user_id, title`,
        [days],
      );
    for (const ad of rows) {
      await this.notifications.notify(ad.user_id, {
        type: "anuncio_expirando",
        title: "Seu anúncio vai expirar",
        body: `“${ad.title}” sai do ar em breve. Renove com 1 toque, sem custo.`,
        url: "/meus-anuncios",
      });
    }
    return rows.length;
  }
}
