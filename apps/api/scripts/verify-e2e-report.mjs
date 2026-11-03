#!/usr/bin/env node
// Verifica o relatório JSON do Jest (`--json --outputFile`) depois que a tarefa do turbo termina,
// num processo separado: um spec protegido ausente, com teste pulado/todo ou com falha reprova,
// assim como relatório ausente, inválido ou anterior à execução.
//
// Uso: node scripts/verify-e2e-report.mjs <relatorio.json> <inicio-da-execucao-em-ms>
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Specs de corrida (`describeIsolated`): sem eles o CI pode ficar verde sem testar concorrência.
const PROTECTED_SPECS = [
  "test/moderation-race.e2e-spec.ts",
  "test/moderation-runs.e2e-spec.ts",
  "test/report-moderation-race.e2e-spec.ts",
  "test/pause-race.e2e-spec.ts",
  "test/active-limit-race.e2e-spec.ts",
  "test/upload-claim-race.e2e-spec.ts",
  "test/building-verification-race.e2e-spec.ts",
  "test/building-submissions.e2e-spec.ts",
];

function fail(errors) {
  console.error("Relatório e2e reprovado:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/** Só os campos usados abaixo; qualquer divergência torna o relatório inválido. */
function shapeErrors(report) {
  if (!isObject(report)) return ["relatório inválido: raiz não é objeto"];
  const errors = [];
  if (typeof report.success !== "boolean")
    errors.push("relatório inválido: success não é booleano");
  for (const key of ["startTime", "numTotalTests", "numFailedTests", "numRuntimeErrorTestSuites"]) {
    if (typeof report[key] !== "number") errors.push(`relatório inválido: ${key} não é número`);
  }
  if (!Array.isArray(report.testResults)) {
    errors.push("relatório inválido: testResults não é lista");
    return errors;
  }
  report.testResults.forEach((result, index) => {
    if (
      !isObject(result) ||
      typeof result.name !== "string" ||
      typeof result.status !== "string" ||
      !Array.isArray(result.assertionResults) ||
      !result.assertionResults.every(
        (assertion) =>
          isObject(assertion) &&
          typeof assertion.status === "string" &&
          typeof assertion.fullName === "string",
      )
    ) {
      errors.push(`relatório inválido: testResults[${index}] fora do formato do Jest`);
    }
  });
  return errors;
}

const [reportPath, startedArg] = process.argv.slice(2);
if (!reportPath || !startedArg || !/^\d+$/.test(startedArg)) {
  fail(["uso: verify-e2e-report.mjs <relatorio.json> <inicio-em-ms>"]);
}
if (!existsSync(reportPath)) fail([`relatório ausente: ${reportPath}`]);

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (error) {
  fail([`relatório inválido: JSON ilegível (${error instanceof Error ? error.message : error})`]);
}
const invalid = shapeErrors(report);
if (invalid.length > 0) fail(invalid);

const errors = [];
if (report.startTime < Number(startedArg)) {
  errors.push("relatório anterior a esta execução (startTime menor que o início)");
}
if (!report.success || report.numFailedTests > 0 || report.numRuntimeErrorTestSuites > 0) {
  errors.push(
    `suíte com falha: success=${report.success}, ${report.numFailedTests} teste(s) e ${report.numRuntimeErrorTestSuites} suíte(s) com erro`,
  );
}

// A lista acima e os arquivos que usam `describeIsolated` precisam coincidir.
const onDisk = readdirSync(join(apiDir, "test"))
  .filter((file) => file.endsWith(".e2e-spec.ts"))
  .filter((file) => readFileSync(join(apiDir, "test", file), "utf8").includes("describeIsolated("))
  .map((file) => `test/${file}`);
for (const spec of onDisk) {
  if (!PROTECTED_SPECS.includes(spec))
    errors.push(`${spec} usa describeIsolated e não está na lista`);
}
for (const spec of PROTECTED_SPECS) {
  if (!onDisk.includes(spec)) errors.push(`${spec}: arquivo ausente ou sem describeIsolated`);
}

const summary = [];
for (const spec of PROTECTED_SPECS) {
  const results = report.testResults.filter(
    (result) => relative(apiDir, resolve(result.name)) === spec,
  );
  if (results.length !== 1) {
    errors.push(
      `${spec}: ${results.length === 0 ? "ausente do relatório" : "repetido no relatório"}`,
    );
    continue;
  }
  const [result] = results;
  if (result.status !== "passed") errors.push(`${spec}: suíte com status ${result.status}`);
  if (result.assertionResults.length === 0) errors.push(`${spec}: nenhum teste executado`);
  for (const assertion of result.assertionResults) {
    if (assertion.status !== "passed") {
      errors.push(`${spec}: "${assertion.fullName}" com status ${assertion.status}`);
    }
  }
  summary.push(`${spec}: ${result.assertionResults.length} aprovados`);
}

if (errors.length > 0) fail(errors);
console.warn(`Relatório e2e verificado: ${report.numTotalTests} testes, specs protegidos:`);
for (const line of summary) console.warn(`- ${line}`);
