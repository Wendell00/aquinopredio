import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { assertProvisionedDatabase, resolveE2eDatabase } from "./e2e-database";

/**
 * Specs de corrida mexem com locks e triggers de teste: só rodam no banco descartável do
 * `scripts/e2e-isolated.sh` (inclusive no CI, que usa o mesmo script). Fora disso ficam pulados
 * (e aparecem como pulados no relatório do Jest, nunca como aprovados). `CI`/`GITHUB_ACTIONS` não
 * liberam: não provam que o banco é descartável.
 */
const target = resolveE2eDatabase(process.env);
export const canRunRaceSpecs = target.kind === "isolated";

export const describeIsolated = canRunRaceSpecs ? describe : describe.skip;

if (!canRunRaceSpecs) {
  console.warn(
    "Specs de corrida pulados: rode com `pnpm test:e2e:ci` ou `pnpm --filter api test:e2e:isolated`.",
  );
}

/** Confirma, pela conexão do próprio app, que o banco é o descartável criado pelo script. */
export async function assertIsolated(app: INestApplication): Promise<void> {
  if (target.kind !== "isolated") return;
  const dataSource = app.get(DataSource);
  await assertProvisionedDatabase((sql) => dataSource.query(sql), target);
}
