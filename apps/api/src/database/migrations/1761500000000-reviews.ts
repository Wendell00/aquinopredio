import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Reputação do anunciante:
 * - `ad_recommendations`: vizinhos que indicam um anúncio (RN-086).
 * - `user_reviews`: nota 1–5 + comentário de quem conversou com o anunciante (RN-087).
 */
export class Reviews1761500000000 implements MigrationInterface {
  name = "Reviews1761500000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS ad_recommendations (
        ad_id uuid NOT NULL REFERENCES ads (id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (ad_id, user_id)
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS ad_recommendations_user_idx ON ad_recommendations (user_id)`,
    );
    await q.query(`
      CREATE TABLE IF NOT EXISTS user_reviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reviewer_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        reviewed_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        ad_id uuid REFERENCES ads (id) ON DELETE SET NULL,
        rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment text CHECK (comment IS NULL OR char_length(comment) <= 500),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (reviewer_id, reviewed_id),
        CHECK (reviewer_id <> reviewed_id)
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS user_reviews_reviewed_idx ON user_reviews (reviewed_id, created_at DESC)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS user_reviews`);
    await q.query(`DROP TABLE IF EXISTS ad_recommendations`);
  }
}
