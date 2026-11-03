import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Moderação consistente sob concorrência (spec 5.7 e 5.16 item 3, RN-MOD-007):
 * - `ads.content_version`: versão do conteúdo moderado, incrementada a cada edição de conteúdo;
 * - `ads.moderation_run_id`: execução automática autorizada no episódio de moderação atual;
 * - `ad_moderation_runs`: rastro de cada execução (aplicada, descartada ou com falha), sem conteúdo;
 * - `ad_moderations.run_id` único: uma execução gera no máximo uma decisão;
 * - `ai_calls.correlation_id`: liga a chamada de IA à execução.
 * O trigger zera a execução autorizada quando a versão muda ou o anúncio volta para a moderação,
 * valendo para qualquer escritor (edição, denúncia, reativação, SQL manual).
 */
export class AdModerationRuns1761700000000 implements MigrationInterface {
  name = "AdModerationRuns1761700000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE ads ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 0`,
    );
    await q.query(`ALTER TABLE ads ADD COLUMN IF NOT EXISTS moderation_run_id uuid`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS ad_moderation_runs (
        id uuid PRIMARY KEY,
        ad_id uuid NOT NULL REFERENCES ads (id) ON DELETE CASCADE,
        content_version integer NOT NULL,
        content_hash text NOT NULL,
        outcome text CHECK (outcome IN ('aplicado', 'descartado', 'falhou')),
        discard_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS ad_moderation_runs_ad_idx ON ad_moderation_runs (ad_id, created_at DESC)`,
    );
    await q.query(`ALTER TABLE ad_moderations ADD COLUMN IF NOT EXISTS content_version integer`);
    await q.query(
      `ALTER TABLE ad_moderations ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES ad_moderation_runs (id) ON DELETE SET NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ad_moderations_run_idx ON ad_moderations (run_id) WHERE run_id IS NOT NULL`,
    );
    await q.query(`ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS correlation_id uuid`);
    await q.query(`
      CREATE OR REPLACE FUNCTION ads_reset_moderation_run() RETURNS trigger AS $$
      BEGIN
        IF NEW.content_version IS DISTINCT FROM OLD.content_version
           OR (NEW.status = 'em_moderacao' AND OLD.status IS DISTINCT FROM 'em_moderacao') THEN
          NEW.moderation_run_id := NULL;
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await q.query(`DROP TRIGGER IF EXISTS ads_reset_moderation_run ON ads`);
    await q.query(`
      CREATE TRIGGER ads_reset_moderation_run
        BEFORE UPDATE OF status, content_version ON ads
        FOR EACH ROW EXECUTE FUNCTION ads_reset_moderation_run()`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS ads_reset_moderation_run ON ads`);
    await q.query(`DROP FUNCTION IF EXISTS ads_reset_moderation_run()`);
    await q.query(`ALTER TABLE ai_calls DROP COLUMN IF EXISTS correlation_id`);
    await q.query(`DROP INDEX IF EXISTS ad_moderations_run_idx`);
    await q.query(`ALTER TABLE ad_moderations DROP COLUMN IF EXISTS run_id`);
    await q.query(`ALTER TABLE ad_moderations DROP COLUMN IF EXISTS content_version`);
    await q.query(`DROP TABLE IF EXISTS ad_moderation_runs`);
    await q.query(`ALTER TABLE ads DROP COLUMN IF EXISTS moderation_run_id`);
    await q.query(`ALTER TABLE ads DROP COLUMN IF EXISTS content_version`);
  }
}
