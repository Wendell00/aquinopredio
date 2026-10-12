import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Fecha brechas de moderação:
 * - `needs_moderation`: conteúdo mudou com o anúncio pausado/expirado; ao reativar, volta para moderação.
 * - `manual_review`: ocultado por denúncias ou pelo admin do prédio; só um admin da plataforma libera (RN-093, RN-094).
 */
export class AdReviewFlags1761000000000 implements MigrationInterface {
  name = "AdReviewFlags1761000000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE ads ADD COLUMN IF NOT EXISTS needs_moderation boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE ads ADD COLUMN IF NOT EXISTS manual_review boolean NOT NULL DEFAULT false`,
    );
    // Push só para serviços conhecidos e com limite por usuário (antes: qualquer https).
    await q.query(
      `DELETE FROM push_subscriptions WHERE endpoint !~ '^https://(fcm\\.googleapis\\.com|[a-z0-9.-]*push\\.services\\.mozilla\\.com|[a-z0-9.-]*notify\\.windows\\.com|web\\.push\\.apple\\.com)/'`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ads DROP COLUMN IF EXISTS manual_review`);
    await q.query(`ALTER TABLE ads DROP COLUMN IF EXISTS needs_moderation`);
  }
}
