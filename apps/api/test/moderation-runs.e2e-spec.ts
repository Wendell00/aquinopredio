import { randomBytes } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AdModerationService } from "../src/ads/moderation/ad-moderation.service";
import {
  AdModerationRunsService,
  type ModerationDecision,
} from "../src/ads/moderation/ad-moderation-runs.service";
import { AiService } from "../src/ai/ai.service";
import { GeoService } from "../src/geo/geo.service";
import { NotificationsService } from "../src/notifications/notifications.service";
import { StorageService } from "../src/storage/storage.service";
import { as, createTestApp, moderationTracker, resetRateLimits, resident } from "./support/app";
import {
  AI_APPROVED,
  AI_REVIEW,
  createBarrierAi,
  createFakeStorage,
  fakeGeo,
} from "./support/fakes";
import { assertIsolated, describeIsolated } from "./support/isolation";
import type { ModerationTracker } from "./support/moderation";

/**
 * P00-B1 — invariantes estruturais da execução de moderação (schema novo): rastro em
 * `ad_moderation_runs`, finalização idempotente (`outcome IS NULL`), trigger de episódio,
 * hash de conteúdo e decisão única por execução. Spec 5.7, RN-MOD-007, aceite 6.8.
 */
describeIsolated("Execuções de moderação (e2e, P00-B1)", () => {
  let app: INestApplication;
  let db: DataSource;
  let categoryId: string;
  let tracker: ModerationTracker;
  let runs: AdModerationRunsService;
  const ai = createBarrierAi();

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
    runs = app.get(AdModerationRunsService);
    [{ id: categoryId }] = await db.query(`SELECT id FROM categories WHERE slug = 'alimentacao'`);
  });

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  const restores: (() => void)[] = [];

  afterEach(async () => {
    for (const restore of restores.splice(0)) restore();
    ai.autoRespond(null);
    ai.drain(AI_APPROVED);
    await tracker.settleAll();
  });

  afterAll(async () => {
    await app.close();
  });

  const tag = () => randomBytes(4).toString("hex");
  const adInput = (buildingId: string, label = tag()) => ({
    buildingId,
    type: "produto",
    categoryId,
    title: `Brigadeiro gourmet ${label}`,
    description: `Brigadeiros gourmet ${label}, caixas com 6 ou 12 unidades.`,
    priceMode: "fixo",
    priceCents: 1500,
    radiusKm: 0,
    whatsappEnabled: false,
    availability: null,
    tags: ["doce"],
    imageIds: [],
  });

  async function owner() {
    const session = await resident(app);
    const [{ id }] = await db.query(`SELECT id FROM users WHERE email = $1`, [session.email]);
    return { ...session, userId: id as string, api: as(app, session.cookie) };
  }
  type Owner = Awaited<ReturnType<typeof owner>>;

  async function publish(o: Owner) {
    const input = adInput(o.buildingId);
    const base = ai.calls.length;
    const res = await o.api.post("/api/ads").send(input).expect(201);
    const call = await ai.call(base, "análise da publicação");
    return { id: res.body.id as string, input, call };
  }

  async function runsOf(adId: string) {
    return db.query(
      `SELECT id, content_version, content_hash, outcome, discard_reason, finished_at
       FROM ad_moderation_runs WHERE ad_id = $1 ORDER BY created_at`,
      [adId],
    );
  }
  async function adRow(id: string) {
    const [row] = await db.query(
      `SELECT status, content_version, moderation_run_id, manual_review FROM ads WHERE id = $1`,
      [id],
    );
    return row;
  }
  const moderations = (adId: string) =>
    db.query(
      `SELECT decided_by, decision, content_version, run_id FROM ad_moderations WHERE ad_id = $1`,
      [adId],
    );
  const notificationCount = async (userId: string, type: string) =>
    Number(
      (
        await db.query(`SELECT count(*) FROM notifications WHERE user_id = $1 AND type = $2`, [
          userId,
          type,
        ])
      )[0].count,
    );

  const approve: ModerationDecision = {
    result: "ativo",
    statusReason: null,
    record: {
      decision: "aprovado",
      decidedBy: "ia",
      categories: [],
      reason: null,
      confidence: 0.95,
      model: "fake/repeticao",
    },
  };
  const asClaimed = (row: { id: string; content_version: number; content_hash: string }) => ({
    id: row.id,
    adId: "",
    contentVersion: row.content_version,
    contentHash: row.content_hash,
  });

  it("execução aplicada: rastro completo, decisão ligada à execução e à versão", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    const [run] = await runsOf(id);
    expect(run).toMatchObject({ content_version: 0, outcome: null });
    expect(call.request.correlationId).toBe(run.id);
    expect((await adRow(id)).moderation_run_id).toBe(run.id);

    call.release(AI_APPROVED);
    expect(await tracker.nth(id, 0)).toBe("ativo");
    const [finished] = await runsOf(id);
    expect(finished).toMatchObject({ outcome: "aplicado", discard_reason: null });
    expect(finished.finished_at).not.toBeNull();
    expect(await moderations(id)).toEqual([
      { decided_by: "ia", decision: "aprovado", content_version: 0, run_id: run.id },
    ]);
  });

  it("fallback sem IA passa pelo mesmo claim/commit (RN-MOD-003)", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    call.fail();
    expect(await tracker.nth(id, 0)).toBe("ativo");
    const [run] = await runsOf(id);
    expect(run.outcome).toBe("aplicado");
    expect(await moderations(id)).toEqual([
      { decided_by: "regras", decision: "aprovado", content_version: 0, run_id: run.id },
    ]);
  });

  it("segunda entrada no mesmo episódio não cria execução nem chama a IA", async () => {
    const o = await owner();
    const { id, input, call } = await publish(o);
    expect(await app.get(AdModerationService).moderate(id)).toBeNull();
    expect(await runsOf(id)).toHaveLength(1);
    expect(ai.callsWith(input.title)).toHaveLength(1);
    call.release(AI_APPROVED);
  });

  it("descartes registram o motivo: exclusão, revisão manual e versão alterada", async () => {
    const o = await owner();

    const removed = await publish(o);
    await o.api.delete(`/api/ads/${removed.id}`).expect(204);
    removed.call.release(AI_APPROVED);
    expect(await tracker.nth(removed.id, 0)).toBeNull();
    expect((await runsOf(removed.id))[0]).toMatchObject({
      outcome: "descartado",
      discard_reason: "estado_excluido",
    });

    const hidden = await publish(o);
    await db.query(`UPDATE ads SET manual_review = true WHERE id = $1`, [hidden.id]);
    hidden.call.release(AI_APPROVED);
    expect(await tracker.nth(hidden.id, 0)).toBeNull();
    expect((await runsOf(hidden.id))[0]).toMatchObject({ discard_reason: "revisao_manual" });

    const edited = await publish(o);
    const base = ai.calls.length;
    await o.api
      .patch(`/api/ads/${edited.id}`)
      .send({ ...edited.input, title: `${edited.input.title} editado` })
      .expect(200);
    expect((await adRow(edited.id)).content_version).toBe(1);
    const next = await ai.call(base, "análise da versão 1");
    edited.call.release(AI_APPROVED);
    expect(await tracker.nth(edited.id, 0)).toBeNull();
    next.release(AI_APPROVED);
    expect(await tracker.nth(edited.id, 1)).toBe("ativo");
    const [old, current] = await runsOf(edited.id);
    expect(old).toMatchObject({ content_version: 0, discard_reason: "versao_alterada" });
    expect(current).toMatchObject({ content_version: 1, outcome: "aplicado" });
    expect(await moderations(edited.id)).toEqual([
      expect.objectContaining({ content_version: 1, run_id: current.id }),
    ]);

    for (const adId of [removed.id, hidden.id]) expect(await moderations(adId)).toEqual([]);
    expect(await notificationCount(o.userId, "anuncio_aprovado")).toBe(1);
  });

  it("hash pega mudança de conteúdo sem incremento de versão", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    await db.query(`UPDATE ads SET title = title || ' (alterado fora do fluxo)' WHERE id = $1`, [
      id,
    ]);
    call.release(AI_APPROVED);
    expect(await tracker.nth(id, 0)).toBeNull();
    expect((await runsOf(id))[0]).toMatchObject({
      outcome: "descartado",
      discard_reason: "versao_alterada",
    });
    expect((await adRow(id)).status).toBe("em_moderacao");
  });

  it("trigger zera a execução ao reentrar em moderação ou mudar a versão", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    const [run] = await runsOf(id);
    await db.query(`UPDATE ads SET status = 'pausado' WHERE id = $1`, [id]);
    expect((await adRow(id)).moderation_run_id).toBe(run.id);
    await db.query(`UPDATE ads SET status = 'em_moderacao' WHERE id = $1`, [id]);
    expect((await adRow(id)).moderation_run_id).toBeNull();

    call.release(AI_APPROVED);
    expect(await tracker.nth(id, 0)).toBeNull();
    expect((await runsOf(id))[0]).toMatchObject({ discard_reason: "execucao_substituida" });

    await db.query(`UPDATE ads SET moderation_run_id = gen_random_uuid() WHERE id = $1`, [id]);
    await db.query(`UPDATE ads SET content_version = content_version + 1 WHERE id = $1`, [id]);
    expect((await adRow(id)).moderation_run_id).toBeNull();
  });

  it("commit repetido após aplicado não altera resultado, registro nem notificação", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    call.release(AI_APPROVED);
    expect(await tracker.nth(id, 0)).toBe("ativo");
    const [before] = await runsOf(id);

    expect(await runs.commit({ ...asClaimed(before), adId: id }, approve, 30)).toBeNull();
    expect(await runs.fail(before.id)).toBe(false);
    expect((await runsOf(id))[0]).toEqual(before);
    expect(await moderations(id)).toHaveLength(1);
    expect(await notificationCount(o.userId, "anuncio_aprovado")).toBe(1);
  });

  it("'revisar' aplicado não é sobreposto por repetição da mesma execução", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    call.release(AI_REVIEW);
    expect(await tracker.nth(id, 0)).toBe("em_moderacao");
    const [before] = await runsOf(id);
    expect(before.outcome).toBe("aplicado");
    expect((await adRow(id)).moderation_run_id).toBe(before.id);

    expect(await runs.commit({ ...asClaimed(before), adId: id }, approve, 30)).toBeNull();
    expect((await runsOf(id))[0]).toEqual(before);
    expect((await adRow(id)).status).toBe("em_moderacao");
    expect(await moderations(id)).toEqual([expect.objectContaining({ decision: "revisar" })]);
  });

  it("commit repetido após descarte continua descartado com o motivo original", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    await db.query(`UPDATE ads SET manual_review = true WHERE id = $1`, [id]);
    call.release(AI_APPROVED);
    expect(await tracker.nth(id, 0)).toBeNull();
    const [before] = await runsOf(id);
    expect(before).toMatchObject({ outcome: "descartado", discard_reason: "revisao_manual" });

    // Estado volta a ser válido para a mesma execução: ainda assim nada é aplicado.
    await db.query(`UPDATE ads SET manual_review = false WHERE id = $1`, [id]);
    expect(await runs.commit({ ...asClaimed(before), adId: id }, approve, 30)).toBeNull();
    expect(await runs.fail(before.id)).toBe(false);
    expect((await runsOf(id))[0]).toEqual(before);
    expect((await adRow(id)).status).toBe("em_moderacao");
    expect(await moderations(id)).toEqual([]);
  });

  it("erro inesperado marca 'falhou' e mantém o anúncio na fila do admin", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    call.fail(new Error("erro inesperado de teste"));
    await expect(tracker.nth(id, 0)).rejects.toThrow("erro inesperado de teste");
    expect((await runsOf(id))[0]).toMatchObject({ outcome: "falhou", discard_reason: null });
    expect((await adRow(id)).status).toBe("em_moderacao");
    expect(await moderations(id)).toEqual([]);
  });

  it("falha da notificação depois de aplicar não transforma a execução em falha", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    const notify = jest
      .spyOn(app.get(NotificationsService), "notify")
      .mockRejectedValueOnce(new Error("push fora do ar"));
    restores.push(() => notify.mockRestore());
    call.release(AI_APPROVED);
    expect(await tracker.nth(id, 0)).toBe("ativo");
    expect((await runsOf(id))[0]).toMatchObject({ outcome: "aplicado", discard_reason: null });
    expect((await adRow(id)).status).toBe("ativo");
    expect(await moderations(id)).toHaveLength(1);
  });

  it("índice único impede duas decisões para a mesma execução", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    call.release(AI_APPROVED);
    await tracker.nth(id, 0);
    const [run] = await runsOf(id);
    await expect(
      db.query(
        `INSERT INTO ad_moderations (ad_id, decision, decided_by, violated_categories, run_id)
         VALUES ($1, 'aprovado', 'ia', '{}', $2)`,
        [id, run.id],
      ),
    ).rejects.toMatchObject({ driverError: expect.objectContaining({ code: "23505" }) });
  });

  it("decisão do admin registra a versão avaliada, sem execução", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    const adminSession = await resident(app, {}, "Equipe Plataforma");
    await db.query(`UPDATE users SET role = 'platform_admin' WHERE email = $1`, [
      adminSession.email,
    ]);
    await as(app, adminSession.cookie)
      .post(`/api/admin/ads/${id}/decision`)
      .send({ decision: "aprovar" })
      .expect(204);
    call.release(AI_APPROVED);
    expect(await tracker.nth(id, 0)).toBeNull();
    expect(await moderations(id)).toEqual([
      { decided_by: "admin", decision: "aprovado", content_version: 0, run_id: null },
    ]);
    expect((await runsOf(id))[0]).toMatchObject({ discard_reason: "estado_ativo" });
  });
});
