import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { NotificationsService } from "../notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";

/** Manutenção periódica de prédios e vínculos. Roda só onde WORKERS_ENABLED=true. */
@Injectable()
export class MaintenanceScheduler {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** RN-037: pedido de vínculo sem resposta do admin é aprovado automaticamente. */
  @Cron(CronExpression.EVERY_HOUR)
  async autoApproveMemberships(): Promise<number> {
    const days = await this.settings.get("buildings.autoApproveJoinDays");
    const [rows]: [{ user_id: string; name: string }[], number] = await this.dataSource.query(
      `UPDATE building_memberships m SET status = 'ativo', decided_at = now(), updated_at = now()
       FROM buildings b
       WHERE b.id = m.building_id AND m.status = 'pendente' AND m.created_at <= now() - make_interval(days => $1)
       RETURNING m.user_id, b.name`,
      [days],
    );
    for (const row of rows) {
      await this.notifications.notify(row.user_id, {
        type: "vinculo_atualizado",
        title: "Você entrou no prédio",
        body: `Seu vínculo com “${row.name}” foi aprovado.`,
        url: "/inicio",
      });
    }
    return rows.length;
  }

  /** RN-033: prédio sem morador ativo há muito tempo sai da busca. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async archiveInactiveBuildings(): Promise<number> {
    const days = await this.settings.get("buildings.archiveAfterDays");
    const [, count]: [unknown[], number] = await this.dataSource.query(
      `UPDATE buildings b SET status = 'arquivado', updated_at = now()
       WHERE b.status IN ('verificado', 'pendente_revisao') AND b.last_activity_at <= now() - make_interval(days => $1)
         AND NOT EXISTS (SELECT 1 FROM building_memberships m JOIN users u ON u.id = m.user_id
                         WHERE m.building_id = b.id AND m.status = 'ativo' AND u.status IN ('ativo', 'suspenso'))`,
      [days],
    );
    if (count) this.logger.log(`${count} prédio(s) arquivado(s)`);
    return count;
  }
}
