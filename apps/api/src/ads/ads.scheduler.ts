import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DataSource } from "typeorm";

/** Jobs periódicos dos anúncios. Roda só onde WORKERS_ENABLED=true. */
@Injectable()
export class AdsScheduler {
  private readonly logger = new Logger(AdsScheduler.name);

  constructor(private readonly dataSource: DataSource) {}

  /** RN-063: anúncios ativos expiram ao fim da validade. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireAds(): Promise<number> {
    const result: [unknown[], number] = await this.dataSource.query(
      `UPDATE ads SET status = 'expirado', updated_at = now() WHERE status = 'ativo' AND expires_at <= now()`,
    );
    const count = result[1] ?? 0;
    if (count) this.logger.log(`${count} anúncio(s) expirado(s)`);
    return count;
  }
}
