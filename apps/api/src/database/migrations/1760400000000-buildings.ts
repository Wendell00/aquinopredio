import type { MigrationInterface, QueryRunner } from "typeorm";

export class Buildings1760400000000 implements MigrationInterface {
  name = "Buildings1760400000000";

  async up(q: QueryRunner): Promise<void> {
    // `unaccent` não é IMMUTABLE; o wrapper permite usá-lo em índice (busca por nome sem acento).
    await q.query(`
      CREATE FUNCTION f_unaccent(text) RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
      AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$`);

    await q.query(`CREATE TYPE building_type AS ENUM ('edificio', 'condominio_horizontal')`);
    await q.query(
      `CREATE TYPE building_status AS ENUM ('pendente_validacao', 'verificado', 'pendente_revisao', 'rejeitado', 'arquivado')`,
    );
    await q.query(`CREATE TYPE join_policy AS ENUM ('automatica', 'aprovacao_admin')`);

    await q.query(`
      CREATE TABLE buildings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
        type building_type NOT NULL,
        cep char(8) NOT NULL CHECK (cep ~ '^[0-9]{8}$'),
        street text NOT NULL,
        number text NOT NULL,
        district text NOT NULL,
        city text NOT NULL,
        state char(2) NOT NULL,
        location geography(Point, 4326) NOT NULL,
        units_estimate integer CHECK (units_estimate IS NULL OR units_estimate BETWEEN 1 AND 5000),
        facade_photo_url text,
        status building_status NOT NULL DEFAULT 'pendente_validacao',
        join_policy join_policy NOT NULL DEFAULT 'automatica',
        created_by uuid REFERENCES users (id) ON DELETE SET NULL,
        resubmissions integer NOT NULL DEFAULT 0,
        rejection_reason text,
        suggested_name text,
        last_activity_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX buildings_location_idx ON buildings USING gist (location)`);
    await q.query(`CREATE INDEX buildings_cep_number_idx ON buildings (cep, number)`);
    await q.query(`CREATE INDEX buildings_created_by_idx ON buildings (created_by, created_at)`);
    await q.query(`CREATE INDEX buildings_status_idx ON buildings (status)`);
    await q.query(
      `CREATE INDEX buildings_name_trgm_idx ON buildings USING gin (f_unaccent(lower(name)) gin_trgm_ops)`,
    );

    await q.query(`CREATE TYPE membership_role AS ENUM ('morador', 'admin')`);
    await q.query(
      `CREATE TYPE membership_status AS ENUM ('pendente', 'ativo', 'recusado', 'removido')`,
    );
    await q.query(`CREATE TYPE verification_method AS ENUM ('admin', 'vizinhos', 'comprovante')`);
    await q.query(`
      CREATE TABLE building_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        building_id uuid NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
        -- Unidade é privada (RN-007): só o admin do prédio e a plataforma veem.
        unit text NOT NULL CHECK (char_length(unit) BETWEEN 1 AND 30),
        role membership_role NOT NULL DEFAULT 'morador',
        status membership_status NOT NULL,
        verified_at timestamptz,
        verified_method verification_method,
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, building_id)
      )`);
    await q.query(
      `CREATE INDEX building_memberships_building_idx ON building_memberships (building_id, status)`,
    );

    await q.query(`ALTER TABLE users ADD CONSTRAINT users_primary_building_fk
      FOREIGN KEY (primary_building_id) REFERENCES buildings (id) ON DELETE SET NULL`);
    await q.query(`CREATE INDEX users_primary_building_idx ON users (primary_building_id)`);

    await q.query(
      `CREATE TYPE verification_decision AS ENUM ('verificado', 'pendente_revisao', 'rejeitado')`,
    );
    await q.query(`CREATE TYPE verification_decider AS ENUM ('ia', 'regras', 'admin')`);
    await q.query(`
      CREATE TABLE building_verifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        building_id uuid NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
        input jsonb NOT NULL,
        output jsonb,
        score numeric(3, 2) CHECK (score BETWEEN 0 AND 1),
        decision verification_decision NOT NULL,
        decided_by verification_decider NOT NULL,
        reviewer_id uuid REFERENCES users (id) ON DELETE SET NULL,
        model text,
        prompt_version text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX building_verifications_building_idx ON building_verifications (building_id, created_at DESC)`,
    );

    // Registro de cada chamada de IA: custo, latência, versão do prompt (docs §4.4).
    await q.query(
      `CREATE TYPE ai_task AS ENUM ('ad_generation', 'building_validation', 'moderation')`,
    );
    await q.query(`
      CREATE TABLE ai_calls (
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
    await q.query(`CREATE INDEX ai_calls_user_task_idx ON ai_calls (user_id, task, created_at)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE ai_calls`);
    await q.query(`DROP TYPE ai_task`);
    await q.query(`DROP TABLE building_verifications`);
    await q.query(`DROP TYPE verification_decider`);
    await q.query(`DROP TYPE verification_decision`);
    await q.query(`ALTER TABLE users DROP CONSTRAINT users_primary_building_fk`);
    await q.query(`DROP INDEX users_primary_building_idx`);
    await q.query(`DROP TABLE building_memberships`);
    await q.query(`DROP TYPE verification_method`);
    await q.query(`DROP TYPE membership_status`);
    await q.query(`DROP TYPE membership_role`);
    await q.query(`DROP TABLE buildings`);
    await q.query(`DROP TYPE join_policy`);
    await q.query(`DROP TYPE building_status`);
    await q.query(`DROP TYPE building_type`);
    await q.query(`DROP FUNCTION f_unaccent(text)`);
  }
}
