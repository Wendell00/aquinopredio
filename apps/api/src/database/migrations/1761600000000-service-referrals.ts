import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Indicações de prestadores de fora do app (RN-089): o morador divulga nome, telefone e o que a
 * pessoa faz. `oculta` = escondida após denúncias, aguardando o admin; `removida` = pelo admin.
 */
export class ServiceReferrals1761600000000 implements MigrationInterface {
  name = "ServiceReferrals1761600000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE report_target ADD VALUE IF NOT EXISTS 'referral'`);
    await q.query(`
      DO $$ BEGIN
        CREATE TYPE referral_status AS ENUM ('ativa', 'oculta', 'removida');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS service_referrals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        building_id uuid NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
        service text NOT NULL CHECK (char_length(service) BETWEEN 10 AND 300),
        provider_name text NOT NULL CHECK (char_length(provider_name) BETWEEN 2 AND 60),
        provider_phone text NOT NULL,
        status referral_status NOT NULL DEFAULT 'ativa',
        report_count integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    // O mesmo contato não é indicado duas vezes no mesmo prédio.
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS service_referrals_phone_idx
        ON service_referrals (building_id, provider_phone) WHERE status = 'ativa'`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS service_referrals_building_idx ON service_referrals (building_id, created_at DESC) WHERE status = 'ativa'`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS service_referrals_author_idx ON service_referrals (author_id, created_at DESC)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM reports WHERE target_type = 'referral'`);
    await q.query(`DROP TABLE IF EXISTS service_referrals`);
    await q.query(`DROP TYPE IF EXISTS referral_status`);
    // Valor de enum não sai com ALTER TYPE; fica sem uso.
  }
}
