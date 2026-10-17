import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Nome de usuário único (@fulano). Fica nulo só até o passo de perfil do onboarding;
 * quem já passou dele recebe um nome provisório, que pode trocar no perfil.
 */
export class Usernames1761200000000 implements MigrationInterface {
  name = "Usernames1761200000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username text`);
    await q.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_format_check`);
    await q.query(
      `ALTER TABLE users ADD CONSTRAINT users_username_format_check
         CHECK (username IS NULL OR username ~ '^[a-z][a-z0-9_.]{2,19}$')`,
    );
    await q.query(
      `UPDATE users SET username = 'vizinho_' || substr(replace(id::text, '-', ''), 1, 10)
       WHERE username IS NULL AND terms_accepted_at IS NOT NULL AND status <> 'excluido'`,
    );
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS users_username_key`);
    await q.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_format_check`);
    await q.query(`ALTER TABLE users DROP COLUMN IF EXISTS username`);
  }
}
