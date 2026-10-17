import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { SettingsService } from "../../settings/settings.service";

/** Manutenção periódica de prédios. Roda só onde WORKERS_ENABLED=true. */
@Injectable()
export class MaintenanceScheduler {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
  ) {}

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
