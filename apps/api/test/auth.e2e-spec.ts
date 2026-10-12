import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, ORIGIN, resetRateLimits, signUpAndLogin, uniqueEmail } from "./support/app";

describe("Autenticação (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("recusa rotas protegidas sem sessão", async () => {
    await request(app.getHttpServer()).get("/api/me").expect(401);
  });

  it("não deixa entrar antes de confirmar o e-mail", async () => {
    const email = uniqueEmail("sem-confirmar");
    const server = app.getHttpServer();
    await request(server)
      .post("/api/auth/sign-up/email")
      .set("Origin", ORIGIN)
      .send({ name: "Fulano", email, password: "senha-bem-forte-123" })
      .expect(200);
    const login = await request(server)
      .post("/api/auth/sign-in/email")
      .set("Origin", ORIGIN)
      .send({ email, password: "senha-bem-forte-123" });
    expect(login.status).toBe(403);
  });

  it("exige senha com pelo menos 10 caracteres", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .set("Origin", ORIGIN)
      .send({ name: "Fulano", email: uniqueEmail(), password: "curta" });
    expect(res.status).toBe(400);
  });

  it("recusa login vindo de outra origem (CSRF)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .set("Origin", "https://site-malicioso.example")
      .send({ email: uniqueEmail(), password: "qualquer-coisa-123" });
    expect(res.status).toBe(403);
  });

  it("cadastro → confirmação → login → onboarding do perfil", async () => {
    const { cookie } = await signUpAndLogin(app, { name: "Maria" });
    const server = app.getHttpServer();

    const me = await request(server).get("/api/me").set("Cookie", cookie).expect(200);
    expect(me.body).toMatchObject({
      name: "Maria",
      status: "onboarding_pendente",
      onboardingStep: "perfil",
    });
    expect(me.body).not.toHaveProperty("password");

    await request(server)
      .post("/api/me/profile")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ name: "Maria do 42", acceptTerms: false, isAdult: true })
      .expect(400);

    const done = await request(server)
      .post("/api/me/profile")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ name: "Maria do 42", acceptTerms: true, isAdult: true })
      .expect(201);
    expect(done.body).toMatchObject({ name: "Maria do 42", onboardingStep: "predio" });
  });

  it("recusa alterações vindas de outra origem nas rotas do app", async () => {
    const { cookie } = await signUpAndLogin(app);
    await request(app.getHttpServer())
      .post("/api/me/profile")
      .set("Cookie", cookie)
      .set("Origin", "https://site-malicioso.example")
      .send({ name: "Hacker", acceptTerms: true, isAdult: true })
      .expect(403);
  });

  it("logout invalida a sessão", async () => {
    const { cookie } = await signUpAndLogin(app);
    const server = app.getHttpServer();
    await request(server)
      .post("/api/auth/sign-out")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .expect(200);
    await request(server).get("/api/me").set("Cookie", cookie).expect(401);
  });

  it("limita tentativas de login (força bruta)", async () => {
    const server = app.getHttpServer();
    const email = uniqueEmail("forca-bruta");
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(server)
        .post("/api/auth/sign-in/email")
        .set("Origin", ORIGIN)
        .send({ email, password: `tentativa-errada-${i}` });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
