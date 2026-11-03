import { randomBytes } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { as, onboardedProfile, resident } from "./app";
import { AI_APPROVED, type createBarrierAi } from "./fakes";
import type { ModerationTracker } from "./moderation";

export type BarrierAi = ReturnType<typeof createBarrierAi>;

export interface AdFixtureEnv {
  app: INestApplication;
  db: DataSource;
  ai: BarrierAi;
  tracker: ModerationTracker;
  categoryId: string;
}

/**
 * Apoio dos specs de corrida de anúncios (P00-B1). `env` é lido a cada chamada, então pode ser
 * criado antes do `beforeAll` que monta o app.
 */
export function adFixtures(env: () => AdFixtureEnv) {
  const tag = () => randomBytes(4).toString("hex");

  function adInput(buildingId: string, label = tag()) {
    return {
      buildingId,
      type: "produto",
      categoryId: env().categoryId,
      title: `Bolo de pote ${label}`,
      description: `Bolos de pote caseiros ${label}, sabores variados e entrega no prédio.`,
      priceMode: "fixo",
      priceCents: 1000,
      radiusKm: 0,
      whatsappEnabled: false,
      availability: null,
      tags: ["bolo"],
      imageIds: [] as string[],
    };
  }
  type AdInput = ReturnType<typeof adInput>;
  const withText = (input: AdInput, label = tag()) => ({
    ...input,
    title: `Bolo de pote ${label}`,
    description: `Bolos de pote caseiros ${label}, sabores variados e entrega no prédio.`,
  });

  async function owner() {
    const { app, db } = env();
    const session = await resident(app);
    const [{ id }] = await db.query(`SELECT id FROM users WHERE email = $1`, [session.email]);
    return { ...session, userId: id as string, api: as(app, session.cookie) };
  }
  type Owner = Awaited<ReturnType<typeof owner>>;

  async function platformAdmin() {
    const { app, db } = env();
    const session = await resident(app, {}, "Equipe Plataforma");
    await db.query(`UPDATE users SET role = 'platform_admin' WHERE email = $1`, [session.email]);
    return as(app, session.cookie);
  }

  /** Vizinha com vínculo no prédio do anúncio: enxerga o anúncio ativo e pode denunciar. */
  async function neighbor(buildingId: string, name = "Vizinha Denunciante") {
    const { app, db } = env();
    const session = await onboardedProfile(app, name);
    const api = as(app, session.cookie);
    await api.post(`/api/buildings/${buildingId}/join`).send({ unit: "7" }).expect(200);
    const [{ id }] = await db.query(`SELECT id FROM users WHERE email = $1`, [session.email]);
    return { ...session, userId: id as string, api };
  }

  /** Publica e devolve a chamada de IA da análise inicial, ainda pendente. */
  async function publish(o: Owner, input = adInput(o.buildingId)) {
    const { ai } = env();
    const base = ai.calls.length;
    const res = await o.api.post("/api/ads").send(input).expect(201);
    const call = await ai.call(base, "análise da publicação");
    expect(call.request.userText).toContain(input.title);
    return { id: res.body.id as string, input, call };
  }

  async function publishActive(o: Owner) {
    const published = await publish(o);
    published.call.release(AI_APPROVED);
    expect(await env().tracker.nth(published.id, 0)).toBe("ativo");
    return published;
  }

  async function adRow(id: string) {
    const [row] = await env().db.query(
      `SELECT status, status_reason, manual_review, needs_moderation, report_count, title,
              published_at, expires_at
       FROM ads WHERE id = $1`,
      [id],
    );
    return row;
  }

  const count = async (sql: string, params: unknown[]) =>
    Number((await env().db.query(sql, params))[0].count);
  const notifications = (userId: string, type: string) =>
    count(`SELECT count(*) FROM notifications WHERE user_id = $1 AND type = $2`, [userId, type]);
  const openReports = (adId: string) =>
    count(
      `SELECT count(*) FROM reports WHERE target_type = 'ad' AND target_id = $1 AND status = 'aberta'`,
      [adId],
    );

  /** Envia a requisição já (supertest só dispara no `then`). */
  const send = <T>(request: PromiseLike<T>): Promise<T> => Promise.resolve(request);

  return {
    tag,
    adInput,
    withText,
    owner,
    platformAdmin,
    neighbor,
    publish,
    publishActive,
    adRow,
    count,
    notifications,
    openReports,
    send,
  };
}

export type AdFixtures = ReturnType<typeof adFixtures>;
export type Owner = Awaited<ReturnType<AdFixtures["owner"]>>;
