import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Tabelas de identidade do Better Auth (geradas por `getMigrations` com o mapeamento snake_case
 * de `src/auth/auth.ts`) + colunas do app em `users`.
 */
export class AuthAndUsers1760300000000 implements MigrationInterface {
  name = "AuthAndUsers1760300000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await q.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);

    await q.query(
      `CREATE TYPE user_status AS ENUM ('onboarding_pendente', 'ativo', 'suspenso', 'banido', 'excluido')`,
    );
    await q.query(`CREATE TYPE user_role AS ENUM ('user', 'platform_admin')`);

    await q.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        email_verified boolean NOT NULL,
        image text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        -- Colunas do app (não gerenciadas pelo Better Auth)
        phone text UNIQUE,
        status user_status NOT NULL DEFAULT 'onboarding_pendente',
        role user_role NOT NULL DEFAULT 'user',
        primary_building_id uuid,
        terms_accepted_at timestamptz,
        suspended_until timestamptz,
        notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
        deleted_at timestamptz
      )`);

    await q.query(`
      CREATE TABLE sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        expires_at timestamptz NOT NULL,
        token text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL,
        ip_address text,
        user_agent text,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX sessions_user_id_idx ON sessions (user_id)`);

    await q.query(`
      CREATE TABLE accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id text NOT NULL,
        provider_id text NOT NULL,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        access_token text,
        refresh_token text,
        id_token text,
        access_token_expires_at timestamptz,
        refresh_token_expires_at timestamptz,
        scope text,
        password text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL
      )`);
    await q.query(`CREATE INDEX accounts_user_id_idx ON accounts (user_id)`);

    await q.query(`
      CREATE TABLE verifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        identifier text NOT NULL,
        value text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX verifications_identifier_idx ON verifications (identifier)`);

    await q.query(`
      CREATE TABLE rate_limits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key text NOT NULL UNIQUE,
        count integer NOT NULL,
        last_request bigint NOT NULL
      )`);

    // RN-009: identidades banidas guardadas como hash (sem o dado em claro).
    await q.query(`CREATE TYPE banned_identity_kind AS ENUM ('email', 'phone')`);
    await q.query(`
      CREATE TABLE banned_identities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind banned_identity_kind NOT NULL,
        hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (kind, hash)
      )`);

    // Itens [configurável] dos docs (chave/valor). Os padrões ficam no código (SettingsService).
    await q.query(`
      CREATE TABLE settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES users (id) ON DELETE SET NULL
      )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE settings`);
    await q.query(`DROP TABLE banned_identities`);
    await q.query(`DROP TYPE banned_identity_kind`);
    await q.query(`DROP TABLE rate_limits`);
    await q.query(`DROP TABLE verifications`);
    await q.query(`DROP TABLE accounts`);
    await q.query(`DROP TABLE sessions`);
    await q.query(`DROP TABLE users`);
    await q.query(`DROP TYPE user_role`);
    await q.query(`DROP TYPE user_status`);
  }
}
