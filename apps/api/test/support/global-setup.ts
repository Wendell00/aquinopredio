import { Client } from "pg";

/**
 * Limpa o banco de teste antes de cada execução dos e2e, para um teste não esbarrar em dados
 * de execuções anteriores (ex.: prédio "duplicado" por proximidade). Recusa qualquer banco que
 * não seja de teste.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.CI
    ? process.env.DATABASE_URL
    : "postgresql://aquinopredio:aquinopredio@localhost:5433/aquinopredio_test";
  if (!url) return;
  if (!process.env.CI && !new URL(url).pathname.endsWith("_test")) {
    throw new Error(`Recusando limpar um banco que não é de teste: ${new URL(url).pathname}`);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
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
