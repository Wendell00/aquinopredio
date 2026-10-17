import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../../src/app.module";
import { setupApp } from "../../src/app.setup";
import { buildingInput } from "./fakes";

export const ORIGIN = "http://localhost:3000";

export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: ["error"],
  });
  setupApp(app);
  await app.init();
  // O rate limit do Better Auth fica no banco: cada suíte começa do zero.
  await resetRateLimits(app);
  return app;
}

/** Zera o rate limit do Better Auth (fica no banco) para um teste não afetar o outro. */
export async function resetRateLimits(app: INestApplication): Promise<void> {
  await app.get(DataSource).query("DELETE FROM rate_limits");
}

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.dev`;
}

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

/** Busca o último e-mail enviado para o endereço (Mailpit) e extrai o primeiro link. */
export async function lastLinkSentTo(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`,
    );
    const body = (await res.json()) as { messages: { ID: string }[] };
    const id = body.messages[0]?.ID;
    if (id) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text: string;
      };
      const link = message.Text.match(/https?:\/\/\S+/)?.[0];
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Nenhum e-mail com link para ${email}`);
}

/** Cria conta com e-mail/senha, confirma o e-mail e devolve o cookie de sessão. */
export async function signUpAndLogin(
  app: INestApplication,
  overrides: { email?: string; name?: string; password?: string } = {},
): Promise<{ cookie: string; email: string; password: string }> {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? "senha-bem-forte-123";
  const server = app.getHttpServer();
  await request(server)
    .post("/api/auth/sign-up/email")
    .set("Origin", ORIGIN)
    .send({ name: overrides.name ?? "Vizinha Teste", email, password })
    .expect(200);

  const link = new URL(await lastLinkSentTo(email));
  await request(server)
    .get(`${link.pathname}${link.search}`)
    .expect((res) => {
      if (res.status >= 400) throw new Error(`verificação falhou: ${res.status}`);
    });

  const login = await request(server)
    .post("/api/auth/sign-in/email")
    .set("Origin", ORIGIN)
    .send({ email, password })
    .expect(200);
  const cookie = ([] as string[])
    .concat(login.headers["set-cookie"] ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  return { cookie, email, password };
}

/** Faz uma requisição autenticada que altera estado (com Origin do app). */
export function as(app: INestApplication, cookie: string) {
  const server = app.getHttpServer();
  return {
    get: (url: string) => request(server).get(url).set("Cookie", cookie),
    post: (url: string) => request(server).post(url).set("Cookie", cookie).set("Origin", ORIGIN),
    put: (url: string) => request(server).put(url).set("Cookie", cookie).set("Origin", ORIGIN),
    patch: (url: string) => request(server).patch(url).set("Cookie", cookie).set("Origin", ORIGIN),
    delete: (url: string) =>
      request(server).delete(url).set("Cookie", cookie).set("Origin", ORIGIN),
  };
}

/** Nome de usuário único por execução (o índice é único no banco todo). */
export function uniqueUsername(prefix = "vizinho"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(
    0,
    20,
  );
}

/** Usuário pronto para o passo do prédio (cadastro + perfil). */
export async function onboardedProfile(app: INestApplication, name = "Vizinha Teste") {
  const session = await signUpAndLogin(app, { name });
  await as(app, session.cookie)
    .post("/api/me/profile")
    .send({ name, username: uniqueUsername(), acceptTerms: true, isAdult: true })
    .expect(201);
  return session;
}

/** Morador com prédio cadastrado (prédio fica `pendente_validacao`: só raio 0). */
export async function resident(
  app: INestApplication,
  overrides: Record<string, unknown> = {},
  name = "Morador Teste",
) {
  const session = await onboardedProfile(app, name);
  const created = await as(app, session.cookie)
    .post("/api/buildings")
    .send(buildingInput(overrides));
  if (created.status !== 201)
    throw new Error(`prédio: ${created.status} ${JSON.stringify(created.body)}`);
  return { ...session, buildingId: created.body.building.building.id as string };
}
