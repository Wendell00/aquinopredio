import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../../src/app.module";
import { setupApp } from "../../src/app.setup";
import { type BackgroundTracker, trackBackground } from "./background";
import { assertProvisionedDatabase, resolveE2eDatabase } from "./e2e-database";
import { buildingInput } from "./fakes";
import { type ModerationTracker, trackModeration } from "./moderation";

export const ORIGIN = "http://localhost:3000";

export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  // O global-setup já confirmou o banco antes de qualquer escrita; aqui a confirmação é pela
  // conexão do próprio app, antes de qualquer requisição.
  const target = resolveE2eDatabase(process.env);
  if (target.kind === "isolated") {
    const dataSource = moduleRef.get(DataSource);
    await assertProvisionedDatabase((sql) => dataSource.query(sql), target);
  }
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: ["error"],
  });
  setupApp(app);
  await app.init();
  // Rastreio instalado antes de qualquer requisição que dispare tarefas em segundo plano.
  const background = trackBackground(app);
  backgrounds.set(app, background);
  // Escuta já em 127.0.0.1. Sem isso o supertest faz `listen(0)` no curinga `::` e chama
  // `127.0.0.1:porta`; no macOS outro processo pode ocupar a mesma porta só em 127.0.0.1 e
  // receber a requisição (401 com corpo alheio; pendurada, ela prende o servidor nessa porta e
  // trava todas as requisições seguintes do spec).
  await app.listen(0, "127.0.0.1");
  // O rate limit do Better Auth fica no banco: cada suíte começa do zero.
  await resetRateLimits(app);
  const tracker = trackModeration(app);
  trackers.set(app, tracker);
  // Moderação roda em segundo plano: fecha o app só depois de as análises pendentes terminarem.
  const close = app.close.bind(app);
  app.close = async () => {
    await tracker.settleAll().catch(() => undefined);
    // Validações e notificações: o app fecha mesmo se a espera falhar, e o erro é relançado.
    let failure: unknown = null;
    try {
      await background.settleAll();
    } catch (error) {
      failure = error;
    } finally {
      await close();
    }
    if (failure) throw failure;
  };
  return app;
}

const trackers = new WeakMap<INestApplication, ModerationTracker>();
const backgrounds = new WeakMap<INestApplication, BackgroundTracker>();

export function backgroundTracker(app: INestApplication): BackgroundTracker {
  const tracker = backgrounds.get(app);
  if (!tracker) throw new Error("App de teste sem rastreio de segundo plano (use createTestApp)");
  return tracker;
}

/**
 * Espera a validação de prédio que o próprio fluxo disparou (a `index`-ésima do prédio) e devolve
 * o resultado real. Não chama `verify` de novo: a chamada extra concorreria com a real.
 */
export function verificationSettled(app: INestApplication, buildingId: string, index = 0) {
  return backgroundTracker(app).verifications.nth(
    buildingId,
    index,
    `validação #${index} do prédio`,
  );
}

/** Espera todas as validações e notificações pendentes (use no `afterEach`). */
export function backgroundSettled(app: INestApplication): Promise<void> {
  return backgroundTracker(app).settleAll();
}

export function moderationTracker(app: INestApplication): ModerationTracker {
  const tracker = trackers.get(app);
  if (!tracker) throw new Error("App de teste sem rastreio de moderação (use createTestApp)");
  return tracker;
}

/**
 * Espera a moderação que o próprio fluxo disparou em segundo plano e devolve o último resultado.
 * Não dispara uma segunda análise: com a execução única por episódio ela seria recusada (spec 5.16).
 */
export function moderationSettled(app: INestApplication, adId: string) {
  return moderationTracker(app).settled(adId);
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
