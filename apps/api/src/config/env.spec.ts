import { validateEnv, webOrigins } from "./env";

describe("validateEnv", () => {
  const base = {
    DATABASE_URL: "postgresql://user:pass@localhost:5433/db",
    BETTER_AUTH_SECRET: "x".repeat(32),
  };

  it("aplica valores padrão", () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("development");
    expect(env.WEB_ORIGIN).toBe("http://localhost:3000");
    expect(env.AUTH_CHECK_PWNED_PASSWORDS).toBe(false);
  });

  it("trata chaves opcionais vazias como ausentes", () => {
    expect(validateEnv({ ...base, OPENROUTER_API_KEY: "" }).OPENROUTER_API_KEY).toBeUndefined();
  });

  it("falha sem DATABASE_URL", () => {
    expect(() => validateEnv({ BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("falha com banco que não é Postgres", () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: "mysql://localhost/db" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("exige segredo de autenticação forte", () => {
    expect(() => validateEnv({ ...base, BETTER_AUTH_SECRET: "curto" })).toThrow(/32 caracteres/);
  });

  it("exige as duas credenciais do Google juntas", () => {
    expect(() => validateEnv({ ...base, GOOGLE_CLIENT_ID: "id" })).toThrow(/definidos juntos/);
  });

  it("recusa chave VAPID malformada", () => {
    expect(() => validateEnv({ ...base, VAPID_PUBLIC_KEY: "abc def" })).toThrow(/VAPID/);
  });

  it("exige a chave do Resend quando ele é o transporte de e-mail", () => {
    expect(() => validateEnv({ ...base, MAIL_TRANSPORT: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(
      validateEnv({ ...base, MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_123" }).MAIL_TRANSPORT,
    ).toBe("resend");
  });

  it("proíbe aprovar sem IA em produção", () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: "production", MODERATION_WITHOUT_AI: "approve" }),
    ).toThrow(/produção/);
  });
});

describe("webOrigins", () => {
  it("inclui a origem do APP_URL sem duplicar", () => {
    expect(
      webOrigins({
        APP_URL: "http://localhost:3000/",
        WEB_ORIGIN: "http://localhost:3000, http://x.dev",
      }),
    ).toEqual(["http://localhost:3000", "http://x.dev"]);
  });
});
