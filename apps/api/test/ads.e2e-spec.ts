import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AdsScheduler } from "../src/ads/ads.scheduler";
import { AdModerationService } from "../src/ads/moderation/ad-moderation.service";
import { AiService } from "../src/ai/ai.service";
import { GeoService } from "../src/geo/geo.service";
import { NotificationsService } from "../src/notifications/notifications.service";
import { SettingsService } from "../src/settings/settings.service";
import { StorageService } from "../src/storage/storage.service";
import { as, createTestApp, resetRateLimits, resident } from "./support/app";
import { createFakeAi, createFakeStorage, fakeGeo, sampleJpeg } from "./support/fakes";

describe("Anúncios (e2e)", () => {
  let app: INestApplication;
  let db: DataSource;
  const storage = createFakeStorage();
  const ai = createFakeAi();
  let categoryId: string;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(GeoService)
        .useValue(fakeGeo)
        .overrideProvider(StorageService)
        .useValue(storage)
        .overrideProvider(AiService)
        .useValue(ai),
    );
    db = app.get(DataSource);
    [{ id: categoryId }] = await db.query(`SELECT id FROM categories WHERE slug = 'alimentacao'`);
  });

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const adInput = (buildingId: string, overrides: Record<string, unknown> = {}) => ({
    buildingId,
    type: "produto",
    categoryId,
    title: `Bolo de pote ${Math.random().toString(36).slice(2, 7)}`,
    description: `Bolos de pote caseiros, sabores variados. Código ${Math.random().toString(36).slice(2)}`,
    priceMode: "fixo",
    priceCents: 1000,
    radiusKm: 0,
    whatsappEnabled: false,
    availability: null,
    tags: ["bolo"],
    imageIds: [],
    ...overrides,
  });

  async function upload(cookie: string): Promise<string> {
    const res = await as(app, cookie)
      .post("/api/uploads/images")
      .attach("file", await sampleJpeg(), { filename: "foto.jpg", contentType: "image/jpeg" })
      .expect(201);
    return res.body.id;
  }

  const moderate = (adId: string) => app.get(AdModerationService).moderate(adId);
  const scheduler = () =>
    new AdsScheduler(db, app.get(NotificationsService), app.get(SettingsService));

  it("lista as categorias da RN-060", async () => {
    const { cookie } = await resident(app);
    const res = await as(app, cookie).get("/api/categories").expect(200);
    expect(res.body).toHaveLength(16);
    expect(res.body[0]).toMatchObject({ name: "Alimentação", icon: "utensils" });
  });

  it("reprocessa a foto enviada e recusa arquivos que não são imagem", async () => {
    const { cookie } = await resident(app);
    const ok = await as(app, cookie)
      .post("/api/uploads/images")
      .attach("file", await sampleJpeg(), { filename: "foto.jpg", contentType: "image/jpeg" })
      .expect(201);
    expect(ok.body.url).toMatch(/^http:\/\/storage\.test\/ad\/.+\.webp$/);
    expect(ok.body).toMatchObject({ width: 800, height: 600 });

    await as(app, cookie)
      .post("/api/uploads/images")
      .attach("file", Buffer.from("<html>não é foto</html>"), {
        filename: "x.jpg",
        contentType: "image/jpeg",
      })
      .expect(422);
  });

  it("publica: entra em moderação e, aprovado, fica ativo por 30 dias (RN-062, RN-063)", async () => {
    const { cookie, buildingId } = await resident(app);
    const api = as(app, cookie);
    const imageId = await upload(cookie);
    const created = await api
      .post("/api/ads")
      .send(adInput(buildingId, { imageIds: [imageId] }))
      .expect(201);
    expect(created.body).toMatchObject({ status: "em_moderacao", radiusKm: 0, aiGenerated: false });
    expect(created.body.images).toHaveLength(1);

    expect(await moderate(created.body.id)).toBe("ativo");
    const mine = await api.get(`/api/ads/mine/${created.body.id}`).expect(200);
    expect(mine.body.status).toBe("ativo");
    const days = (new Date(mine.body.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(ai.calls.at(-1)).toMatchObject({ task: "moderation", images: 1 });
  });

  it("remove anúncio proibido com alta confiança da IA (RN-090, RN-091)", async () => {
    const { cookie, buildingId } = await resident(app);
    const created = await as(app, cookie)
      .post("/api/ads")
      .send(
        adInput(buildingId, {
          title: "Vendo arma de fogo",
          description: "Pistola com arma de fogo e munição, tratar.",
        }),
      )
      .expect(201);
    expect(await moderate(created.body.id)).toBe("removido");
    const mine = await as(app, cookie).get(`/api/ads/mine/${created.body.id}`);
    expect(mine.body).toMatchObject({
      status: "removido",
      statusReason: "Venda de armas não é permitida",
    });
  });

  it("limita o raio enquanto o prédio está em verificação e pelo plano (RN-028, RN-141, RN-142)", async () => {
    const { cookie, buildingId } = await resident(app);
    const api = as(app, cookie);
    const pending = await api.post("/api/ads").send(adInput(buildingId, { radiusKm: 1 }));
    expect(pending.status).toBe(403);
    expect(pending.body.message).toMatch(/verificação/);

    await db.query(`UPDATE buildings SET status = 'verificado' WHERE id = $1`, [buildingId]);
    await api
      .post("/api/ads")
      .send(adInput(buildingId, { radiusKm: 1 }))
      .expect(201);
    // Selo de verificado não muda o raio: quem decide é o plano.
    await db.query(`UPDATE building_memberships SET verified_at = now() WHERE building_id = $1`, [
      buildingId,
    ]);
    const far = await api.post("/api/ads").send(adInput(buildingId, { radiusKm: 3 }));
    expect(far.status).toBe(403);
    expect(far.body.message).toMatch(/Pro/);

    await db.query(
      `UPDATE users SET plan = 'pro' WHERE id = (SELECT created_by FROM buildings WHERE id = $1)`,
      [buildingId],
    );
    await api
      .post("/api/ads")
      .send(adInput(buildingId, { radiusKm: 10 }))
      .expect(201);
  });

  it("limita anúncios ativos simultâneos (RN-065) e bloqueia duplicados (RN-066)", async () => {
    const { cookie, buildingId } = await resident(app);
    const api = as(app, cookie);
    const first = adInput(buildingId);
    await api.post("/api/ads").send(first).expect(201);
    const duplicate = await api.post("/api/ads").send({ ...first, title: first.title });
    expect(duplicate.status).toBe(409);

    for (let i = 0; i < 4; i++) {
      await api
        .post("/api/ads")
        .send(
          adInput(buildingId, {
            title: `Serviço número ${i} xyz${i}`,
            description: `Descrição bem diferente ${i} ${"abc".repeat(i + 3)}`,
          }),
        )
        .expect(201);
    }
    const sixth = await api.post("/api/ads").send(adInput(buildingId));
    expect(sixth.status).toBe(403);
    expect(sixth.body.message).toMatch(/5 anúncios ativos/);
  });

  it("não aceita foto de outra pessoa", async () => {
    const owner = await resident(app);
    const imageId = await upload(owner.cookie);
    const other = await resident(app);
    const res = await as(app, other.cookie)
      .post("/api/ads")
      .send(adInput(other.buildingId, { imageIds: [imageId] }));
    expect(res.status).toBe(400);
  });

  it("pausa, reativa, renova, sobe (1x/72h) e exclui (RN-063, RN-064, RN-067)", async () => {
    const { cookie, buildingId } = await resident(app);
    const api = as(app, cookie);
    const { body: ad } = await api.post("/api/ads").send(adInput(buildingId)).expect(201);
    await moderate(ad.id);

    expect((await api.post(`/api/ads/${ad.id}/pause`).expect(200)).body.status).toBe("pausado");
    expect((await api.post(`/api/ads/${ad.id}/resume`).expect(200)).body.status).toBe("ativo");

    await api.post(`/api/ads/${ad.id}/bump`).expect(409);
    await db.query(`UPDATE ads SET published_at = now() - interval '73 hours' WHERE id = $1`, [
      ad.id,
    ]);
    const bumped = await api.post(`/api/ads/${ad.id}/bump`).expect(200);
    expect(bumped.body.bumpedAt).not.toBeNull();
    await api.post(`/api/ads/${ad.id}/bump`).expect(409);

    await db.query(`UPDATE ads SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
      ad.id,
    ]);
    expect(await scheduler().expireAds()).toBeGreaterThanOrEqual(1);
    expect((await api.get(`/api/ads/mine/${ad.id}`)).body.status).toBe("expirado");
    expect((await api.post(`/api/ads/${ad.id}/renew`).expect(200)).body.status).toBe("ativo");

    // RN-063: aviso de expiração, uma vez por ciclo.
    await db.query(`UPDATE ads SET expires_at = now() + interval '2 days' WHERE id = $1`, [ad.id]);
    expect(await scheduler().warnExpiring()).toBeGreaterThanOrEqual(1);
    expect(await scheduler().warnExpiring()).toBe(0);
    const notes = await api.get("/api/notifications").expect(200);
    expect(notes.body.map((n: { type: string }) => n.type)).toEqual(
      expect.arrayContaining(["anuncio_expirando", "anuncio_aprovado"]),
    );

    await api.delete(`/api/ads/${ad.id}`).expect(204);
    await api.get(`/api/ads/mine/${ad.id}`).expect(404);
  });

  it("editar o texto de anúncio ativo manda de volta para moderação (RN-064)", async () => {
    const { cookie, buildingId } = await resident(app);
    const api = as(app, cookie);
    const input = adInput(buildingId);
    const { body: ad } = await api.post("/api/ads").send(input).expect(201);
    await moderate(ad.id);

    const priceOnly = await api
      .patch(`/api/ads/${ad.id}`)
      .send({ ...input, priceCents: 1200 })
      .expect(200);
    expect(priceOnly.body.status).toBe("ativo");
    const newText = await api
      .patch(`/api/ads/${ad.id}`)
      .send({ ...input, title: "Bolo de pote gourmet" })
      .expect(200);
    expect(newText.body.status).toBe("em_moderacao");
  });

  it("gera rascunho com IA sem publicar e respeita o limite diário (RN-053, RN-110)", async () => {
    const { cookie, buildingId } = await resident(app);
    const api = as(app, cookie);
    const imageId = await upload(cookie);

    const draft = await api
      .post("/api/ads/ai-drafts")
      .send({ text: "faço bolo de pote, 10 reais, chocolate e ninho", imageIds: [imageId] })
      .expect(200);
    expect(draft.body).toMatchObject({
      type: "produto",
      categoryId,
      priceMode: "fixo",
      priceCents: 1000,
      tags: ["bolo", "doce"],
      toConfirm: ["disponibilidade"],
      coverImageId: imageId,
      remainingToday: 9,
    });
    expect(ai.calls.at(-1)?.userText).toContain("<texto_do_morador>");
    expect((await api.get("/api/ads/mine")).body).toHaveLength(0);

    const published = await api
      .post("/api/ads")
      .send(
        adInput(buildingId, {
          title: draft.body.title,
          description: draft.body.description,
          aiDraftId: draft.body.draftId,
        }),
      )
      .expect(201);
    expect(published.body.aiGenerated).toBe(true);

    await db.query(
      `INSERT INTO ai_ad_drafts (user_id, kind, tone, output, model, prompt_version)
       SELECT d.user_id, 'gerar', 'amigavel', '{}', 'x', 'x' FROM ai_ad_drafts d, generate_series(1, 9) WHERE d.id = $1`,
      [draft.body.draftId],
    );
    const blocked = await api.post("/api/ads/ai-drafts").send({ text: "mais um bolo" });
    expect(blocked.status).toBe(429);
  });

  it("suspensão impede publicar (RN-095)", async () => {
    const { cookie, buildingId } = await resident(app);
    const [{ user_id: userId }] = await db.query(
      `SELECT user_id FROM building_memberships WHERE building_id = $1`,
      [buildingId],
    );
    await db.query(
      `UPDATE users SET status = 'suspenso', suspended_until = now() + interval '7 days' WHERE id = $1`,
      [userId],
    );
    const res = await as(app, cookie).post("/api/ads").send(adInput(buildingId));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/suspensa/);
  });

  describe("brechas de moderação (revisão de segurança)", () => {
    it("editar anúncio pausado e reativar manda para moderação", async () => {
      const { cookie, buildingId } = await resident(app);
      const api = as(app, cookie);
      const input = adInput(buildingId);
      const { body: ad } = await api.post("/api/ads").send(input).expect(201);
      await moderate(ad.id);
      await api.post(`/api/ads/${ad.id}/pause`).expect(200);
      await api
        .patch(`/api/ads/${ad.id}`)
        .send({ ...input, title: "Título trocado enquanto pausado" })
        .expect(200);
      const resumed = await api.post(`/api/ads/${ad.id}/resume`).expect(200);
      expect(resumed.body.status).toBe("em_moderacao");
    });

    it("mudar tags, disponibilidade ou categoria de anúncio ativo também remodera", async () => {
      const { cookie, buildingId } = await resident(app);
      const api = as(app, cookie);
      const input = adInput(buildingId);
      const { body: ad } = await api.post("/api/ads").send(input).expect(201);
      await moderate(ad.id);
      const edited = await api
        .patch(`/api/ads/${ad.id}`)
        .send({ ...input, availability: "noites" })
        .expect(200);
      expect(edited.body.status).toBe("em_moderacao");
    });

    it("anúncio ocultado por denúncias não volta sozinho pela IA (RN-093)", async () => {
      const { cookie, buildingId } = await resident(app);
      const api = as(app, cookie);
      const input = adInput(buildingId);
      const { body: ad } = await api.post("/api/ads").send(input).expect(201);
      await moderate(ad.id);
      await db.query(`UPDATE ads SET status = 'em_moderacao', manual_review = true WHERE id = $1`, [
        ad.id,
      ]);
      await api
        .patch(`/api/ads/${ad.id}`)
        .send({ ...input, title: "Tentando escapar da revisão" })
        .expect(200);
      expect(await moderate(ad.id)).toBe("em_moderacao");
      expect((await api.get(`/api/ads/mine/${ad.id}`)).body.status).toBe("em_moderacao");
    });
  });
});
