import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../../src/app.module";
import { setupApp } from "../../src/app.setup";

export const ORIGIN = "http://localhost:3000";

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: ["error"],
  });
  setupApp(app);
  await app.init();
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
