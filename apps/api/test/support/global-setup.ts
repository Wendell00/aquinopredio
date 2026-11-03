import { Client } from "pg";
import { assertProvisionedDatabase, resolveE2eDatabase } from "./e2e-database";

/**
 * Limpa o banco antes de cada execução dos e2e, para um teste não esbarrar em dados de execuções
 * anteriores (ex.: prédio "duplicado" por proximidade). Roda antes de qualquer spec, então também
 * barra as migrations do boot do app: o alvo é resolvido sem conexão e, no banco descartável, a
 * identidade é confirmada antes do TRUNCATE.
 */
export default async function globalSetup(): Promise<void> {
  const target = resolveE2eDatabase(process.env);
  const client = new Client({ connectionString: target.url });
  await client.connect();
  try {
    if (target.kind === "isolated") {
      await assertProvisionedDatabase(async (sql) => (await client.query(sql)).rows, target);
    }
    const { rows } = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.users') IS NOT NULL AS exists",
    );
    if (rows[0]?.exists) {
      await client.query(
        `TRUNCATE users, buildings, rate_limits, verifications, banned_identities, settings, uploads, ai_calls RESTART IDENTITY CASCADE`,
      );
    }
  } finally {
    await client.end();
  }
}
