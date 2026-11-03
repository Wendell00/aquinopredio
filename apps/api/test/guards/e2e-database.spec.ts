// Proteção do banco dos e2e sem banco nenhum: o `pg` é substituído por um registro de eventos, e
// as URLs são fictícias (`.invalid` nunca resolve). Recusa = nenhum `Client` criado.
const events: string[] = [];
const rows: { token: string | null; system_id: string }[] = [];

jest.mock("pg", () => ({
  Client: class {
    constructor({ connectionString }: { connectionString: string }) {
      events.push(`new ${new URL(connectionString).host}`);
    }
    async connect(): Promise<void> {
      events.push("connect");
    }
    async query(sql: string): Promise<{ rows: unknown[] }> {
      if (sql.includes("e2e_isolation")) {
        events.push("identity");
        return { rows };
      }
      if (sql.includes("to_regclass")) return { rows: [{ exists: true }] };
      events.push(sql.trim().split(/\s+/)[0] ?? "");
      return { rows: [] };
    }
    async end(): Promise<void> {
      events.push("end");
    }
  },
}));

import globalSetup from "../support/global-setup";

const HOSTED = "postgresql://usuario:senha-ficticia@banco-hospedado.example.invalid:5432/postgres";
const PROVISIONED = "postgresql://e2e_x:senha-ficticia@127.0.0.1:55432/e2e_y";
const original = { ...process.env };

function setEnv(values: Record<string, string>): void {
  for (const key of [
    "CI",
    "GITHUB_ACTIONS",
    "DATABASE_URL",
    "E2E_ISOLATED",
    "E2E_ISOLATION_TOKEN",
    "E2E_PG_SYSTEM_ID",
    "E2E_REQUIRE_RACE",
  ]) {
    delete process.env[key];
  }
  Object.assign(process.env, values);
}

function loadIsolation(): typeof import("../support/isolation") {
  let loaded: typeof import("../support/isolation") | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual("../support/isolation");
  });
  if (!loaded) throw new Error("isolation.ts não carregou");
  return loaded;
}

beforeEach(() => {
  events.length = 0;
  rows.length = 0;
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  process.env = { ...original };
  jest.restoreAllMocks();
});

describe("global-setup dos e2e", () => {
  it("CI e GITHUB_ACTIONS sozinhos não fazem limpar a DATABASE_URL do ambiente", async () => {
    setEnv({ CI: "true", GITHUB_ACTIONS: "true", DATABASE_URL: HOSTED });

    await globalSetup();

    // Fluxo local restrito: só o banco fixo de teste, nunca o host do ambiente.
    expect(events).toEqual(["new localhost:5433", "connect", "TRUNCATE", "end"]);
  });

  it("recusa E2E_ISOLATED sem token e cluster antes de conectar", async () => {
    setEnv({ CI: "true", GITHUB_ACTIONS: "true", E2E_ISOLATED: "1", DATABASE_URL: PROVISIONED });

    await expect(globalSetup()).rejects.toThrow("E2E_ISOLATION_TOKEN");
    expect(events).toEqual([]);
  });

  it("recusa E2E_ISOLATED com host fora de 127.0.0.1 antes de conectar", async () => {
    setEnv({
      E2E_ISOLATED: "1",
      E2E_ISOLATION_TOKEN: "token-ficticio",
      E2E_PG_SYSTEM_ID: "123",
      DATABASE_URL: HOSTED,
    });

    await expect(globalSetup()).rejects.toThrow("127.0.0.1");
    expect(events).toEqual([]);
  });

  it("recusa E2E_REQUIRE_RACE sem o banco descartável antes de conectar", async () => {
    setEnv({ CI: "true", GITHUB_ACTIONS: "true", E2E_REQUIRE_RACE: "1", DATABASE_URL: HOSTED });

    await expect(globalSetup()).rejects.toThrow("E2E_REQUIRE_RACE");
    expect(events).toEqual([]);
  });

  it.each([
    ["token diferente", { token: "outro-token", system_id: "123" }],
    ["cluster diferente", { token: "token-ficticio", system_id: "999" }],
    ["sem token gravado", { token: null, system_id: "123" }],
  ])("não executa TRUNCATE com %s", async (_case, row) => {
    setEnv({
      E2E_ISOLATED: "1",
      E2E_ISOLATION_TOKEN: "token-ficticio",
      E2E_PG_SYSTEM_ID: "123",
      DATABASE_URL: PROVISIONED,
    });
    rows.push(row);

    await expect(globalSetup()).rejects.toThrow("token ou cluster");
    expect(events).toEqual(["new 127.0.0.1:55432", "connect", "identity", "end"]);
  });

  it("limpa o banco provisionado só depois de conferir a identidade", async () => {
    setEnv({
      E2E_ISOLATED: "1",
      E2E_ISOLATION_TOKEN: "token-ficticio",
      E2E_PG_SYSTEM_ID: "123",
      DATABASE_URL: PROVISIONED,
    });
    rows.push({ token: "token-ficticio", system_id: "123" });

    await globalSetup();

    expect(events).toEqual(["new 127.0.0.1:55432", "connect", "identity", "TRUNCATE", "end"]);
  });
});

describe("specs de corrida", () => {
  it("ficam pulados com CI e GITHUB_ACTIONS sem o banco descartável", () => {
    setEnv({ CI: "true", GITHUB_ACTIONS: "true", DATABASE_URL: HOSTED });

    const isolation = loadIsolation();

    expect(isolation.canRunRaceSpecs).toBe(false);
    expect(isolation.describeIsolated).toBe(describe.skip);
  });

  it("E2E_REQUIRE_RACE reprova em vez de pular", () => {
    setEnv({ GITHUB_ACTIONS: "true", E2E_REQUIRE_RACE: "1" });

    expect(loadIsolation).toThrow("E2E_REQUIRE_RACE");
  });

  it("rodam só com o banco provisionado identificado", () => {
    setEnv({
      E2E_ISOLATED: "1",
      E2E_ISOLATION_TOKEN: "token-ficticio",
      E2E_PG_SYSTEM_ID: "123",
      DATABASE_URL: PROVISIONED,
    });

    expect(loadIsolation().canRunRaceSpecs).toBe(true);
  });
});

describe("setup-env dos e2e", () => {
  it("ignora a DATABASE_URL do ambiente fora do banco descartável", () => {
    setEnv({ CI: "true", GITHUB_ACTIONS: "true", DATABASE_URL: HOSTED });

    jest.isolateModules(() => {
      jest.requireActual("../support/setup-env");
    });

    expect(process.env.DATABASE_URL).toBe(
      "postgresql://aquinopredio:aquinopredio@localhost:5433/aquinopredio_test",
    );
  });
});
