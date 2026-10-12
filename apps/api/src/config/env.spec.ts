import { validateEnv } from "./env";

describe("validateEnv", () => {
  const base = { DATABASE_URL: "postgresql://user:pass@localhost:5433/db" };

  it("aplica valores padrão", () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("development");
    expect(env.WEB_ORIGIN).toBe("http://localhost:3000");
  });

  it("trata chaves opcionais vazias como ausentes", () => {
    expect(validateEnv({ ...base, OPENROUTER_API_KEY: "" }).OPENROUTER_API_KEY).toBeUndefined();
  });

  it("falha sem DATABASE_URL", () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it("falha com banco que não é Postgres", () => {
    expect(() => validateEnv({ DATABASE_URL: "mysql://localhost/db" })).toThrow(/DATABASE_URL/);
  });
});
