import type { INestApplication } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { Response } from "supertest";
import { DataSource, type Repository } from "typeorm";
import { Ad } from "../src/ads/ad.entity";
import { AdsScheduler } from "../src/ads/ads.scheduler";
import { AdsService } from "../src/ads/ads.service";
import { AiService } from "../src/ai/ai.service";
import { GeoService } from "../src/geo/geo.service";
import { SettingsService } from "../src/settings/settings.service";
import { StorageService } from "../src/storage/storage.service";
import { adFixtures, type Owner } from "./support/ads";
import { createTestApp, moderationTracker, resetRateLimits } from "./support/app";
import {
  AI_APPROVED,
  AI_PROHIBITED,
  createBarrierAi,
  createFakeStorage,
  fakeGeo,
} from "./support/fakes";
import { assertIsolated, describeIsolated } from "./support/isolation";
import type { ModerationTracker } from "./support/moderation";
import {
  armGateAfter,
  type HeldLock,
  holdAdLock,
  holdUserLock,
  waitBlockedBy,
} from "./support/sync";

const LIMIT = 2;
const QUOTA_STATES = `('ativo', 'em_moderacao')`;

/**
 * Só escolhe a sincronização, nunca a asserção. O código anterior à P00-B3 conta a ocupação fora
 * de qualquer lock de cota; o corrigido serializa por um lock consultivo por titular.
 *
 * - Baseline: uma barreira depois de cada contagem (`Repository<Ad>.countBy`, da pré-checagem da
 *   criação ou da checagem dentro da transação de reativação/renovação, que no baseline vem
 *   depois do lock da linha do próprio anúncio — anúncios distintos, então um não impede o outro
 *   de chegar). As duas operações comprovadamente leram a mesma ocupação antes de gravar.
 * - Correção: a 1ª operação segura o lock de cota e fica esperando uma linha que o teste trava
 *   (a do próprio anúncio, ou a do usuário para a criação, cujo INSERT checa a FK); a 2ª entra na
 *   fila da cota. `pg_blocking_pids` (transitivo) prova a fila; não há contagem fora do lock a
 *   pausar, e pausar a 1ª depois do lock impediria a 2ª de alcançar qualquer barreira.
 */
const QUOTA_PROTOCOL = typeof Reflect.get(AdsService.prototype, "lockActiveQuota") === "function";

/**
 * P00-B3 — limite de anúncios ativos (RN-065 do histórico, regra hoje implementada) atômico em
 * criação, reativação e renovação. Princípio de RN-PLAN-005 e aceite §6.1 ("criação simultânea
 * além da cota → uma aceita"); as cotas definitivas (por tipo/condomínio/plano) não existem aqui.
 * A asserção decisiva é a ocupação no banco (`ativo` + `em_moderacao`), não o código HTTP.
 */
describeIsolated("Limite de anúncios ativos sob concorrência (e2e, P00-B3)", () => {
  let app: INestApplication;
  let db: DataSource;
  let categoryId: string;
  let tracker: ModerationTracker;
  const ai = createBarrierAi();
  const cleanups: (() => unknown)[] = [];

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(GeoService)
        .useValue(fakeGeo)
        .overrideProvider(StorageService)
        .useValue(createFakeStorage())
        .overrideProvider(AiService)
        .useValue(ai),
    );
    await assertIsolated(app);
    db = app.get(DataSource);
    tracker = moderationTracker(app);
    [{ id: categoryId }] = await db.query(`SELECT id FROM categories WHERE slug = 'alimentacao'`);
    const settings = app.get(SettingsService);
    await settings.set("ads.maxActiveResident", LIMIT);
    await settings.set("ads.maxActiveVerified", LIMIT);
    process.stdout.write(
      `[P00-B3] sincronização: ${QUOTA_PROTOCOL ? "fila do lock de cota" : "barreira por contagem (baseline)"}\n`,
    );
  });

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterEach(async () => {
    // Libera barreiras, locks, triggers e análises pendentes mesmo quando uma asserção falhou.
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    // Criações disparam análise em segundo plano depois da resposta: responde as pendentes e as
    // que ainda vão chegar, para nenhuma ficar presa na barreira entre testes.
    ai.autoRespond(AI_APPROVED);
    await tracker.settleAll();
    ai.autoRespond(null);
  });

  afterAll(async () => {
    const settings = app.get(SettingsService);
    await settings.reset("ads.maxActiveResident");
    await settings.reset("ads.maxActiveVerified");
    await app.close();
  });

  // —— Apoio ——

  const { adInput, withText, owner, publishActive, adRow, count, send } = adFixtures(() => ({
    app,
    db,
    ai,
    tracker,
    categoryId,
  }));

  const occupancy = (userId: string) =>
    count(`SELECT count(*) FROM ads WHERE user_id = $1 AND status IN ${QUOTA_STATES}`, [userId]);

  async function paused(o: Owner) {
    const { id } = await publishActive(o);
    await o.api.post(`/api/ads/${id}/pause`).expect(200);
    return id;
  }

  async function expired(o: Owner) {
    const { id } = await publishActive(o);
    await db.query(`UPDATE ads SET expires_at = now() - interval '1 minute' WHERE id = $1`, [id]);
    expect(await app.get(AdsScheduler).expireAds()).toBeGreaterThanOrEqual(1);
    expect((await adRow(id)).status).toBe("expirado");
    return id;
  }

  /** Dono com anúncios fora da cota primeiro (pausados/expirados) e `active` ocupando vaga. */
  async function ownerWith(shape: { active: number; paused?: number; expired?: number }) {
    const o = await owner();
    const pausedIds: string[] = [];
    const expiredIds: string[] = [];
    for (let i = 0; i < (shape.paused ?? 0); i++) pausedIds.push(await paused(o));
    for (let i = 0; i < (shape.expired ?? 0); i++) expiredIds.push(await expired(o));
    const activeIds: string[] = [];
    for (let i = 0; i < shape.active; i++) activeIds.push((await publishActive(o)).id);
    expect(await occupancy(o.userId)).toBe(shape.active);
    return { o, pausedIds, expiredIds, activeIds };
  }

  interface Op {
    label: string;
    /** Anúncio que a operação trava (reativação/renovação); `null` na criação. */
    adId: string | null;
    run: () => PromiseLike<Response>;
  }
  const create = (o: Owner): Op => ({
    label: "criação",
    adId: null,
    run: () => o.api.post("/api/ads").send(adInput(o.buildingId)),
  });
  const resume = (o: Owner, adId: string): Op => ({
    label: "reativação",
    adId,
    run: () => o.api.post(`/api/ads/${adId}/resume`),
  });
  const renew = (o: Owner, adId: string): Op => ({
    label: "renovação",
    adId,
    run: () => o.api.post(`/api/ads/${adId}/renew`),
  });

  function gateCount(userId: string, label: string) {
    const repo = app.get<Repository<Ad>>(getRepositoryToken(Ad));
    const gate = armGateAfter(repo, "countBy", {
      label,
      match: (where) => (where as { userId?: string } | undefined)?.userId === userId,
    });
    cleanups.push(gate.restore);
    return gate;
  }

  async function hold(lock: Promise<HeldLock>) {
    const held = await lock;
    cleanups.push(held.end);
    return held;
  }

  /** Duas operações do mesmo titular disputando a última vaga (ver QUOTA_PROTOCOL). */
  async function contend(o: Owner, first: Op, second: Op): Promise<[Response, Response]> {
    if (!QUOTA_PROTOCOL) {
      const gate1 = gateCount(o.userId, `${first.label} contou`);
      const p1 = send(first.run());
      await gate1.reached();
      const gate2 = gateCount(o.userId, `${second.label} contou`);
      const p2 = send(second.run());
      await gate2.reached();
      gate1.release();
      gate2.release();
      return [await p1, await p2];
    }
    const holder = await hold(first.adId ? holdAdLock(first.adId) : holdUserLock(o.userId));
    const p1 = send(first.run());
    await waitBlockedBy(
      holder.client,
      holder.pid,
      1,
      `${first.label} com a cota, esperando a linha`,
    );
    const p2 = send(second.run());
    // Diagnóstico: se a 2ª terminar sem entrar na fila, a falha mostra a resposta dela.
    await Promise.race([
      waitBlockedBy(holder.client, holder.pid, 2, `${second.label} na fila da cota`),
      p2.then((res) => {
        throw new Error(
          `${second.label} terminou fora da fila: ${res.status} ${JSON.stringify(res.body)}`,
        );
      }),
    ]);
    await holder.commit();
    return [await p1, await p2];
  }

  const ok = (res: Response) => res.status === 200 || res.status === 201;

  async function expectOneWinner(o: Owner, results: [Response, Response]) {
    // Asserção decisiva: a ocupação, não o código HTTP.
    expect(await occupancy(o.userId)).toBe(LIMIT);
    const accepted = results.filter(ok).length;
    const refused = results.filter((res) => res.status === 403).length;
    expect({ accepted, refused }).toEqual({ accepted: 1, refused: 1 });
    process.stdout.write(
      `[P00-B3] ${expect.getState().currentTestName}: ${results.map((r) => r.status).join(" / ")}\n`,
    );
  }

  // —— Disputa pela última vaga (1 de 2 ocupada) ——

  it("Q1: criação × criação — só uma ocupa a última vaga", async () => {
    const { o } = await ownerWith({ active: 1 });
    await expectOneWinner(o, await contend(o, create(o), create(o)));
  });

  it("Q2: reativação × criação — só uma ocupa a última vaga", async () => {
    const { o, pausedIds } = await ownerWith({ active: 1, paused: 1 });
    await expectOneWinner(o, await contend(o, resume(o, pausedIds[0] ?? ""), create(o)));
  });

  it("Q3: renovação × criação — só uma ocupa a última vaga", async () => {
    const { o, expiredIds } = await ownerWith({ active: 1, expired: 1 });
    await expectOneWinner(o, await contend(o, renew(o, expiredIds[0] ?? ""), create(o)));
  });

  it("Q4: reativação × reativação de anúncios distintos", async () => {
    const { o, pausedIds } = await ownerWith({ active: 1, paused: 2 });
    const [p1 = "", p2 = ""] = pausedIds;
    await expectOneWinner(o, await contend(o, resume(o, p1), resume(o, p2)));
  });

  it("Q5: reativação × renovação", async () => {
    const { o, pausedIds, expiredIds } = await ownerWith({ active: 1, paused: 1, expired: 1 });
    await expectOneWinner(
      o,
      await contend(o, resume(o, pausedIds[0] ?? ""), renew(o, expiredIds[0] ?? "")),
    );
  });

  it("Q6: renovação × renovação de anúncios distintos", async () => {
    const { o, expiredIds } = await ownerWith({ active: 1, expired: 2 });
    const [e1 = "", e2 = ""] = expiredIds;
    await expectOneWinner(o, await contend(o, renew(o, e1), renew(o, e2)));
  });

  // —— Falha transacional não consome vaga ——

  async function failingTrigger(name: string, timing: "INSERT" | "UPDATE", condition: string) {
    await db.query(`
      CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $$
      BEGIN
        IF ${condition} THEN RAISE EXCEPTION 'falha simulada no teste'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await db.query(
      `CREATE TRIGGER ${name} BEFORE ${timing} ON ads FOR EACH ROW EXECUTE FUNCTION ${name}()`,
    );
    cleanups.push(async () => {
      await db.query(`DROP TRIGGER IF EXISTS ${name} ON ads`);
      await db.query(`DROP FUNCTION IF EXISTS ${name}()`);
    });
  }

  it("Q7a: criação que falha na transação não consome a vaga nem prende a cota", async () => {
    const { o } = await ownerWith({ active: 1 });
    await failingTrigger("e2e_falha_criacao", "INSERT", `NEW.title LIKE '%FALHA-E2E%'`);
    const failed = await o.api.post("/api/ads").send(withText(adInput(o.buildingId), "FALHA-E2E"));
    expect(await occupancy(o.userId)).toBe(1);
    expect(failed.status).toBe(500);

    const next = await o.api.post("/api/ads").send(adInput(o.buildingId));
    expect(await occupancy(o.userId)).toBe(LIMIT);
    expect(next.status).toBe(201);
  });

  it("Q7b: reativação que falha na transação não consome a vaga nem prende a cota", async () => {
    const { o, pausedIds } = await ownerWith({ active: 1, paused: 2 });
    const [p1 = "", p2 = ""] = pausedIds;
    await failingTrigger(
      "e2e_falha_reativacao",
      "UPDATE",
      `NEW.id = '${p1}'::uuid AND NEW.status IS DISTINCT FROM OLD.status`,
    );
    const failed = await o.api.post(`/api/ads/${p1}/resume`);
    expect(await occupancy(o.userId)).toBe(1);
    expect((await adRow(p1)).status).toBe("pausado");
    expect(failed.status).toBe(500);

    const next = await o.api.post(`/api/ads/${p2}/resume`);
    expect(await occupancy(o.userId)).toBe(LIMIT);
    expect(next.status).toBe(200);
  });

  // —— Independência entre titulares ——

  it("Q8: com a cota de um titular bloqueada, outro titular conclui antes da liberação", async () => {
    const a = await ownerWith({ active: 1, paused: 1 });
    const b = await ownerWith({ active: 1 });
    const pausedA = a.pausedIds[0] ?? "";
    const holder = await hold(holdAdLock(pausedA));
    const resumeA = send(a.o.api.post(`/api/ads/${pausedA}/resume`));
    await waitBlockedBy(holder.client, holder.pid, 1, "reativação de A esperando a linha");
    let createA: Promise<Response> | null = null;
    if (QUOTA_PROTOCOL) {
      // A reativação de A segura a cota de A: uma criação de A entra na fila.
      createA = send(a.o.api.post("/api/ads").send(adInput(a.o.buildingId)));
      await waitBlockedBy(holder.client, holder.pid, 2, "criação de A na fila da cota de A");
    }

    // B conclui com A ainda bloqueado (o holder só é liberado depois).
    const createB = await b.o.api.post("/api/ads").send(adInput(b.o.buildingId));
    expect(createB.status).toBe(201);
    expect(await occupancy(b.o.userId)).toBe(LIMIT);
    await waitBlockedBy(holder.client, holder.pid, QUOTA_PROTOCOL ? 2 : 1, "A ainda bloqueado");

    await holder.commit();
    expect((await resumeA).status).toBe(200);
    if (createA) expect((await createA).status).toBe(403);
    expect(await occupancy(a.o.userId)).toBe(LIMIT);
  });

  // —— Controles ——

  it("Q9: reativação dupla do mesmo anúncio ocupa uma vaga só", async () => {
    const { o, pausedIds } = await ownerWith({ active: 1, paused: 1 });
    const p = pausedIds[0] ?? "";
    const holder = await hold(holdAdLock(p));
    const first = send(o.api.post(`/api/ads/${p}/resume`));
    const second = send(o.api.post(`/api/ads/${p}/resume`));
    await waitBlockedBy(holder.client, holder.pid, 2, "duas reativações do mesmo anúncio");
    await holder.commit();

    const statuses = [(await first).status, (await second).status];
    process.stdout.write(`[P00-B3] Q9 respostas: ${statuses.join(" / ")}\n`);
    expect(await occupancy(o.userId)).toBe(LIMIT);
    expect(statuses.sort()).toEqual([200, 400]);
  });

  it("Q10: rejeição pela moderação libera a vaga", async () => {
    const { o, activeIds } = await ownerWith({ active: 2 });
    expect((await o.api.post("/api/ads").send(adInput(o.buildingId))).status).toBe(403);
    const [a1 = ""] = activeIds;
    const input = adInput(o.buildingId);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${a1}`).send(withText(input)).expect(200);
    (await ai.call(base, "análise da edição")).release(AI_PROHIBITED);
    await tracker.settled(a1);
    expect((await adRow(a1)).status).toBe("removido");
    expect(await occupancy(o.userId)).toBe(1);

    expect((await o.api.post("/api/ads").send(adInput(o.buildingId))).status).toBe(201);
    expect(await occupancy(o.userId)).toBe(LIMIT);
  });

  it("Q11: renovar anúncio ativo com a cota cheia continua permitido", async () => {
    const { o, activeIds } = await ownerWith({ active: 2 });
    const renewed = await o.api.post(`/api/ads/${activeIds[0] ?? ""}/renew`);
    expect(renewed.status).toBe(200);
    expect(renewed.body.status).toBe("ativo");
    expect(await occupancy(o.userId)).toBe(LIMIT);
  });
});
