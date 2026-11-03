import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AdsScheduler } from "../src/ads/ads.scheduler";
import { AiService } from "../src/ai/ai.service";
import { GeoService } from "../src/geo/geo.service";
import { SettingsService } from "../src/settings/settings.service";
import { StorageService } from "../src/storage/storage.service";
import { adFixtures } from "./support/ads";
import { createTestApp, moderationTracker, resetRateLimits } from "./support/app";
import { AI_APPROVED, createBarrierAi, createFakeStorage, fakeGeo } from "./support/fakes";
import { assertIsolated, describeIsolated } from "./support/isolation";
import type { ModerationTracker } from "./support/moderation";
import { armGate, holdAdLock, waitBlockedBy } from "./support/sync";

const HIDDEN_REASON = "Ocultado após denúncias. Em revisão pela equipe.";

/**
 * P00-B1-F8 — denúncias concorrentes com moderação, reativação, renovação e decisão do admin.
 * Regra R-F8 (docs/product/03-regras-de-negocio.md, RN-MOD-008): denúncias abertas de usuários
 * distintos no limite impedem publicação automática e exigem revisão humana.
 *
 * Toda denúncia passa pelo fluxo HTTP real e é admitida com o anúncio ativo (só ele é visível a
 * terceiros). A barreira fica em `settings.get("reports.autoHideThreshold")`: depois da admissão
 * e antes do efeito no anúncio, sem lock aberto. As asserções decisivas usam só o schema da
 * P00-B1, para o mesmo arquivo rodar antes da correção. Filas de lock são observadas por
 * `pg_blocking_pids`; a ordem entre concorrentes é deduzida do estado final, nunca presumida.
 */
describeIsolated("Denúncias concorrentes com moderação (e2e, P00-B1-F8)", () => {
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
  });

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterEach(async () => {
    // Libera barreiras, locks e análises pendentes mesmo quando uma asserção falhou.
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    ai.autoRespond(null);
    ai.drain(AI_APPROVED);
    await tracker.settleAll();
  });

  afterAll(async () => {
    // O banco é compartilhado pelos specs da execução: devolve o padrão.
    await app.get(SettingsService).reset("reports.autoHideThreshold");
    await app.close();
  });

  // —— Apoio ——

  const {
    withText,
    owner,
    platformAdmin,
    neighbor,
    publishActive,
    adRow,
    count,
    notifications,
    openReports,
    send,
  } = adFixtures(() => ({ app, db, ai, tracker, categoryId }));

  const threshold = (value: number) =>
    app.get(SettingsService).set("reports.autoHideThreshold", value);

  const report = (api: Awaited<ReturnType<typeof neighbor>>["api"], adId: string) =>
    send(api.post("/api/reports").send({ targetType: "ad", targetId: adId, reason: "spam" }));

  /** Pausa a próxima denúncia depois da admissão (visibilidade checada) e antes do efeito. */
  function gateReport() {
    const gate = armGate(app.get(SettingsService), "get", {
      label: "denúncia admitida, antes do efeito",
      match: (key) => key === "reports.autoHideThreshold",
    });
    cleanups.push(gate.restore);
    return gate;
  }

  async function lockRow(adId: string) {
    const lock = await holdAdLock(adId);
    cleanups.push(lock.end);
    return lock;
  }

  const runs = (adId: string) =>
    count(`SELECT count(*) FROM ad_moderation_runs WHERE ad_id = $1`, [adId]);
  async function lastRun(adId: string) {
    const [row] = await db.query(
      `SELECT id, outcome, discard_reason FROM ad_moderation_runs WHERE ad_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [adId],
    );
    return row;
  }
  const decisionsOfRun = (runId: string) =>
    count(`SELECT count(*) FROM ad_moderations WHERE run_id = $1`, [runId]);
  async function reportStatusOf(adId: string, reporterId: string) {
    const [row] = await db.query(
      `SELECT status FROM reports WHERE target_type = 'ad' AND target_id = $1 AND reporter_id = $2`,
      [adId, reporterId],
    );
    return row?.status as string | undefined;
  }

  /** Anúncio ativo com uma denúncia parada na barreira, já admitida. */
  async function activeWithPendingReport(limit: number) {
    await threshold(limit);
    const o = await owner();
    const published = await publishActive(o);
    const reporter = await neighbor(o.buildingId);
    const gate = gateReport();
    const pending = report(reporter.api, published.id);
    await gate.reached();
    return { o, ...published, reporter, gate, pending };
  }

  /**
   * Análises que a operação disparou: no código corrigido, nenhuma. Se alguma começou, responde
   * (`aprovar` ou `falhar` → regras) para o teste terminar com o resultado real, sem pendurar.
   */
  async function finishStarted(
    adId: string,
    before: number,
    base: number,
    mode: "aprovar" | "falhar",
  ) {
    const started = tracker.count(adId) - before;
    for (let index = 0; index < started; index++) {
      const call = await ai.call(base + index, "análise disparada pela operação");
      if (mode === "aprovar") call.release(AI_APPROVED);
      else call.fail();
    }
    await tracker.settled(adId);
    return started;
  }

  /** Ordem observada nos cenários de fila: vai para o log da execução como evidência. */
  const recordOrder = (line: string) => process.stdout.write(`${line}\n`);

  // —— A. Moderação automática ——

  it("F1: denúncia admitida antes da edição e concluída durante a análise exige revisão humana", async () => {
    const { o, id, input, gate, pending } = await activeWithPendingReport(1);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);
    const analysis = await ai.call(base, "análise da edição (execução já iniciada)");
    gate.release();
    expect((await pending).status).toBe(204);

    analysis.release(AI_APPROVED);
    await tracker.settled(id);
    expect(await adRow(id)).toMatchObject({
      status: "em_moderacao",
      manual_review: true,
      report_count: 1,
      status_reason: HIDDEN_REASON,
    });
    expect(await openReports(id)).toBe(1);
    // Só a aprovação da publicação original.
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(1);
    const run = await lastRun(id);
    expect(run).toMatchObject({ outcome: "descartado", discard_reason: "revisao_manual" });
    expect(await decisionsOfRun(run.id)).toBe(0);
  });

  it("F1-fallback: execução já iniciada cai nas regras sem IA e o resultado é descartado", async () => {
    const { o, id, input, gate, pending } = await activeWithPendingReport(1);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);
    const analysis = await ai.call(base, "análise da edição (execução já iniciada)");
    gate.release();
    expect((await pending).status).toBe(204);

    // IA indisponível: com MODERATION_WITHOUT_AI=approve, as regras decidiriam publicar.
    analysis.fail();
    await tracker.settled(id);
    expect(await adRow(id)).toMatchObject({ status: "em_moderacao", manual_review: true });
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(1);
    // Chegou ao commit (não `falhou`): o fallback decidiu e o commit descartou sob lock.
    const run = await lastRun(id);
    expect(run).toMatchObject({ outcome: "descartado", discard_reason: "revisao_manual" });
    expect(await decisionsOfRun(run.id)).toBe(0);
  });

  it("F2: aprovação automática antes da denúncia — a denúncia oculta em seguida", async () => {
    const { id, input, o, gate, pending } = await activeWithPendingReport(1);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);
    (await ai.call(base, "análise da edição")).release(AI_APPROVED);
    expect(await tracker.nth(id, 1, "análise da edição")).toBe("ativo");

    gate.release();
    expect((await pending).status).toBe(204);
    expect(await adRow(id)).toMatchObject({
      status: "em_moderacao",
      manual_review: true,
      status_reason: HIDDEN_REASON,
      report_count: 1,
    });
  });

  it("F2-lock: commit da análise e denúncia na fila do lock — em qualquer ordem, revisão humana", async () => {
    const { id, input, o, gate, pending } = await activeWithPendingReport(1);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);
    const analysis = await ai.call(base, "análise da edição");
    const lock = await lockRow(id);
    analysis.release(AI_APPROVED);
    await waitBlockedBy(lock.client, lock.pid, 1, "commit da análise esperando o lock");
    gate.release();
    await waitBlockedBy(lock.client, lock.pid, 2, "denúncia esperando o lock");
    await lock.commit();

    expect((await pending).status).toBe(204);
    await tracker.settled(id);
    expect(await adRow(id)).toMatchObject({ status: "em_moderacao", manual_review: true });
    // Ordem deduzida do resultado da execução: `aplicado` = commit antes; descartado = denúncia antes.
    const run = await lastRun(id);
    expect(["aplicado", "descartado"]).toContain(run.outcome);
    if (run.outcome === "descartado") expect(run.discard_reason).toBe("revisao_manual");
    recordOrder(
      `[F8 F2-lock] ordem observada: ${run.outcome === "aplicado" ? "commit → denúncia" : "denúncia → commit"}`,
    );
  });

  // —— B. Pausa → reativação e expiração → renovação ——

  it("P1: limite atingido com o anúncio pausado — reativar não publica nem chama a IA", async () => {
    const { o, id, gate, pending } = await activeWithPendingReport(1);
    await o.api.post(`/api/ads/${id}/pause`).expect(200);
    gate.release();
    expect((await pending).status).toBe(204);

    const before = tracker.count(id);
    const runsBefore = await runs(id);
    const base = ai.calls.length;
    const resumed = await o.api.post(`/api/ads/${id}/resume`).expect(200);
    const started = await finishStarted(id, before, base, "aprovar");
    expect(resumed.body.status).toBe("em_moderacao");
    expect(await adRow(id)).toMatchObject({ status: "em_moderacao", manual_review: true });
    expect(started).toBe(0);
    expect(ai.calls.length).toBe(base);
    expect(await runs(id)).toBe(runsBefore);
  });

  it("P2: pausado com edição pendente — reativar não chama a IA e espera o admin", async () => {
    const { o, id, input, gate, pending } = await activeWithPendingReport(1);
    await o.api.post(`/api/ads/${id}/pause`).expect(200);
    gate.release();
    expect((await pending).status).toBe(204);
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);
    expect((await adRow(id)).needs_moderation).toBe(true);

    const before = tracker.count(id);
    const runsBefore = await runs(id);
    const base = ai.calls.length;
    const resumed = await o.api.post(`/api/ads/${id}/resume`).expect(200);
    const started = await finishStarted(id, before, base, "aprovar");
    expect(await adRow(id)).toMatchObject({ status: "em_moderacao", manual_review: true });
    expect(resumed.body.status).toBe("em_moderacao");
    expect(started).toBe(0);
    expect(await runs(id)).toBe(runsBefore);
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(1);
  });

  async function expireNow(adId: string) {
    await db.query(`UPDATE ads SET expires_at = now() - interval '1 minute' WHERE id = $1`, [adId]);
    expect(await app.get(AdsScheduler).expireAds()).toBeGreaterThanOrEqual(1);
    expect((await adRow(adId)).status).toBe("expirado");
  }

  it("E1: limite atingido com o anúncio expirado — renovar não publica nem chama a IA", async () => {
    const { o, id, gate, pending } = await activeWithPendingReport(1);
    await expireNow(id);
    gate.release();
    expect((await pending).status).toBe(204);

    const before = tracker.count(id);
    const runsBefore = await runs(id);
    const base = ai.calls.length;
    const renewed = await o.api.post(`/api/ads/${id}/renew`).expect(200);
    const started = await finishStarted(id, before, base, "aprovar");
    expect(renewed.body.status).toBe("em_moderacao");
    expect(await adRow(id)).toMatchObject({ status: "em_moderacao", manual_review: true });
    expect(started).toBe(0);
    expect(await runs(id)).toBe(runsBefore);
  });

  it("E2: expirado com edição pendente — renovar não chama a IA e espera o admin", async () => {
    const { o, id, input, gate, pending } = await activeWithPendingReport(1);
    await expireNow(id);
    gate.release();
    expect((await pending).status).toBe(204);
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);
    expect((await adRow(id)).needs_moderation).toBe(true);

    const before = tracker.count(id);
    const runsBefore = await runs(id);
    const base = ai.calls.length;
    const renewed = await o.api.post(`/api/ads/${id}/renew`).expect(200);
    const started = await finishStarted(id, before, base, "aprovar");
    expect(await adRow(id)).toMatchObject({ status: "em_moderacao", manual_review: true });
    expect(renewed.body.status).toBe("em_moderacao");
    expect(started).toBe(0);
    expect(await runs(id)).toBe(runsBefore);
  });

  it("E2-fallback: sem IA, renovar com edição pendente não cai nas regras", async () => {
    const { o, id, input, gate, pending } = await activeWithPendingReport(1);
    await expireNow(id);
    gate.release();
    expect((await pending).status).toBe(204);
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);

    const before = tracker.count(id);
    const runsBefore = await runs(id);
    const base = ai.calls.length;
    await o.api.post(`/api/ads/${id}/renew`).expect(200);
    // Se alguma análise começar, a IA falha e as regras (approve) decidem.
    const started = await finishStarted(id, before, base, "falhar");
    expect(await adRow(id)).toMatchObject({ status: "em_moderacao", manual_review: true });
    expect(started).toBe(0);
    expect(await runs(id)).toBe(runsBefore);
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(1);
  });

  // —— C. Denúncias concorrentes ——

  it("C1: duas denúncias na fila do lock atingem o limite juntas", async () => {
    await threshold(2);
    const o = await owner();
    const { id } = await publishActive(o);
    const a = await neighbor(o.buildingId, "Vizinha A");
    const b = await neighbor(o.buildingId, "Vizinha B");
    const lock = await lockRow(id);
    const first = report(a.api, id);
    const second = report(b.api, id);
    await waitBlockedBy(lock.client, lock.pid, 2, "duas denúncias esperando o lock");
    await lock.commit();

    expect([(await first).status, (await second).status]).toEqual([204, 204]);
    expect(await adRow(id)).toMatchObject({
      status: "em_moderacao",
      manual_review: true,
      report_count: 2,
    });
    expect(await openReports(id)).toBe(2);
  });

  it("C2: três denúncias na fila — a contagem final é a das abertas distintas", async () => {
    await threshold(3);
    const o = await owner();
    const { id } = await publishActive(o);
    const reporters = [
      await neighbor(o.buildingId, "Vizinha A"),
      await neighbor(o.buildingId, "Vizinha B"),
      await neighbor(o.buildingId, "Vizinha C"),
    ];
    const lock = await lockRow(id);
    const requests = reporters.map((reporter) => report(reporter.api, id));
    await waitBlockedBy(lock.client, lock.pid, 3, "três denúncias esperando o lock");
    await lock.commit();

    const statuses = await Promise.all(requests.map(async (request) => (await request).status));
    expect(statuses).toEqual([204, 204, 204]);
    expect(await adRow(id)).toMatchObject({
      status: "em_moderacao",
      manual_review: true,
      report_count: 3,
    });
    expect(await openReports(id)).toBe(3);
  });

  it("C3: clique duplo da mesma pessoa — uma denúncia, um 409", async () => {
    await threshold(2);
    const o = await owner();
    const { id } = await publishActive(o);
    const a = await neighbor(o.buildingId);
    const lock = await lockRow(id);
    const first = report(a.api, id);
    const second = report(a.api, id);
    await waitBlockedBy(
      lock.client,
      lock.pid,
      2,
      "duas denúncias da mesma pessoa esperando o lock",
    );
    await lock.commit();

    const statuses = [(await first).status, (await second).status].sort();
    expect(statuses).toEqual([204, 409]);
    expect(await openReports(id)).toBe(1);
    expect(await adRow(id)).toMatchObject({ status: "ativo", report_count: 1 });
  });

  it("C4: elegibilidade inalterada — dono não denuncia; anúncio oculto não aceita denúncia nova", async () => {
    await threshold(1);
    const o = await owner();
    const { id } = await publishActive(o);
    await o.api
      .post("/api/reports")
      .send({ targetType: "ad", targetId: id, reason: "spam" })
      .expect(400);

    const a = await neighbor(o.buildingId, "Vizinha A");
    expect((await report(a.api, id)).status).toBe(204);
    expect((await adRow(id)).status).toBe("em_moderacao");

    const late = await neighbor(o.buildingId, "Vizinha Atrasada");
    const refused = await report(late.api, id);
    expect(refused.status).toBe(404);
    expect(await openReports(id)).toBe(1);
    expect((await adRow(id)).report_count).toBe(1);
  });

  // —— D. Decisão do admin ——

  it("D-a: aprovação do admin e denúncia na fila do lock — contagem nunca obsoleta", async () => {
    await threshold(2);
    const o = await owner();
    const { id } = await publishActive(o);
    const a = await neighbor(o.buildingId, "Vizinha A");
    expect((await report(a.api, id)).status).toBe(204);
    expect(await adRow(id)).toMatchObject({ status: "ativo", report_count: 1 });
    const b = await neighbor(o.buildingId, "Vizinha B");
    const admin = await platformAdmin();

    const lock = await lockRow(id);
    const approval = send(
      admin.post(`/api/admin/ads/${id}/decision`).send({ decision: "aprovar" }),
    );
    await waitBlockedBy(lock.client, lock.pid, 1, "aprovação do admin esperando o lock");
    const late = report(b.api, id);
    await waitBlockedBy(lock.client, lock.pid, 2, "denúncia esperando o lock");
    await lock.commit();

    expect((await approval).status).toBe(204);
    expect((await late).status).toBe(204);
    const final = await adRow(id);
    const open = await openReports(id);
    expect(final).toMatchObject({ status: "ativo", manual_review: false, report_count: open });
    expect(await reportStatusOf(id, a.userId)).toBe("improcedente");
    // Ordem deduzida da denúncia B: aberta = admin antes; improcedente = denúncia antes.
    const bStatus = await reportStatusOf(id, b.userId);
    expect(["aberta", "improcedente"]).toContain(bStatus);
    expect(open).toBe(bStatus === "aberta" ? 1 : 0);
    recordOrder(
      `[F8 D-a] ordem observada: ${bStatus === "aberta" ? "admin → denúncia" : "denúncia → admin"}`,
    );
  });

  it("D-b: denúncia concluída depois da remoção pelo admin não muda a remoção", async () => {
    const { id, gate, pending } = await activeWithPendingReport(1);
    const admin = await platformAdmin();
    await admin
      .post(`/api/admin/ads/${id}/decision`)
      .send({ decision: "remover", reason: "Conteúdo enganoso" })
      .expect(204);
    gate.release();
    expect((await pending).status).toBe(204);
    expect(await adRow(id)).toMatchObject({
      status: "removido",
      status_reason: "Conteúdo enganoso",
      manual_review: false,
    });
    expect(await openReports(id)).toBe(1);
  });

  // —— E. Exclusão e remoção ——

  it("X1: denúncia concluída depois da exclusão não ressuscita o anúncio", async () => {
    const { o, id, gate, pending } = await activeWithPendingReport(1);
    await o.api.delete(`/api/ads/${id}`).expect(204);
    const deleted = await adRow(id);
    gate.release();
    expect((await pending).status).toBe(204);
    expect(await adRow(id)).toMatchObject({
      status: "excluido",
      status_reason: deleted.status_reason,
      published_at: deleted.published_at,
      manual_review: false,
    });
  });

  it("X2: denúncia concluída depois do banimento não muda a remoção", async () => {
    const { o, id, gate, pending } = await activeWithPendingReport(1);
    const admin = await platformAdmin();
    await admin
      .post(`/api/admin/users/${o.userId}/sanctions`)
      .send({ type: "banimento", reason: "Golpe confirmado" })
      .expect(201);
    gate.release();
    expect((await pending).status).toBe(204);
    expect(await adRow(id)).toMatchObject({
      status: "removido",
      status_reason: "Conta banida",
      manual_review: false,
    });
  });
});
