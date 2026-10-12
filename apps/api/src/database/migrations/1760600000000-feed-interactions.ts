import type { MigrationInterface, QueryRunner } from "typeorm";

export class FeedInteractions1760600000000 implements MigrationInterface {
  name = "FeedInteractions1760600000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE favorites (
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        ad_id uuid NOT NULL REFERENCES ads (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, ad_id)
      )`);
    await q.query(`CREATE INDEX favorites_ad_idx ON favorites (ad_id)`);

    // RN-082 / RN-075: bloqueio é mútuo na prática (as consultas olham os dois sentidos).
    await q.query(`
      CREATE TABLE user_blocks (
        blocker_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        blocked_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (blocker_id, blocked_id),
        CHECK (blocker_id <> blocked_id)
      )`);
    await q.query(`CREATE INDEX user_blocks_blocked_idx ON user_blocks (blocked_id)`);

    await q.query(`CREATE TYPE report_target AS ENUM ('ad', 'user', 'message', 'building')`);
    await q.query(
      `CREATE TYPE report_reason AS ENUM ('golpe', 'conteudo_improprio', 'spam', 'item_proibido', 'outro')`,
    );
    await q.query(`CREATE TYPE report_status AS ENUM ('aberta', 'procedente', 'improcedente')`);
    await q.query(`
      CREATE TABLE reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id uuid REFERENCES users (id) ON DELETE SET NULL,
        target_type report_target NOT NULL,
        target_id uuid NOT NULL,
        reason report_reason NOT NULL,
        details text CHECK (details IS NULL OR char_length(details) <= 500),
        status report_status NOT NULL DEFAULT 'aberta',
        resolved_by uuid REFERENCES users (id) ON DELETE SET NULL,
        resolved_at timestamptz,
        resolution_note text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    // Uma denúncia aberta por pessoa e alvo (RN-093 conta denunciantes distintos).
    await q.query(
      `CREATE UNIQUE INDEX reports_unique_open_idx ON reports (reporter_id, target_type, target_id) WHERE status = 'aberta'`,
    );
    await q.query(`CREATE INDEX reports_target_idx ON reports (target_type, target_id)`);
    await q.query(`CREATE INDEX reports_status_idx ON reports (status, created_at)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE reports`);
    await q.query(`DROP TYPE report_status`);
    await q.query(`DROP TYPE report_reason`);
    await q.query(`DROP TYPE report_target`);
    await q.query(`DROP TABLE user_blocks`);
    await q.query(`DROP TABLE favorites`);
  }
}
