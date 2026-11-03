import type { INestApplication } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, type Repository } from "typeorm";
import { Category } from "../src/ads/ad.entity";
import { AdModerationService } from "../src/ads/moderation/ad-moderation.service";
import { AiService } from "../src/ai/ai.service";
import { PlansService } from "../src/billing/plans.service";
import { GeoService } from "../src/geo/geo.service";
import { SettingsService } from "../src/settings/settings.service";
import { StorageService } from "../src/storage/storage.service";
import { adFixtures, type Owner } from "./support/ads";
import {
  as,
  createTestApp,
  moderationTracker,
  onboardedProfile,
  resetRateLimits,
} from "./support/app";
import {
  AI_APPROVED,
  AI_PROHIBITED,
  AI_REVIEW,
  createBarrierAi,
  createFakeStorage,
  fakeGeo,
} from "./support/fakes";
import { assertIsolated, describeIsolated } from "./support/isolation";
import type { ModerationTracker } from "./support/moderation";
import { armGate, holdAdLock, waitBlockedBy } from "./support/sync";

/**
 * P00-B1 — respostas atrasadas e operações concorrentes na moderação de anúncios.
 * Spec 5.7 e 5.16 item 3, RN-MOD-003, RN-MOD-007, aceite 6.8.
 *
 * As asserções decisivas usam só o schema anterior à P00-B1 (status, registros, notificações,
 * denúncias, auditoria), para o mesmo arquivo demonstrar a falha no código antigo.
 * A ordem entre operações é provada por barreiras (a operação alcançou o ponto) e por respostas
 * HTTP/estado no banco lidos antes de liberar a outra; filas de lock são observadas por
 * `pg_blocking_pids`. Nenhuma espera por tempo serve de prova de ordem.
 */
describeIsolated("Moderação de anúncios sob concorrência (e2e, P00-B1)", () => {
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
    // Uma denúncia basta para ocultar: deixa os cenários de denúncia com um só denunciante.
    await app.get(SettingsService).set("reports.autoHideThreshold", 1);
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
    publish,
    publishActive,
    adRow,
    count,
    notifications,
    openReports,
    send,
  } = adFixtures(() => ({ app, db, ai, tracker, categoryId }));

  /** Anúncio ativo ocultado por uma denúncia: `em_moderacao` + revisão manual (RN-093). */
  async function hiddenByReport(o: Owner) {
    const published = await publishActive(o);
    const reporter = await onboardedProfile(app, "Vizinha Denunciante");
    await as(app, reporter.cookie)
      .post(`/api/buildings/${o.buildingId}/join`)
      .send({ unit: "7" })
      .expect(200);
    await as(app, reporter.cookie)
      .post("/api/reports")
      .send({ targetType: "ad", targetId: published.id, reason: "spam" })
      .expect(204);
    expect(await adRow(published.id)).toMatchObject({
      status: "em_moderacao",
      manual_review: true,
    });
    return published;
  }

  const automaticRecords = (adId: string) =>
    count(
      `SELECT count(*) FROM ad_moderations WHERE ad_id = $1 AND decided_by IN ('ia', 'regras')`,
      [adId],
    );
  const adminRecords = (adId: string) =>
    count(`SELECT count(*) FROM ad_moderations WHERE ad_id = $1 AND decided_by = 'admin'`, [adId]);
  const auditEntries = (adId: string) =>
    count(`SELECT count(*) FROM audit_logs WHERE target_type = 'ad' AND target_id = $1`, [adId]);

  /** Barreira antes do lock da edição: `assertCategory` (mesmo ponto no código antigo e no novo). */
  function gateEdit() {
    const repo = app.get<Repository<Category>>(getRepositoryToken(Category));
    const gate = armGate(repo, "existsBy", {
      label: "edição antes do lock",
      match: (where) => (where as { id?: string } | undefined)?.id === categoryId,
    });
    cleanups.push(gate.restore);
    return gate;
  }

  async function lockRow(adId: string) {
    const lock = await holdAdLock(adId);
    cleanups.push(lock.end);
    return lock;
  }

  async function failingTrigger(table: "ad_moderations" | "audit_logs", adId: string) {
    const name = `e2e_falha_${table}`;
    const condition =
      table === "ad_moderations"
        ? `NEW.ad_id = '${adId}'::uuid AND NEW.decided_by = 'admin'`
        : `NEW.target_type = 'ad' AND NEW.target_id = '${adId}'::uuid`;
    await db.query(`
      CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $$
      BEGIN
        IF ${condition} THEN RAISE EXCEPTION 'falha simulada no teste'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await db.query(
      `CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`,
    );
    cleanups.push(async () => {
      await db.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
      await db.query(`DROP FUNCTION IF EXISTS ${name}()`);
    });
  }

  // —— Edição concorrente (INV-1, INV-2) ——

  it("R1: edição com leitura antiga não publica conteúdo que nenhuma análise aplicada viu", async () => {
    const o = await owner();
    const { id, input: c0, call: r0 } = await publish(o);
    const gate = gateEdit();
    const stale = send(o.api.patch(`/api/ads/${id}`).send(c0));
    await gate.reached();

    const c1 = withText(c0);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(c1).expect(200);
    const a = await ai.call(base, "análise de c1");
    expect(a.request.userText).toContain(c1.title);

    gate.release();
    expect((await stale).status).toBe(200);
    // c0 volta a ser o conteúdo efetivo; a análise de c1 não pode publicá-lo.
    a.release(AI_APPROVED);
    await tracker.nth(id, 1, "análise de c1");
    expect(await adRow(id)).toMatchObject({ title: c0.title, status: "em_moderacao" });

    const b = await ai.call(base + 1, "nova análise de c0");
    expect(b.request.userText).toContain(c0.title);
    b.release(AI_APPROVED);
    r0.release(AI_APPROVED);
    await tracker.settled(id);
    expect(await adRow(id)).toMatchObject({ title: c0.title, status: "ativo" });
  });

  it("R2: edições na fila do lock — o conteúdo final sempre foi analisado e aprovado", async () => {
    const o = await owner();
    const { id, input: c0 } = await publishActive(o);
    const c1 = withText(c0);
    const lock = await lockRow(id);
    const first = send(o.api.patch(`/api/ads/${id}`).send(c1));
    const second = send(o.api.patch(`/api/ads/${id}`).send(c0));
    await waitBlockedBy(lock.client, lock.pid, 2, "duas edições esperando o lock");
    await lock.commit();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);

    ai.autoRespond(AI_APPROVED);
    await tracker.settled(id);
    const final = await adRow(id);
    // A ordem de aquisição do lock não é presumida: é deduzida do conteúdo final.
    if (final.title === c0.title) {
      // c1 e depois c0: c0 voltou como nova versão e foi analisado de novo. A análise disparada
      // por c1 pode ter lido c0 (claim depois do segundo commit); c1 nunca ficou público.
      expect(ai.callsWith(c0.title).length).toBeGreaterThanOrEqual(2);
      expect(ai.callsWith(c1.title).length).toBeLessThanOrEqual(1);
    } else {
      // c0 (igual ao atual, sem análise) e depois c1.
      expect(final.title).toBe(c1.title);
      expect(ai.callsWith(c1.title)).toHaveLength(1);
      expect(ai.callsWith(c0.title)).toHaveLength(1);
    }
    expect(final.status).toBe("ativo");
  });

  it("R3: edição atrasada não ressuscita anúncio excluído pelo dono", async () => {
    const o = await owner();
    const { id, input } = await publishActive(o);
    const gate = gateEdit();
    const stale = send(o.api.patch(`/api/ads/${id}`).send(withText(input)));
    await gate.reached();
    await o.api.delete(`/api/ads/${id}`).expect(204);
    const base = ai.calls.length;
    gate.release();

    expect((await stale).status).toBe(404);
    await tracker.settled(id);
    expect((await adRow(id)).status).toBe("excluido");
    expect(ai.calls.length).toBe(base);
  });

  it("R3b: edição atrasada não ressuscita anúncio removido por banimento", async () => {
    const o = await owner();
    const { id, input } = await publishActive(o);
    const admin = await platformAdmin();
    const gate = gateEdit();
    const stale = send(o.api.patch(`/api/ads/${id}`).send(withText(input)));
    await gate.reached();
    await admin
      .post(`/api/admin/users/${o.userId}/sanctions`)
      .send({ type: "banimento", reason: "Golpe confirmado" })
      .expect(201);
    const base = ai.calls.length;
    gate.release();

    expect((await stale).status).toBe(400);
    await tracker.settled(id);
    expect(await adRow(id)).toMatchObject({ status: "removido", status_reason: "Conta banida" });
    expect(ai.calls.length).toBe(base);
  });

  it("R3c: edição atrasada não apaga a ocultação por denúncia (RN-093)", async () => {
    const o = await owner();
    const { id, input } = await publishActive(o);
    const reporter = await onboardedProfile(app, "Vizinha Denunciante");
    await as(app, reporter.cookie)
      .post(`/api/buildings/${o.buildingId}/join`)
      .send({ unit: "8" })
      .expect(200);
    const gate = gateEdit();
    const edited = withText(input);
    const stale = send(o.api.patch(`/api/ads/${id}`).send(edited));
    await gate.reached();
    await as(app, reporter.cookie)
      .post("/api/reports")
      .send({ targetType: "ad", targetId: id, reason: "spam" })
      .expect(204);
    const base = ai.calls.length;
    gate.release();

    expect((await stale).status).toBe(200);
    await tracker.settled(id);
    expect(await adRow(id)).toMatchObject({
      title: edited.title,
      status: "em_moderacao",
      manual_review: true,
      status_reason: "Ocultado após denúncias. Em revisão pela equipe.",
    });
    expect(ai.calls.length).toBe(base);
  });

  // —— Decisão do admin (INV-6) ——

  it("R4: admin não reativa anúncio já excluído pelo dono", async () => {
    const o = await owner();
    const { id } = await hiddenByReport(o);
    const admin = await platformAdmin();
    const approvedBefore = await notifications(o.userId, "anuncio_aprovado");
    await o.api.delete(`/api/ads/${id}`).expect(204);

    await admin.post(`/api/admin/ads/${id}/decision`).send({ decision: "aprovar" }).expect(404);
    expect((await adRow(id)).status).toBe("excluido");
    expect(await adminRecords(id)).toBe(0);
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(approvedBefore);
    expect(await openReports(id)).toBe(1);
    expect(await auditEntries(id)).toBe(0);
  });

  it("R4b: admin decide antes da exclusão (controle)", async () => {
    const o = await owner();
    const { id } = await hiddenByReport(o);
    const admin = await platformAdmin();
    const approvedBefore = await notifications(o.userId, "anuncio_aprovado");
    await admin.post(`/api/admin/ads/${id}/decision`).send({ decision: "aprovar" }).expect(204);
    await o.api.delete(`/api/ads/${id}`).expect(204);

    expect((await adRow(id)).status).toBe("excluido");
    expect(await adminRecords(id)).toBe(1);
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(approvedBefore + 1);
    expect(await openReports(id)).toBe(0);
  });

  it("R4c: admin e exclusão concorrentes — exclusão nunca é revertida", async () => {
    const o = await owner();
    const { id } = await hiddenByReport(o);
    const admin = await platformAdmin();
    const approvedBefore = await notifications(o.userId, "anuncio_aprovado");
    const lock = await lockRow(id);
    const removal = send(o.api.delete(`/api/ads/${id}`));
    const decision = send(
      admin.post(`/api/admin/ads/${id}/decision`).send({ decision: "aprovar" }),
    );
    await waitBlockedBy(lock.client, lock.pid, 2, "exclusão e decisão esperando o lock");
    await lock.commit();
    expect((await removal).status).toBe(204);
    const decided = (await decision).status;
    expect([204, 404]).toContain(decided);

    // Quem pegou o lock primeiro só é deduzido pela resposta do admin.
    const adminWon = decided === 204;
    expect((await adRow(id)).status).toBe("excluido");
    expect(await adminRecords(id)).toBe(adminWon ? 1 : 0);
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(
      approvedBefore + (adminWon ? 1 : 0),
    );
    expect(await openReports(id)).toBe(adminWon ? 0 : 1);
  });

  it("R5: falha ao gravar o registro do admin desfaz tudo", async () => {
    const o = await owner();
    const { id } = await hiddenByReport(o);
    const admin = await platformAdmin();
    await failingTrigger("ad_moderations", id);

    await admin.post(`/api/admin/ads/${id}/decision`).send({ decision: "aprovar" }).expect(500);
    expect(await adRow(id)).toMatchObject({ status: "em_moderacao", manual_review: true });
    expect(await openReports(id)).toBe(1);
    expect(await auditEntries(id)).toBe(0);
  });

  it("R5b: falha na auditoria desfaz a decisão do admin", async () => {
    const o = await owner();
    const { id } = await hiddenByReport(o);
    const admin = await platformAdmin();
    const approvedBefore = await notifications(o.userId, "anuncio_aprovado");
    await failingTrigger("audit_logs", id);

    await admin.post(`/api/admin/ads/${id}/decision`).send({ decision: "aprovar" }).expect(500);
    expect(await adRow(id)).toMatchObject({ status: "em_moderacao", manual_review: true });
    expect(await adminRecords(id)).toBe(0);
    expect(await openReports(id)).toBe(1);
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(approvedBefore);
  });

  // —— Execução única por episódio (INV-4) ——

  it("R6: segunda análise da mesma versão não chama a IA nem sobrepõe 'revisar'", async () => {
    const o = await owner();
    const { id, input, call } = await publish(o);
    const second = app.get(AdModerationService).moderate(id);
    call.release(AI_REVIEW);
    await tracker.nth(id, 0);
    // No código antigo a segunda análise chamou a IA: libera para ver o efeito.
    ai.autoRespond(AI_APPROVED);
    await second;

    expect(ai.callsWith(input.title)).toHaveLength(1);
    expect((await adRow(id)).status).toBe("em_moderacao");
  });

  it("R6b: reativação em clique duplo gera uma única análise", async () => {
    const o = await owner();
    const { id, input } = await publishActive(o);
    await o.api.post(`/api/ads/${id}/pause`).expect(200);
    const edited = withText(input);
    await o.api.patch(`/api/ads/${id}`).send(edited).expect(200);
    expect((await adRow(id)).needs_moderation).toBe(true);

    const lock = await lockRow(id);
    const first = send(o.api.post(`/api/ads/${id}/resume`));
    const second = send(o.api.post(`/api/ads/${id}/resume`));
    await waitBlockedBy(lock.client, lock.pid, 2, "duas reativações esperando o lock");
    await lock.commit();
    const statuses = [(await first).status, (await second).status].sort();
    ai.autoRespond(AI_APPROVED);
    await tracker.settled(id);

    expect(statuses).toEqual([200, 400]);
    expect(ai.callsWith(edited.title)).toHaveLength(1);
  });

  // —— Resposta atrasada da IA (INV-3, INV-5) ——

  /** Descarte: nada de registro automático, notificação ou mudança de validade. */
  async function expectDiscarded(
    o: Owner,
    id: string,
    before: { records: number; approved: number; removed: number },
  ) {
    expect(await automaticRecords(id)).toBe(before.records);
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(before.approved);
    expect(await notifications(o.userId, "anuncio_removido")).toBe(before.removed);
  }
  const snapshotEffects = async (o: Owner, id: string) => ({
    records: await automaticRecords(id),
    approved: await notifications(o.userId, "anuncio_aprovado"),
    removed: await notifications(o.userId, "anuncio_removido"),
  });

  it("R7/I1: aprovação atrasada não reativa anúncio excluído", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    await o.api.delete(`/api/ads/${id}`).expect(204);
    const before = await snapshotEffects(o, id);
    call.release(AI_APPROVED);
    await tracker.settled(id);
    expect(await adRow(id)).toMatchObject({ status: "excluido", published_at: null });
    await expectDiscarded(o, id, before);
  });

  it("R7/I1b: aprovação atrasada não republica anúncio de conta banida", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    const admin = await platformAdmin();
    await admin
      .post(`/api/admin/users/${o.userId}/sanctions`)
      .send({ type: "banimento", reason: "Golpe confirmado" })
      .expect(201);
    const before = await snapshotEffects(o, id);
    call.release(AI_APPROVED);
    await tracker.settled(id);
    expect(await adRow(id)).toMatchObject({ status: "removido", status_reason: "Conta banida" });
    await expectDiscarded(o, id, before);
  });

  it("R7/I2a: aprovação atrasada não desfaz remoção pelo admin", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    const admin = await platformAdmin();
    await admin
      .post(`/api/admin/ads/${id}/decision`)
      .send({ decision: "remover", reason: "Conteúdo enganoso" })
      .expect(204);
    const before = await snapshotEffects(o, id);
    call.release(AI_APPROVED);
    await tracker.settled(id);
    expect(await adRow(id)).toMatchObject({
      status: "removido",
      status_reason: "Conteúdo enganoso",
    });
    await expectDiscarded(o, id, before);
  });

  it("R7/I2b: proibição atrasada não desfaz aprovação pelo admin", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    const admin = await platformAdmin();
    await admin.post(`/api/admin/ads/${id}/decision`).send({ decision: "aprovar" }).expect(204);
    const before = await snapshotEffects(o, id);
    const expiresAt = (await adRow(id)).expires_at;
    call.release(AI_PROHIBITED);
    await tracker.settled(id);
    expect(await adRow(id)).toMatchObject({ status: "ativo", expires_at: expiresAt });
    await expectDiscarded(o, id, before);
  });

  it("R7/I3: análise da versão antiga não publica a versão editada", async () => {
    const o = await owner();
    const { id, input, call: a } = await publish(o);
    const edited = withText(input);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(edited).expect(200);
    const b = await ai.call(base, "análise da versão editada");
    expect(b.request.userText).toContain(edited.title);

    a.release(AI_APPROVED);
    await tracker.nth(id, 0, "análise antiga");
    expect((await adRow(id)).status).toBe("em_moderacao");
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(0);

    b.release(AI_APPROVED);
    await tracker.settled(id);
    expect(await adRow(id)).toMatchObject({ status: "ativo", title: edited.title });
  });

  it("R7/I3b: versão editada em revisão não é publicada pela análise antiga", async () => {
    const o = await owner();
    const { id, input, call: a } = await publish(o);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);
    const b = await ai.call(base, "análise da versão editada");
    b.release(AI_REVIEW);
    await tracker.nth(id, 1, "análise nova");
    a.release(AI_APPROVED);
    await tracker.settled(id);
    expect((await adRow(id)).status).toBe("em_moderacao");
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(0);
  });

  it("R7/I4: aprovação antiga fora de ordem não desfaz remoção da versão nova", async () => {
    const o = await owner();
    const { id, input, call: a } = await publish(o);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);
    const b = await ai.call(base, "análise da versão editada");
    b.release(AI_PROHIBITED);
    await tracker.nth(id, 1, "análise nova");
    expect((await adRow(id)).status).toBe("removido");
    a.release(AI_APPROVED);
    await tracker.settled(id);
    expect((await adRow(id)).status).toBe("removido");
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(0);
  });

  it("R7/I4b: aprovação antiga não reativa anúncio pausado pelo dono", async () => {
    const o = await owner();
    const { id, input, call: a } = await publish(o);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);
    const b = await ai.call(base, "análise da versão editada");
    b.release(AI_APPROVED);
    await tracker.nth(id, 1, "análise nova");
    await o.api.post(`/api/ads/${id}/pause`).expect(200);
    const before = await snapshotEffects(o, id);
    a.release(AI_APPROVED);
    await tracker.settled(id);
    expect((await adRow(id)).status).toBe("pausado");
    await expectDiscarded(o, id, before);
  });

  it("R7/I5: aprovação atrasada não tira anúncio da revisão manual (estado artificial)", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    await db.query(`UPDATE ads SET manual_review = true WHERE id = $1`, [id]);
    const before = await snapshotEffects(o, id);
    call.release(AI_APPROVED);
    await tracker.settled(id);
    expect((await adRow(id)).status).toBe("em_moderacao");
    await expectDiscarded(o, id, before);
  });

  // —— Fallback sem IA (INV-8, RN-MOD-003) ——

  it("R8: sem IA, as regras também não reativam anúncio excluído", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    await o.api.delete(`/api/ads/${id}`).expect(204);
    const before = await snapshotEffects(o, id);
    call.fail();
    await tracker.settled(id);
    expect((await adRow(id)).status).toBe("excluido");
    await expectDiscarded(o, id, before);
  });

  it("R8b: sem IA, as regras não desfazem remoção pelo admin", async () => {
    const o = await owner();
    const { id, call } = await publish(o);
    const admin = await platformAdmin();
    await admin
      .post(`/api/admin/ads/${id}/decision`)
      .send({ decision: "remover", reason: "Conteúdo enganoso" })
      .expect(204);
    const before = await snapshotEffects(o, id);
    call.fail();
    await tracker.settled(id);
    expect((await adRow(id)).status).toBe("removido");
    await expectDiscarded(o, id, before);
  });

  it("R8c: sem IA, as regras não publicam a versão editada com o resultado da antiga", async () => {
    const o = await owner();
    const { id, input, call: a } = await publish(o);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);
    await ai.call(base, "análise da versão editada");
    a.fail();
    await tracker.nth(id, 0, "análise antiga");
    expect((await adRow(id)).status).toBe("em_moderacao");
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(0);
  });

  // —— Reativação e renovação decididas sob lock (Ajuste 1) ——

  it("R9: reativar com leitura antiga não publica conteúdo editado sem moderação", async () => {
    const o = await owner();
    const { id, input } = await publishActive(o);
    await o.api.post(`/api/ads/${id}/pause`).expect(200);
    expect((await adRow(id)).needs_moderation).toBe(false);

    const plans = app.get(PlansService);
    const gate = armGate(plans, "planOf", {
      label: "reativação antes do lock",
      match: (userId) => userId === o.userId,
    });
    cleanups.push(gate.restore);
    const resume = send(o.api.post(`/api/ads/${id}/resume`));
    await gate.reached();
    const edited = withText(input);
    await o.api.patch(`/api/ads/${id}`).send(edited).expect(200);
    expect(await adRow(id)).toMatchObject({ title: edited.title, needs_moderation: true });
    const base = ai.calls.length;
    gate.release();

    const resumed = await resume;
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe("em_moderacao");
    const analysis = await ai.call(base, "análise do conteúdo editado");
    expect(analysis.request.userText).toContain(edited.title);
    expect(await notifications(o.userId, "anuncio_aprovado")).toBe(1);
  });

  it("R9b: renovar com leitura antiga não publica conteúdo editado sem moderação", async () => {
    const o = await owner();
    const { id, input } = await publishActive(o);
    await db.query(
      `UPDATE ads SET status = 'expirado', expires_at = now() - interval '1 day' WHERE id = $1`,
      [id],
    );

    const settings = app.get(SettingsService);
    const gate = armGate(settings, "get", {
      label: "renovação antes do lock",
      match: (key) => key === "ads.activeDays",
    });
    cleanups.push(gate.restore);
    const renew = send(o.api.post(`/api/ads/${id}/renew`));
    await gate.reached();
    const edited = withText(input);
    await o.api.patch(`/api/ads/${id}`).send(edited).expect(200);
    expect(await adRow(id)).toMatchObject({ title: edited.title, needs_moderation: true });
    const base = ai.calls.length;
    gate.release();

    const renewed = await renew;
    expect(renewed.status).toBe(200);
    expect(renewed.body.status).toBe("em_moderacao");
    const analysis = await ai.call(base, "análise do conteúdo editado");
    expect(analysis.request.userText).toContain(edited.title);
  });

  it("R9c: anúncio pausado sob revisão manual não volta direto ao ar (estado artificial)", async () => {
    const o = await owner();
    const { id } = await publishActive(o);
    await db.query(`UPDATE ads SET status = 'pausado', manual_review = true WHERE id = $1`, [id]);
    const base = ai.calls.length;
    const resumed = await o.api.post(`/api/ads/${id}/resume`).expect(200);
    await tracker.settled(id);
    expect(resumed.body.status).toBe("em_moderacao");
    expect(ai.calls.length).toBe(base);
  });
});
