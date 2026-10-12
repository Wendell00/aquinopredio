import type { MigrationInterface, QueryRunner } from "typeorm";

export class AdminSanctions1760800000000 implements MigrationInterface {
  name = "AdminSanctions1760800000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE sanction_type AS ENUM ('aviso', 'suspensao', 'banimento')`);
    await q.query(
      `CREATE TYPE appeal_status AS ENUM ('nenhuma', 'pendente', 'aceita', 'recusada')`,
    );
    await q.query(`
      CREATE TABLE sanctions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        type sanction_type NOT NULL,
        reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
        ends_at timestamptz,
        decided_by uuid REFERENCES users (id) ON DELETE SET NULL,
        report_id uuid REFERENCES reports (id) ON DELETE SET NULL,
        appeal_status appeal_status NOT NULL DEFAULT 'nenhuma',
        appeal_text text CHECK (appeal_text IS NULL OR char_length(appeal_text) <= 1000),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX sanctions_user_idx ON sanctions (user_id, created_at DESC)`);

    // Trilha de auditoria das ações de moderação e administração (RNF-015).
    await q.query(`
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id uuid REFERENCES users (id) ON DELETE SET NULL,
        action text NOT NULL,
        target_type text NOT NULL,
        target_id uuid,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX audit_logs_target_idx ON audit_logs (target_type, target_id, created_at DESC)`,
    );
    await q.query(`CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE audit_logs`);
    await q.query(`DROP TABLE sanctions`);
    await q.query(`DROP TYPE appeal_status`);
    await q.query(`DROP TYPE sanction_type`);
  }
}
