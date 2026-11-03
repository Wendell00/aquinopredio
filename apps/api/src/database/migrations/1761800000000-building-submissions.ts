import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Validação de prédio atrasada (spec 5.16 item 2; §5.7 por analogia), P00-B5.2:
 * - `buildings.submission_id`: identidade da submissão em validação. Cada prédio existente recebe
 *   a sua (o default volátil é avaliado por linha);
 * - `building_verifications.submission_id`: submissão julgada (nulo nos registros anteriores);
 * - trigger: nova submissão quando o prédio volta a `pendente_validacao` vindo de outro estado
 *   (reenvio) ou quando um dado analisado muda de fato. Vale para qualquer escritor, inclusive
 *   instâncias antigas da aplicação.
 */
export class BuildingSubmissions1761800000000 implements MigrationInterface {
  name = "BuildingSubmissions1761800000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS submission_id uuid NOT NULL DEFAULT gen_random_uuid()`,
    );
    await q.query(`ALTER TABLE building_verifications ADD COLUMN IF NOT EXISTS submission_id uuid`);
    // Localização comparada pela representação binária: regravar o mesmo ponto não conta como mudança.
    await q.query(`
      CREATE OR REPLACE FUNCTION buildings_rotate_submission() RETURNS trigger AS $$
      BEGIN
        IF (NEW.status = 'pendente_validacao' AND OLD.status IS DISTINCT FROM 'pendente_validacao')
           OR NEW.name IS DISTINCT FROM OLD.name
           OR NEW.type IS DISTINCT FROM OLD.type
           OR NEW.cep IS DISTINCT FROM OLD.cep
           OR NEW.street IS DISTINCT FROM OLD.street
           OR NEW.number IS DISTINCT FROM OLD.number
           OR NEW.district IS DISTINCT FROM OLD.district
           OR NEW.city IS DISTINCT FROM OLD.city
           OR NEW.state IS DISTINCT FROM OLD.state
           OR ST_AsBinary(NEW.location) IS DISTINCT FROM ST_AsBinary(OLD.location)
           OR NEW.units_estimate IS DISTINCT FROM OLD.units_estimate
           OR NEW.facade_photo_url IS DISTINCT FROM OLD.facade_photo_url
        THEN
          NEW.submission_id := gen_random_uuid();
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await q.query(`DROP TRIGGER IF EXISTS buildings_rotate_submission ON buildings`);
    await q.query(`
      CREATE TRIGGER buildings_rotate_submission BEFORE UPDATE ON buildings
      FOR EACH ROW EXECUTE FUNCTION buildings_rotate_submission()`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS buildings_rotate_submission ON buildings`);
    await q.query(`DROP FUNCTION IF EXISTS buildings_rotate_submission()`);
    await q.query(`ALTER TABLE building_verifications DROP COLUMN IF EXISTS submission_id`);
    await q.query(`ALTER TABLE buildings DROP COLUMN IF EXISTS submission_id`);
  }
}
