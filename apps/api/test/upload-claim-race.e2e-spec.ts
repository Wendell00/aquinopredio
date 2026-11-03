import type { INestApplication } from "@nestjs/common";
import type { Response } from "supertest";
import { DataSource } from "typeorm";
import { AiService } from "../src/ai/ai.service";
import { GeoService } from "../src/geo/geo.service";
import { StorageService } from "../src/storage/storage.service";
import { adFixtures, type Owner } from "./support/ads";
import { createTestApp, moderationTracker, resetRateLimits } from "./support/app";
import {
  AI_APPROVED,
  createBarrierAi,
  createFakeStorage,
  fakeGeo,
  sampleJpeg,
} from "./support/fakes";
import { assertIsolated, describeIsolated } from "./support/isolation";
import type { ModerationTracker } from "./support/moderation";
import { type HeldLock, holdUploadLocks, waitBlockedBy } from "./support/sync";

const REFUSED = "Uma das fotos não pode ser usada. Envie de novo.";

/**
 * P00-B4.1 — validação, associação e marcação de uploads atômicas na criação e na edição de
 * anúncios. Sem regra nova: `attached_at` segue como marca de uso (nunca limpa) e foto removida
 * continua sem reutilização (lacuna L1 no STATUS).
 *
 * Sincronização igual antes e depois da correção: o teste trava a linha do upload numa segunda
 * conexão. No código antigo as operações já validaram e param no INSERT de `ad_images` (FK em
 * KEY SHARE); no corrigido param ao travar os uploads. `pg_blocking_pids` (transitivo) prova a
 * fila; o vencedor é deduzido do banco, sem supor ordem FIFO. Asserções sobre associação,
 * propriedade e `attached_at` no banco, não só códigos HTTP.
 */
describeIsolated("Associação de uploads sob concorrência (e2e, P00-B4.1)", () => {
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
    // Libera locks e triggers de teste e responde as análises disparadas, mesmo em falha.
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    ai.autoRespond(AI_APPROVED);
    await tracker.settleAll();
    ai.autoRespond(null);
  });

  afterAll(async () => {
    await app.close();
  });

  // —— Apoio ——

  const { adInput, withText, owner, publish, count, send } = adFixtures(() => ({
    app,
    db,
    ai,
    tracker,
    categoryId,
  }));

  async function upload(o: Owner): Promise<string> {
    const res = await o.api
      .post("/api/uploads/images")
      .attach("file", await sampleJpeg(), { filename: "foto.jpg", contentType: "image/jpeg" })
      .expect(201);
    return res.body.id as string;
  }

  /** Anúncio ativo com as fotos dadas (publicação + aprovação reais). */
  async function activeWith(o: Owner, imageIds: string[]) {
    const published = await publish(o, { ...adInput(o.buildingId), imageIds });
    published.call.release(AI_APPROVED);
    expect(await tracker.nth(published.id, 0)).toBe("ativo");
    return published;
  }

  type Ad = Awaited<ReturnType<typeof activeWith>>;
  const createWith = (o: Owner, imageIds: string[]) =>
    send(o.api.post("/api/ads").send({ ...adInput(o.buildingId), imageIds }));
  const editWith = (o: Owner, ad: Ad, imageIds: string[]) =>
    send(o.api.patch(`/api/ads/${ad.id}`).send({ ...ad.input, imageIds }));

  async function adsUsing(uploadId: string): Promise<string[]> {
    const rows: { ad_id: string }[] = await db.query(
      `SELECT ad_id FROM ad_images WHERE upload_id = $1`,
      [uploadId],
    );
    return rows.map((row) => row.ad_id);
  }
  async function imagesOf(adId: string): Promise<string[]> {
    const rows: { upload_id: string }[] = await db.query(
      `SELECT upload_id FROM ad_images WHERE ad_id = $1 ORDER BY position`,
      [adId],
    );
    return rows.map((row) => row.upload_id);
  }
  async function attached(uploadId: string): Promise<boolean> {
    const [row] = await db.query(`SELECT attached_at FROM uploads WHERE id = $1`, [uploadId]);
    return row.attached_at !== null;
  }
  const adsOf = (userId: string) => count(`SELECT count(*) FROM ads WHERE user_id = $1`, [userId]);
  /** Toda associação liga anúncio e upload do mesmo dono. */
  const crossOwner = () =>
    count(
      `SELECT count(*) FROM ad_images i JOIN ads a ON a.id = i.ad_id
       JOIN uploads u ON u.id = i.upload_id WHERE a.user_id <> u.owner_id`,
      [],
    );

  async function hold(uploadIds: string[]) {
    const held: HeldLock = await holdUploadLocks(uploadIds);
    cleanups.push(held.end);
    return held;
  }

  /** Duas operações sobre os mesmos uploads, as duas comprovadamente na fila do holder. */
  async function contend(
    uploadIds: string[],
    first: () => Promise<Response>,
    second: () => Promise<Response>,
  ) {
    const holder = await hold(uploadIds);
    const p1 = first();
    await waitBlockedBy(holder.client, holder.pid, 1, "1ª operação esperando o upload");
    const p2 = second();
    await waitBlockedBy(holder.client, holder.pid, 2, "2ª operação na fila");
    await holder.commit();
    return [await p1, await p2] as const;
  }

  const ok = (res: Response) => res.status === 200 || res.status === 201;

  /** Uma aceita e a outra recusada com 400 e a mensagem de foto indisponível. */
  function expectOneAccepted(results: readonly [Response, Response]) {
    const statuses = results.map((res) => res.status);
    process.stdout.write(
      `[P00-B4.1] ${expect.getState().currentTestName}: ${statuses.join(" / ")}\n`,
    );
    const refused = results.filter((res) => !ok(res));
    expect(results.filter(ok)).toHaveLength(1);
    expect(refused.map((res) => [res.status, res.body.message])).toEqual([[400, REFUSED]]);
  }

  async function failingTrigger(name: string, table: string, timing: string, condition: string) {
    await db.query(`
      CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $$
      BEGIN
        IF ${condition} THEN RAISE EXCEPTION 'falha simulada no teste'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await db.query(
      `CREATE TRIGGER ${name} BEFORE ${timing} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`,
    );
    cleanups.push(async () => {
      await db.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
      await db.query(`DROP FUNCTION IF EXISTS ${name}()`);
    });
  }

  // —— Disputa pelo mesmo upload ——

  it("U1: criação × criação com o mesmo upload — um anúncio só, a outra recusada", async () => {
    const o = await owner();
    const x = await upload(o);
    const before = await adsOf(o.userId);
    const results = await contend(
      [x],
      () => createWith(o, [x]),
      () => createWith(o, [x]),
    );

    expect(await adsUsing(x)).toHaveLength(1);
    expect(await attached(x)).toBe(true);
    expect(await adsOf(o.userId)).toBe(before + 1);
    expect(await crossOwner()).toBe(0);
    expectOneAccepted(results);
  });

  it("U2: criação × edição com o mesmo upload", async () => {
    const o = await owner();
    const b = await activeWith(o, []);
    const x = await upload(o);
    const before = await adsOf(o.userId);
    const [created, edited] = await contend(
      [x],
      () => createWith(o, [x]),
      () => editWith(o, b, [x]),
    );

    const using = await adsUsing(x);
    expect(using).toHaveLength(1);
    expect(await attached(x)).toBe(true);
    // Anúncio novo só existe se a criação venceu.
    expect(await adsOf(o.userId)).toBe(before + (using[0] === b.id ? 0 : 1));
    expect(await imagesOf(b.id)).toEqual(using[0] === b.id ? [x] : []);
    expectOneAccepted([created, edited]);
  });

  it("U3: edição × edição de anúncios distintos com o mesmo upload", async () => {
    const o = await owner();
    const a = await activeWith(o, []);
    const b = await activeWith(o, []);
    const x = await upload(o);
    const results = await contend(
      [x],
      () => editWith(o, a, [x]),
      () => editWith(o, b, [x]),
    );

    const using = await adsUsing(x);
    expect(using).toHaveLength(1);
    expect(await attached(x)).toBe(true);
    const loser = using[0] === a.id ? b.id : a.id;
    expect(await imagesOf(loser)).toEqual([]);
    expectOneAccepted(results);
  });

  it("U4: conjuntos sobrepostos em ordem inversa — sem deadlock, associação consistente", async () => {
    const o = await owner();
    const a = await activeWith(o, []);
    const b = await activeWith(o, []);
    const x = await upload(o);
    const y = await upload(o);
    const results = await contend(
      [x, y],
      () => editWith(o, a, [x, y]),
      () => editWith(o, b, [y, x]),
    );

    const usingX = await adsUsing(x);
    const usingY = await adsUsing(y);
    expect(usingX).toHaveLength(1);
    expect(usingY).toEqual(usingX);
    const winner = usingX[0] === a.id ? a : b;
    const loser = winner === a ? b : a;
    expect(await imagesOf(winner.id)).toEqual(winner === a ? [x, y] : [y, x]);
    expect(await imagesOf(loser.id)).toEqual([]);
    expect([await attached(x), await attached(y)]).toEqual([true, true]);
    expectOneAccepted(results);
  });

  // —— Fotos do próprio anúncio e propriedade ——

  it("U5: reordenar e manter fotos do próprio anúncio; outro anúncio não as toma", async () => {
    const o = await owner();
    const x = await upload(o);
    const y = await upload(o);
    const a = await activeWith(o, [x, y]);
    const b = await activeWith(o, []);

    expect((await editWith(o, a, [y, x])).status).toBe(200);
    expect(await imagesOf(a.id)).toEqual([y, x]);
    expect([await attached(x), await attached(y)]).toEqual([true, true]);

    const taken = await editWith(o, b, [x]);
    expect(await imagesOf(b.id)).toEqual([]);
    expect(await adsUsing(x)).toEqual([a.id]);
    expect([taken.status, taken.body.message]).toEqual([400, REFUSED]);
  });

  it("U6: upload de outro usuário é recusado sem efeito", async () => {
    const o = await owner();
    const other = await owner();
    const foreign = await upload(other);
    const before = await adsOf(o.userId);

    const res = await createWith(o, [foreign]);
    expect(await adsOf(o.userId)).toBe(before);
    expect(await adsUsing(foreign)).toEqual([]);
    expect(await attached(foreign)).toBe(false);
    expect([res.status, res.body.message]).toEqual([400, REFUSED]);
  });

  // —— Falha intermediária ——

  it("U7a: falha ao inserir a 2ª foto desfaz criação e edição sem marcar nada", async () => {
    const o = await owner();
    const x = await upload(o);
    const keep = await upload(o);
    const a = await activeWith(o, [keep]);
    const y = await upload(o);
    await failingTrigger("e2e_falha_ad_images", "ad_images", "INSERT", "NEW.position = 1");
    const before = await adsOf(o.userId);

    const created = await createWith(o, [x, y]);
    expect(await adsOf(o.userId)).toBe(before);
    expect([await adsUsing(x), await adsUsing(y)]).toEqual([[], []]);
    expect([await attached(x), await attached(y)]).toEqual([false, false]);
    expect(created.status).toBe(500);

    const edited = await editWith(o, a, [keep, y]);
    expect(await imagesOf(a.id)).toEqual([keep]);
    expect(await attached(y)).toBe(false);
    expect(edited.status).toBe(500);
  });

  it("U7b: falha ao marcar o upload não deixa anúncio associado sem marca", async () => {
    const o = await owner();
    const x = await upload(o);
    await failingTrigger(
      "e2e_falha_marcacao",
      "uploads",
      "UPDATE OF attached_at",
      `NEW.id = '${x}'::uuid`,
    );
    const before = await adsOf(o.userId);

    const res = await createWith(o, [x]);
    // Nada pela metade: sem anúncio novo e sem associação (com a marca falhando).
    expect({ ads: await adsOf(o.userId), using: await adsUsing(x) }).toEqual({
      ads: before,
      using: [],
    });
    expect(await attached(x)).toBe(false);
    expect(res.status).toBe(500);
  });

  // —— Sem bloqueio desnecessário e semântica atual ——

  it("U8: uploads distintos não esperam o lock de outro upload", async () => {
    const o = await owner();
    const a = await activeWith(o, []);
    const b = await activeWith(o, []);
    const x = await upload(o);
    const y = await upload(o);
    const z = await upload(o);
    const holder = await hold([x]);
    const blocked = editWith(o, a, [x]);
    await waitBlockedBy(holder.client, holder.pid, 1, "edição com X esperando");

    // Com X ainda travado, Y e Z seguem.
    expect((await editWith(o, b, [y])).status).toBe(200);
    expect((await createWith(o, [z])).status).toBe(201);
    expect(await imagesOf(b.id)).toEqual([y]);
    await waitBlockedBy(holder.client, holder.pid, 1, "edição com X ainda esperando");

    await holder.commit();
    expect((await blocked).status).toBe(200);
    expect(await imagesOf(a.id)).toEqual([x]);
  });

  it("U9: foto removida continua marcada e não volta (comportamento atual, lacuna L1)", async () => {
    const o = await owner();
    const x = await upload(o);
    const y = await upload(o);
    const a = await activeWith(o, [x, y]);

    expect((await editWith(o, a, [x])).status).toBe(200);
    expect(await imagesOf(a.id)).toEqual([x]);
    expect(await adsUsing(y)).toEqual([]);
    expect(await attached(y)).toBe(true);

    const again = await editWith(o, a, [x, y]);
    expect(await imagesOf(a.id)).toEqual([x]);
    expect([again.status, again.body.message]).toEqual([400, REFUSED]);
  });
  // —— Upload associado sem marca (inconsistência preparada só no banco descartável) ——

  /** X associado ao anúncio A, mas com `attached_at` nulo (ex.: marcação antiga perdida). */
  async function associatedWithoutMark(o: Owner) {
    const x = await upload(o);
    const a = await activeWith(o, [x]);
    await db.query(`UPDATE uploads SET attached_at = NULL WHERE id = $1`, [x]);
    expect(await attached(x)).toBe(false);
    return { x, a };
  }

  it("U10a: criação com upload já associado (sem marca) é recusada sem efeito", async () => {
    const o = await owner();
    const { x, a } = await associatedWithoutMark(o);
    const before = await adsOf(o.userId);

    const res = await createWith(o, [x]);
    expect({ ads: await adsOf(o.userId), using: await adsUsing(x) }).toEqual({
      ads: before,
      using: [a.id],
    });
    expect(await attached(x)).toBe(false);
    expect([res.status, res.body.message]).toEqual([400, REFUSED]);
  });

  it("U10b: edição de outro anúncio com upload já associado (sem marca) é recusada sem efeito", async () => {
    const o = await owner();
    const { x, a } = await associatedWithoutMark(o);
    const b = await activeWith(o, []);

    const res = await editWith(o, b, [x]);
    expect(await adsUsing(x)).toEqual([a.id]);
    expect(await imagesOf(b.id)).toEqual([]);
    expect(await attached(x)).toBe(false);
    expect([res.status, res.body.message]).toEqual([400, REFUSED]);
  });

  it("U10c: o próprio anúncio mantém e reordena foto associada sem marca", async () => {
    const o = await owner();
    const { x, a } = await associatedWithoutMark(o);
    const y = await upload(o);

    const res = await editWith(o, a, [y, x]);
    expect(await imagesOf(a.id)).toEqual([y, x]);
    expect(res.status).toBe(200);
  });

  // —— Falha de marcação durante a edição ——

  async function adState(adId: string) {
    const [row] = await db.query(
      `SELECT title, description, status, status_reason, manual_review, needs_moderation,
              content_version, moderation_run_id
       FROM ads WHERE id = $1`,
      [adId],
    );
    return row;
  }
  async function marks(ids: string[]) {
    const rows: { id: string; attached_at: Date | null }[] = await db.query(
      `SELECT id, attached_at FROM uploads WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [ids],
    );
    return rows.map((row) => [row.id, row.attached_at?.toISOString() ?? null]);
  }

  it("U7c: falha ao marcar na edição desfaz tudo e não dispara moderação", async () => {
    const o = await owner();
    const x = await upload(o);
    const keep = await upload(o);
    const a = await activeWith(o, [x, keep]);
    const y = await upload(o);
    const before = {
      state: await adState(a.id),
      images: await imagesOf(a.id),
      marks: await marks([x, keep, y]),
    };
    expect(before.state.status).toBe("ativo");
    await failingTrigger(
      "e2e_falha_marcacao_edicao",
      "uploads",
      "UPDATE OF attached_at",
      `NEW.id = '${y}'::uuid`,
    );
    const moderations = tracker.count(a.id);
    const aiCalls = ai.calls.length;

    // Muda conteúdo e fotos (troca a ordem e acrescenta Y): sem a falha, remoderaria.
    const res = await o.api
      .patch(`/api/ads/${a.id}`)
      .send({ ...withText(a.input), imageIds: [keep, x, y] });

    expect({
      state: await adState(a.id),
      images: await imagesOf(a.id),
      marks: await marks([x, keep, y]),
    }).toEqual(before);
    expect(await adsUsing(y)).toEqual([]);
    expect(tracker.count(a.id)).toBe(moderations);
    expect(ai.calls.length).toBe(aiCalls);
    expect(res.status).toBe(500);
  });
});
