import type { MigrationInterface, QueryRunner } from "typeorm";

const OPTIONS = [
  "todos_os_dias",
  "dias_uteis",
  "fins_de_semana",
  "horario_comercial",
  "noites",
  "a_combinar",
];

/**
 * Disponibilidade do anúncio deixa de ser texto livre e vira uma lista fixa.
 * Textos antigos não têm equivalente seguro, então são descartados (o detalhe pode ir na descrição).
 */
export class AdAvailabilityOptions1761100000000 implements MigrationInterface {
  name = "AdAvailabilityOptions1761100000000";

  async up(q: QueryRunner): Promise<void> {
    const list = OPTIONS.map((option) => `'${option}'`).join(", ");
    await q.query(`ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_availability_check`);
    await q.query(`UPDATE ads SET availability = NULL WHERE availability NOT IN (${list})`);
    await q.query(`ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_availability_option_check`);
    await q.query(
      `ALTER TABLE ads ADD CONSTRAINT ads_availability_option_check CHECK (availability IS NULL OR availability IN (${list}))`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_availability_option_check`);
    await q.query(
      `ALTER TABLE ads ADD CONSTRAINT ads_availability_check CHECK (availability IS NULL OR char_length(availability) <= 200)`,
    );
  }
}
