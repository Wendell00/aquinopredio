/**
 * Qual banco os e2e podem usar. `CI` e `GITHUB_ACTIONS` não entram na decisão: sozinhos, não
 * provam que o banco é descartável. Só o provisionador (`scripts/e2e-isolated.sh`) libera um
 * banco fora do local fixo, e só depois de a conexão confirmar o token e o cluster que ele criou.
 */

/** Fluxo local documentado (`pnpm db:up`): endereço fixo, nunca lido do ambiente. */
export const LOCAL_TEST_DATABASE_URL =
  "postgresql://aquinopredio:aquinopredio@localhost:5433/aquinopredio_test";

export type E2eDatabase =
  | { kind: "local"; url: string }
  | { kind: "isolated"; url: string; token: string; systemId: string };

/** Lança antes de qualquer conexão quando o ambiente não identifica o banco provisionado. */
export function resolveE2eDatabase(env: NodeJS.ProcessEnv): E2eDatabase {
  if (!env.E2E_ISOLATED) {
    if (env.E2E_REQUIRE_RACE) {
      throw new Error(
        "E2E_REQUIRE_RACE exige o banco descartável do e2e-isolated.sh (E2E_ISOLATED ausente)",
      );
    }
    return { kind: "local", url: LOCAL_TEST_DATABASE_URL };
  }
  const { DATABASE_URL: url, E2E_ISOLATION_TOKEN: token, E2E_PG_SYSTEM_ID: systemId } = env;
  if (!url || !token || !systemId) {
    throw new Error("E2E_ISOLATED exige DATABASE_URL, E2E_ISOLATION_TOKEN e E2E_PG_SYSTEM_ID");
  }
  if (new URL(url).hostname !== "127.0.0.1") {
    throw new Error("E2E_ISOLATED exige DATABASE_URL em 127.0.0.1");
  }
  return { kind: "isolated", url, token, systemId };
}

type Query = (sql: string) => Promise<{ token: string | null; system_id: string }[]>;

/** Confirma, pela conexão recebida, que o banco é o que o provisionador criou. */
export async function assertProvisionedDatabase(
  query: Query,
  target: Extract<E2eDatabase, { kind: "isolated" }>,
): Promise<void> {
  const [row] = await query(
    `SELECT (SELECT token FROM e2e_isolation LIMIT 1) AS token,
            (SELECT system_identifier::text FROM pg_control_system()) AS system_id`,
  );
  if (row?.token !== target.token || row?.system_id !== target.systemId) {
    throw new Error("O banco não é o descartável criado por e2e-isolated.sh (token ou cluster)");
  }
}
