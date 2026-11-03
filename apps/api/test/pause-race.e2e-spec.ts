import type { INestApplication } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, type Repository } from "typeorm";
import { Ad } from "../src/ads/ad.entity";
import { AdsScheduler } from "../src/ads/ads.scheduler";
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
import { armGateAfter, holdAdLock, waitBlockedBy } from "./support/sync";

/**
 * P00-B2.1 — pausa sob lock. RN-ADS-005 (só a parte da pausa), RN-MOD-007, RN-MOD-008.
 *
 * A pausa lia o anúncio sem lock e gravava `pausado` por ID. A barreira fica logo depois dessa
 * leitura (`Repository<Ad>.findOne` injetado devolveu `ativo`), sem lock aberto, no código antigo
 * e no novo. A mudança concorrente passa pelas rotas reais. Escritas em `ads` são contadas por um
 * trigger de teste, para provar ausência de escrita redundante. Asserções decisivas só com o
 * schema já existente (P00-B1), para o mesmo arquivo rodar antes da correção.
 */
describeIsolated("Pausa de anúncio sob concorrência (e2e, P00-B2.1)", () => {
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
    // Registra toda escrita em `ads` (só neste spec; removido no afterAll).
    await db.query(`CREATE TABLE e2e_ad_writes (
      seq bigserial PRIMARY KEY, ad_id uuid NOT NULL, old_status text, new_status text)`);
    await db.query(`
      CREATE FUNCTION e2e_ad_writes_log() RETURNS trigger AS $$
      BEGIN
        INSERT INTO e2e_ad_writes (ad_id, old_status, new_status)
        VALUES (NEW.id, OLD.status::text, NEW.status::text);
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER e2e_ad_writes_log AFTER UPDATE ON ads
      FOR EACH ROW EXECUTE FUNCTION e2e_ad_writes_log()`);
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
    await db.query(`DROP TRIGGER IF EXISTS e2e_ad_writes_log ON ads`);
    await db.query(`DROP FUNCTION IF EXISTS e2e_ad_writes_log()`);
    await db.query(`DROP TABLE IF EXISTS e2e_ad_writes`);
    await app.get(SettingsService).reset("reports.autoHideThreshold");
    await app.close();
  });

  // —— Apoio ——

  const { withText, owner, platformAdmin, neighbor, publishActive, adRow, send } = adFixtures(
    () => ({ app, db, ai, tracker, categoryId }),
  );

  /** Pausa a pré-leitura da pausa depois de ela ler o anúncio (ainda sem lock). */
  function gatePauseRead(adId: string) {
    const repo = app.get<Repository<Ad>>(getRepositoryToken(Ad));
    const gate = armGateAfter(repo, "findOne", {
      label: "pausa leu o anúncio, antes de agir",
      match: (options) => (options as { where?: { id?: string } } | undefined)?.where?.id === adId,
    });
    cleanups.push(gate.restore);
    return gate;
  }

  /** Pausa parada na barreira, depois de ler o anúncio `ativo`. */
  async function pauseAfterRead(o: Owner, adId: string) {
    const gate = gatePauseRead(adId);
    const pending = send(o.api.post(`/api/ads/${adId}/pause`));
    await gate.reached();
    return { gate, pending };
  }

  async function lockRow(adId: string) {
    const lock = await holdAdLock(adId);
    cleanups.push(lock.end);
    return lock;
  }

  async function writeMark(): Promise<number> {
    const [row] = await db.query(`SELECT coalesce(max(seq), 0)::int AS seq FROM e2e_ad_writes`);
    return row.seq;
  }
  async function writesSince(adId: string, mark: number) {
    return db.query(
      `SELECT old_status, new_status FROM e2e_ad_writes WHERE ad_id = $1 AND seq > $2 ORDER BY seq`,
      [adId, mark],
    ) as Promise<{ old_status: string; new_status: string }[]>;
  }
  async function moderationFields(adId: string) {
    const [row] = await db.query(
      `SELECT manual_review, needs_moderation, content_version, moderation_run_id, status_reason
       FROM ads WHERE id = $1`,
      [adId],
    );
    return row;
  }

  /** Conteúdo `ativo` só com decisão aplicada (IA, regras ou admin) para a versão atual. */
  async function expectActiveOnlyIfApproved(adId: string) {
    const [row] = await db.query(
      `SELECT a.status,
              EXISTS (SELECT 1 FROM ad_moderations m WHERE m.ad_id = a.id
                      AND m.content_version = a.content_version AND m.decision = 'aprovado') AS approved
       FROM ads a WHERE a.id = $1`,
      [adId],
    );
    if (row.status === "ativo") expect(row.approved).toBe(true);
  }

  // —— Exclusão e remoção ——

  it("B1: pausa atrasada não reverte exclusão pelo dono", async () => {
    const o = await owner();
    const { id } = await publishActive(o);
    const { gate, pending } = await pauseAfterRead(o, id);
    await o.api.delete(`/api/ads/${id}`).expect(204);
    gate.release();

    const paused = await pending;
    const afterPause = (await adRow(id)).status;
    // Tenta reativar mesmo assim: no código antigo mostra a consequência da reversão.
    const resumed = await o.api.post(`/api/ads/${id}/resume`);
    expect({ afterPause, afterResume: (await adRow(id)).status }).toEqual({
      afterPause: "excluido",
      afterResume: "excluido",
    });
    expect(paused.status).toBe(404);
    expect(resumed.status).toBe(404);
  });

  it("B2: pausa atrasada não reverte remoção pelo admin nem abre caminho para reativar", async () => {
    const o = await owner();
    const { id } = await publishActive(o);
    const admin = await platformAdmin();
    const { gate, pending } = await pauseAfterRead(o, id);
    await admin
      .post(`/api/admin/ads/${id}/decision`)
      .send({ decision: "remover", reason: "Conteúdo enganoso" })
      .expect(204);
    gate.release();

    const paused = await pending;
    const afterPause = await adRow(id);
    const resumed = await o.api.post(`/api/ads/${id}/resume`);
    expect({ afterPause: afterPause.status, afterResume: (await adRow(id)).status }).toEqual({
      afterPause: "removido",
      afterResume: "removido",
    });
    expect(afterPause.status_reason).toBe("Conteúdo enganoso");
    expect(paused.status).toBe(400);
    expect(resumed.status).toBe(400);
  });

  it("B3: pausa atrasada não reverte remoção por banimento", async () => {
    const o = await owner();
    const { id } = await publishActive(o);
    const admin = await platformAdmin();
    const { gate, pending } = await pauseAfterRead(o, id);
    await admin
      .post(`/api/admin/users/${o.userId}/sanctions`)
      .send({ type: "banimento", reason: "Golpe confirmado" })
      .expect(201);
    gate.release();

    const paused = await pending;
    expect(await adRow(id)).toMatchObject({ status: "removido", status_reason: "Conta banida" });
    expect(paused.status).toBe(400);
  });

  // —— Edição e moderação automática ——

  it("B4: pausa atrasada não deixa a edição ir ao ar sem análise aplicada", async () => {
    const o = await owner();
    const { id, input } = await publishActive(o);
    const { gate, pending } = await pauseAfterRead(o, id);
    const edited = withText(input);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(edited).expect(200);
    const analysis = await ai.call(base, "análise da edição");
    gate.release();
    const paused = await pending;

    analysis.release(AI_APPROVED);
    await tracker.settled(id);
    // No código antigo a pausa grava `pausado`, o commit é descartado e o dono reativa.
    if ((await adRow(id)).status === "pausado") {
      await o.api.post(`/api/ads/${id}/resume`).expect(200);
      await tracker.settled(id);
    }
    await expectActiveOnlyIfApproved(id);
    expect(paused.status).toBe(400);
    expect(await adRow(id)).toMatchObject({ status: "ativo", title: edited.title });
  });

  it("B5: pausa atrasada não reverte proibição pela IA", async () => {
    const o = await owner();
    const { id, input } = await publishActive(o);
    const { gate, pending } = await pauseAfterRead(o, id);
    const base = ai.calls.length;
    await o.api.patch(`/api/ads/${id}`).send(withText(input)).expect(200);
    (await ai.call(base, "análise da edição")).release(AI_PROHIBITED);
    expect(await tracker.nth(id, 1, "análise da edição")).toBe("removido");
    gate.release();

    const paused = await pending;
    const afterPause = (await adRow(id)).status;
    const resumed = await o.api.post(`/api/ads/${id}/resume`);
    expect({ afterPause, afterResume: (await adRow(id)).status }).toEqual({
      afterPause: "removido",
      afterResume: "removido",
    });
    expect(paused.status).toBe(400);
    expect(resumed.status).toBe(400);
  });

  // —— Denúncia e expiração ——

  it("B6: pausa atrasada não tira da fila do admin o anúncio ocultado por denúncia", async () => {
    await app.get(SettingsService).set("reports.autoHideThreshold", 1);
    const o = await owner();
    const { id } = await publishActive(o);
    const reporter = await neighbor(o.buildingId);
    const admin = await platformAdmin();
    const { gate, pending } = await pauseAfterRead(o, id);
    await reporter.api
      .post("/api/reports")
      .send({ targetType: "ad", targetId: id, reason: "spam" })
      .expect(204);
    gate.release();

    const paused = await pending;
    expect(await adRow(id)).toMatchObject({ status: "em_moderacao", manual_review: true });
    expect(paused.status).toBe(400);
    const queue = await admin.get("/api/admin/ads").expect(200);
    expect(queue.body.map((ad: { id: string }) => ad.id)).toContain(id);
  });

  it("B7: pausa atrasada não sobrescreve expiração (diferença esperada)", async () => {
    const o = await owner();
    const { id } = await publishActive(o);
    const { gate, pending } = await pauseAfterRead(o, id);
    await db.query(`UPDATE ads SET expires_at = now() - interval '1 minute' WHERE id = $1`, [id]);
    expect(await app.get(AdsScheduler).expireAds()).toBeGreaterThanOrEqual(1);
    gate.release();

    const paused = await pending;
    expect((await adRow(id)).status).toBe("expirado");
    expect(paused.status).toBe(400);
  });

  // —— Idempotência (RN-ADS-005, só pausa) ——

  it("B8: duas pausas na fila do lock — ambas 200, uma escrita, campos de moderação intactos", async () => {
    const o = await owner();
    const { id } = await publishActive(o);
    const before = await moderationFields(id);
    const mark = await writeMark();
    const lock = await lockRow(id);
    const first = send(o.api.post(`/api/ads/${id}/pause`));
    const second = send(o.api.post(`/api/ads/${id}/pause`));
    await waitBlockedBy(lock.client, lock.pid, 2, "duas pausas esperando o lock");
    await lock.commit();

    expect([(await first).status, (await second).status]).toEqual([200, 200]);
    expect((await first).body.status).toBe("pausado");
    expect((await second).body.status).toBe("pausado");
    expect(await writesSince(id, mark)).toEqual([{ old_status: "ativo", new_status: "pausado" }]);
    expect(await moderationFields(id)).toEqual(before);
  });

  it("B9: pausa repetida em sequência — 200 sem escrita", async () => {
    const o = await owner();
    const { id } = await publishActive(o);
    const before = await moderationFields(id);
    await o.api.post(`/api/ads/${id}/pause`).expect(200);
    const mark = await writeMark();
    const again = await o.api.post(`/api/ads/${id}/pause`);

    expect(again.status).toBe(200);
    expect(again.body.status).toBe("pausado");
    expect(await writesSince(id, mark)).toEqual([]);
    expect(await moderationFields(id)).toEqual(before);
  });

  // —— Controle ——

  it("C1: pausar e reativar seguem funcionando (controle)", async () => {
    const o = await owner();
    const { id } = await publishActive(o);
    const before = await moderationFields(id);
    const paused = await o.api.post(`/api/ads/${id}/pause`).expect(200);
    expect(paused.body.status).toBe("pausado");
    expect(await moderationFields(id)).toEqual(before);
    const resumed = await o.api.post(`/api/ads/${id}/resume`).expect(200);
    expect(resumed.body.status).toBe("ativo");
    // Propriedade continua revalidada: anúncio de outra pessoa é 404.
    const other = await owner();
    const { id: otherId } = await publishActive(other);
    await other.api.post(`/api/ads/${otherId}/pause`).expect(200);
    expect((await o.api.post(`/api/ads/${otherId}/pause`)).status).toBe(404);
  });
});
