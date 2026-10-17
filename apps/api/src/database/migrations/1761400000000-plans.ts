import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Planos Free/Pro (RN-140 a RN-145).
 * - `users.plan`: cópia do estado da assinatura, lida no feed, nos limites e nos jobs.
 * - `subscriptions`: vínculo com o cliente e a assinatura no Stripe (fonte da verdade é o Stripe).
 * - `ads.featured_at`: anúncio em destaque do Pro.
 */
export class Plans1761400000000 implements MigrationInterface {
  name = "Plans1761400000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      CREATE TYPE user_plan AS ENUM ('free', 'pro');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await q.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan user_plan NOT NULL DEFAULT 'free'`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        stripe_customer_id text NOT NULL UNIQUE,
        stripe_subscription_id text UNIQUE,
        status text,
        current_period_end timestamptz,
        cancel_at_period_end boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);

    await q.query(`ALTER TABLE ads ADD COLUMN IF NOT EXISTS featured_at timestamptz`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS ads_featured_idx ON ads (user_id) WHERE featured_at IS NOT NULL`,
    );

    // Raio deixa de depender do selo de verificado: vale o do plano (todos começam no Free).
    await q.query(`UPDATE ads SET radius_m = 1000 WHERE radius_m > 1000 AND status <> 'excluido'`);
    await q.query(`DELETE FROM settings WHERE key IN ('ads.unverifiedMaxRadiusKm', 'ads.radiiKm')`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS ads_featured_idx`);
    await q.query(`ALTER TABLE ads DROP COLUMN IF EXISTS featured_at`);
    await q.query(`DROP TABLE IF EXISTS subscriptions`);
    await q.query(`ALTER TABLE users DROP COLUMN IF EXISTS plan`);
    await q.query(`DROP TYPE IF EXISTS user_plan`);
  }
}
