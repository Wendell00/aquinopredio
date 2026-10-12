import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Registro de cada chamada de IA: custo, latência, versão do prompt (docs §4.4).
 * Idempotente: em bancos de desenvolvimento antigos a tabela já pode existir (ela chegou a fazer
 * parte da migration de prédios). Regra do repo: migration já aplicada não se edita, cria-se outra.
 */
export class AiCalls1760900000000 implements MigrationInterface {
  name = "AiCalls1760900000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$ BEGIN
        CREATE TYPE ai_task AS ENUM ('ad_generation', 'building_validation', 'moderation');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS ai_calls (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        task ai_task NOT NULL,
        user_id uuid REFERENCES users (id) ON DELETE SET NULL,
        model text NOT NULL,
        prompt_version text NOT NULL,
        tokens_in integer,
        tokens_out integer,
        latency_ms integer NOT NULL,
        success boolean NOT NULL,
        error text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS ai_calls_user_task_idx ON ai_calls (user_id, task, created_at)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS ai_calls`);
    await q.query(`DROP TYPE IF EXISTS ai_task`);
  }
}
