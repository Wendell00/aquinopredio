import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Roda o verificador como o CI roda: processo separado, lendo um relatório em disco.
const apiDir = resolve(__dirname, "../..");
const script = join(apiDir, "scripts/verify-e2e-report.mjs");
const PROTECTED = [
  "moderation-race",
  "moderation-runs",
  "report-moderation-race",
  "pause-race",
  "active-limit-race",
  "upload-claim-race",
  "building-verification-race",
  "building-submissions",
];
const STARTED = 1_000;

type Assertion = { status: string; fullName: string };
type Result = { name: string; status: string; assertionResults: Assertion[] };

function result(spec: string, statuses: string[] = ["passed", "passed"]): Result {
  return {
    name: join(apiDir, "test", `${spec}.e2e-spec.ts`),
    status: statuses.every((status) => status === "passed") ? "passed" : "failed",
    assertionResults: statuses.map((status, index) => ({ status, fullName: `${spec} ${index}` })),
  };
}

function report(testResults: Result[], overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    startTime: STARTED + 1,
    numTotalTests: testResults.reduce((total, item) => total + item.assertionResults.length, 0),
    numFailedTests: 0,
    numRuntimeErrorTestSuites: 0,
    testResults,
    ...overrides,
  };
}

const complete = () => [...PROTECTED.map((spec) => result(spec)), result("health", ["passed"])];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "e2e-report-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function verify(content: string | null, started = STARTED) {
  const file = join(dir, "jest-e2e.json");
  if (content !== null) writeFileSync(file, content);
  const run = spawnSync(process.execPath, [script, file, String(started)], { encoding: "utf8" });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe("verificador do relatório e2e", () => {
  it("aprova quando os oito specs protegidos passaram por inteiro", () => {
    const run = verify(JSON.stringify(report(complete())));

    expect(run.output).toContain("specs protegidos");
    expect(run.status).toBe(0);
  });

  it("reprova spec protegido ausente", () => {
    const results = complete().filter((item) => !item.name.endsWith("pause-race.e2e-spec.ts"));

    const run = verify(JSON.stringify(report(results)));

    expect(run.status).toBe(1);
    expect(run.output).toContain("test/pause-race.e2e-spec.ts: ausente do relatório");
  });

  it("reprova spec com o mesmo nome fora de apps/api/test", () => {
    const results = complete().map((item) =>
      item.name.endsWith("pause-race.e2e-spec.ts")
        ? { ...item, name: join(dir, "test/pause-race.e2e-spec.ts") }
        : item,
    );

    const run = verify(JSON.stringify(report(results)));

    expect(run.status).toBe(1);
    expect(run.output).toContain("test/pause-race.e2e-spec.ts: ausente do relatório");
  });

  it.each(["pending", "todo", "skipped", "disabled"])("reprova teste %s", (status) => {
    const results = complete().map((item) =>
      item.name.endsWith("moderation-runs.e2e-spec.ts")
        ? { ...result("moderation-runs", ["passed", status]), status: "passed" }
        : item,
    );

    const run = verify(JSON.stringify(report(results)));

    expect(run.status).toBe(1);
    expect(run.output).toContain(`"moderation-runs 1" com status ${status}`);
  });

  it("reprova spec protegido sem testes executados", () => {
    const results = complete().map((item) =>
      item.name.endsWith("building-submissions.e2e-spec.ts")
        ? { ...item, assertionResults: [] }
        : item,
    );

    const run = verify(JSON.stringify(report(results)));

    expect(run.status).toBe(1);
    expect(run.output).toContain("building-submissions.e2e-spec.ts: nenhum teste executado");
  });

  it("reprova teste com falha", () => {
    const results = complete().map((item) =>
      item.name.endsWith("upload-claim-race.e2e-spec.ts")
        ? result("upload-claim-race", ["passed", "failed"])
        : item,
    );

    const run = verify(JSON.stringify(report(results, { success: false, numFailedTests: 1 })));

    expect(run.status).toBe(1);
    expect(run.output).toContain("upload-claim-race.e2e-spec.ts: suíte com status failed");
  });

  it("reprova relatório ausente", () => {
    const run = verify(null);

    expect(run.status).toBe(1);
    expect(run.output).toContain("relatório ausente");
  });

  it("reprova JSON ilegível", () => {
    const run = verify("{ não é json");

    expect(run.status).toBe(1);
    expect(run.output).toContain("JSON ilegível");
  });

  it("reprova relatório fora do formato do Jest", () => {
    const run = verify(JSON.stringify({ success: true, testResults: "nada" }));

    expect(run.status).toBe(1);
    expect(run.output).toContain("relatório inválido");
  });

  it("reprova relatório anterior à execução", () => {
    const run = verify(JSON.stringify(report(complete())), STARTED + 10);

    expect(run.status).toBe(1);
    expect(run.output).toContain("anterior a esta execução");
  });
});
