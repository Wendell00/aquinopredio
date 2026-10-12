import type { MigrationInterface, QueryRunner } from "typeorm";

/** Categorias iniciais (RN-060). Ícones são nomes do lucide-react. */
const CATEGORIES: [string, string, string][] = [
  ["Alimentação", "alimentacao", "utensils"],
  ["Beleza e Estética", "beleza-estetica", "sparkles"],
  ["Saúde e Bem-estar", "saude-bem-estar", "heart-pulse"],
  ["Aulas e Educação", "aulas-educacao", "graduation-cap"],
  ["Reparos e Manutenção", "reparos-manutencao", "wrench"],
  ["Limpeza e Organização", "limpeza-organizacao", "spray-can"],
  ["Pets", "pets", "paw-print"],
  ["Crianças e Babás", "criancas-babas", "baby"],
  ["Tecnologia", "tecnologia", "laptop"],
  ["Moda e Acessórios", "moda-acessorios", "shirt"],
  ["Casa e Decoração", "casa-decoracao", "sofa"],
  ["Eletrônicos", "eletronicos", "smartphone"],
  ["Veículos e Vagas de Garagem", "veiculos-vagas", "car"],
  ["Eventos e Festas", "eventos-festas", "party-popper"],
  ["Transporte e Caronas", "transporte-caronas", "bus"],
  ["Outros", "outros", "package"],
];

export class Ads1760500000000 implements MigrationInterface {
  name = "Ads1760500000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        slug text NOT NULL UNIQUE,
        icon text NOT NULL,
        sort_order integer NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    for (const [index, [name, slug, icon]] of CATEGORIES.entries()) {
      await q.query(
        `INSERT INTO categories (name, slug, icon, sort_order) VALUES ($1, $2, $3, $4)`,
        [name, slug, icon, index + 1],
      );
    }

    // Imagens enviadas (já reprocessadas e sem EXIF). Ficam "soltas" até entrarem num anúncio.
    await q.query(`
      CREATE TABLE uploads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        key text NOT NULL UNIQUE,
        thumb_key text NOT NULL,
        width integer NOT NULL,
        height integer NOT NULL,
        bytes integer NOT NULL,
        purpose text NOT NULL CHECK (purpose IN ('ad', 'avatar', 'chat', 'facade')),
        attached_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX uploads_owner_idx ON uploads (owner_id, created_at)`);

    // Texto de busca do anúncio (português, sem acento). IMMUTABLE para poder ser coluna gerada.
    await q.query(`
      CREATE FUNCTION ad_search_vector(title text, tags text[], description text) RETURNS tsvector
      LANGUAGE sql IMMUTABLE PARALLEL SAFE
      AS $$
        SELECT setweight(to_tsvector('portuguese'::regconfig, f_unaccent(title)), 'A') ||
               setweight(to_tsvector('portuguese'::regconfig, f_unaccent(coalesce(array_to_string(tags, ' '), ''))), 'B') ||
               setweight(to_tsvector('portuguese'::regconfig, f_unaccent(description)), 'C')
      $$`);

    await q.query(`CREATE TYPE ad_type AS ENUM ('servico', 'produto', 'procura')`);
    await q.query(
      `CREATE TYPE ad_status AS ENUM ('rascunho', 'em_moderacao', 'ativo', 'pausado', 'expirado', 'removido', 'excluido')`,
    );
    await q.query(
      `CREATE TYPE price_mode AS ENUM ('fixo', 'a_partir_de', 'a_combinar', 'gratuito')`,
    );
    await q.query(`
      CREATE TABLE ads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        building_id uuid NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
        type ad_type NOT NULL,
        category_id uuid NOT NULL REFERENCES categories (id),
        title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 80),
        description text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2000),
        price_mode price_mode NOT NULL,
        price_cents integer CHECK (price_cents IS NULL OR price_cents BETWEEN 0 AND 100000000),
        radius_m integer NOT NULL CHECK (radius_m BETWEEN 0 AND 10000),
        -- Cópia da localização do prédio de origem (desnormalizada para a consulta do feed).
        location geography(Point, 4326) NOT NULL,
        whatsapp_enabled boolean NOT NULL DEFAULT false,
        availability text CHECK (availability IS NULL OR char_length(availability) <= 200),
        tags text[] NOT NULL DEFAULT '{}',
        status ad_status NOT NULL,
        status_reason text,
        ai_generated boolean NOT NULL DEFAULT false,
        expires_at timestamptz,
        bumped_at timestamptz,
        published_at timestamptz,
        expiry_warned_at timestamptz,
        report_count integer NOT NULL DEFAULT 0,
        search_vector tsvector GENERATED ALWAYS AS (ad_search_vector(title, tags, description)) STORED,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX ads_location_active_idx ON ads USING gist (location) WHERE status = 'ativo'`,
    );
    await q.query(`CREATE INDEX ads_user_status_idx ON ads (user_id, status)`);
    await q.query(`CREATE INDEX ads_building_status_idx ON ads (building_id, status)`);
    await q.query(`CREATE INDEX ads_category_idx ON ads (category_id)`);
    await q.query(`CREATE INDEX ads_expires_idx ON ads (expires_at) WHERE status = 'ativo'`);
    await q.query(`CREATE INDEX ads_search_idx ON ads USING gin (search_vector)`);
    await q.query(
      `CREATE INDEX ads_title_trgm_idx ON ads USING gin (lower(title || ' ' || description) gin_trgm_ops)`,
    );

    await q.query(`
      CREATE TABLE ad_images (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ad_id uuid NOT NULL REFERENCES ads (id) ON DELETE CASCADE,
        upload_id uuid NOT NULL REFERENCES uploads (id) ON DELETE CASCADE,
        position smallint NOT NULL CHECK (position BETWEEN 0 AND 5),
        UNIQUE (ad_id, position),
        UNIQUE (upload_id)
      )`);

    await q.query(`CREATE TYPE ai_tone AS ENUM ('amigavel', 'formal', 'direto')`);
    await q.query(`
      CREATE TABLE ai_ad_drafts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('gerar', 'melhorar')),
        input_text text,
        input_upload_ids uuid[] NOT NULL DEFAULT '{}',
        tone ai_tone NOT NULL,
        output jsonb NOT NULL,
        ad_id uuid REFERENCES ads (id) ON DELETE SET NULL,
        model text NOT NULL,
        prompt_version text NOT NULL,
        tokens_in integer,
        tokens_out integer,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX ai_ad_drafts_user_idx ON ai_ad_drafts (user_id, created_at)`);

    await q.query(`CREATE TYPE moderation_decision AS ENUM ('aprovado', 'revisar', 'proibido')`);
    await q.query(`
      CREATE TABLE ad_moderations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ad_id uuid NOT NULL REFERENCES ads (id) ON DELETE CASCADE,
        decision moderation_decision NOT NULL,
        decided_by verification_decider NOT NULL,
        violated_categories text[] NOT NULL DEFAULT '{}',
        reason text,
        confidence numeric(3, 2),
        reviewer_id uuid REFERENCES users (id) ON DELETE SET NULL,
        model text,
        prompt_version text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX ad_moderations_ad_idx ON ad_moderations (ad_id, created_at DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE ad_moderations`);
    await q.query(`DROP TYPE moderation_decision`);
    await q.query(`DROP TABLE ai_ad_drafts`);
    await q.query(`DROP TYPE ai_tone`);
    await q.query(`DROP TABLE ad_images`);
    await q.query(`DROP TABLE ads`);
    await q.query(`DROP TYPE price_mode`);
    await q.query(`DROP TYPE ad_status`);
    await q.query(`DROP TYPE ad_type`);
    await q.query(`DROP FUNCTION ad_search_vector(text, text[], text)`);
    await q.query(`DROP TABLE uploads`);
    await q.query(`DROP TABLE categories`);
  }
}
