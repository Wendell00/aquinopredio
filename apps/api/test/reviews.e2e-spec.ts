import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AdModerationService } from "../src/ads/moderation/ad-moderation.service";
import { GeoService } from "../src/geo/geo.service";
import { StorageService } from "../src/storage/storage.service";
import { as, createTestApp, onboardedProfile, resetRateLimits, resident } from "./support/app";
import { createFakeStorage, fakeGeo } from "./support/fakes";

describe("Indicações e avaliações (e2e)", () => {
  let app: INestApplication;
  let db: DataSource;
  let seller: Awaited<ReturnType<typeof resident>>;
  let sellerId: string;
  let buyer: { cookie: string };
  let lurker: { cookie: string };
  let outsider: { cookie: string };
  let adId: string;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(GeoService)
        .useValue(fakeGeo)
        .overrideProvider(StorageService)
        .useValue(createFakeStorage()),
    );
    db = app.get(DataSource);
    const [{ id: categoryId }] = await db.query(`SELECT id FROM categories WHERE slug = 'outros'`);
    seller = await resident(app, {}, "Marceneiro");
    [{ created_by: sellerId }] = await db.query(`SELECT created_by FROM buildings WHERE id = $1`, [
      seller.buildingId,
    ]);
    await db.query(`UPDATE buildings SET status = 'verificado' WHERE id = $1`, [seller.buildingId]);

    buyer = await onboardedProfile(app, "Cliente");
    lurker = await onboardedProfile(app, "Só olhando");
    for (const person of [buyer, lurker]) {
      await as(app, person.cookie)
        .post(`/api/buildings/${seller.buildingId}/join`)
        .send({ unit: "3" })
        .expect(200);
    }
    // Mora longe e não vê os anúncios do marceneiro.
    outsider = await resident(app, {}, "De outro bairro");

    const created = await as(app, seller.cookie)
      .post("/api/ads")
      .send({
        buildingId: seller.buildingId,
        type: "servico",
        categoryId,
        title: "Pequenos reparos em móveis",
        description: "Conserto portas de armário, gavetas e pés de mesa no seu apartamento.",
        priceMode: "a_combinar",
        priceCents: null,
        radiusKm: 0,
        whatsappEnabled: false,
        availability: null,
        tags: [],
        imageIds: [],
      })
      .expect(201);
    adId = created.body.id;
    await app.get(AdModerationService).moderate(adId);
  });

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("vizinho indica o anúncio; dono não indica o próprio e quem não vê não indica (RN-086)", async () => {
    const first = await as(app, buyer.cookie).post(`/api/ads/${adId}/recommend`).expect(200);
    expect(first.body).toEqual({ count: 1, recommendedByMe: true });
    // Indicar de novo não conta duas vezes.
    await as(app, buyer.cookie).post(`/api/ads/${adId}/recommend`).expect(200);
    const second = await as(app, lurker.cookie).post(`/api/ads/${adId}/recommend`).expect(200);
    expect(second.body).toEqual({ count: 2, recommendedByMe: true });

    await as(app, seller.cookie).post(`/api/ads/${adId}/recommend`).expect(400);
    await as(app, outsider.cookie).post(`/api/ads/${adId}/recommend`).expect(404);

    const detail = (await as(app, seller.cookie).get(`/api/ads/${adId}`).expect(200)).body;
    expect(detail.recommendation).toEqual({ count: 2, recommendedByMe: false });

    const undone = await as(app, lurker.cookie).delete(`/api/ads/${adId}/recommend`).expect(200);
    expect(undone.body).toEqual({ count: 1, recommendedByMe: false });
  });

  it("só avalia quem conversou e teve resposta; uma avaliação por pessoa, editável (RN-087)", async () => {
    const review = { rating: 5, comment: "Consertou a porta do armário no mesmo dia." };
    // Sem conversa: não pode.
    expect(
      (await as(app, lurker.cookie).get(`/api/users/${sellerId}/reviews`).expect(200)).body
        .canReview,
    ).toBe(false);
    await as(app, lurker.cookie).put(`/api/users/${sellerId}/review`).send(review).expect(403);

    // Conversa aberta, mas o anunciante ainda não respondeu: não pode.
    const conversation = (
      await as(app, buyer.cookie).post(`/api/ads/${adId}/conversations`).expect(201)
    ).body;
    await as(app, buyer.cookie)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ body: "Oi! Você conserta gaveta?" })
      .expect(201);
    await as(app, buyer.cookie).put(`/api/users/${sellerId}/review`).send(review).expect(403);

    await as(app, seller.cookie)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ body: "Conserto sim, passo aí hoje." })
      .expect(201);
    const saved = await as(app, buyer.cookie)
      .put(`/api/users/${sellerId}/review`)
      .send(review)
      .expect(200);
    expect(saved.body).toMatchObject({
      rating: 5,
      comment: review.comment,
      adTitle: "Pequenos reparos em móveis",
      isMine: true,
    });

    await as(app, buyer.cookie)
      .put(`/api/users/${sellerId}/review`)
      .send({ rating: 4, comment: null })
      .expect(200);
    const list = (await as(app, lurker.cookie).get(`/api/users/${sellerId}/reviews`).expect(200))
      .body;
    expect(list.summary).toEqual({ average: 4, count: 1 });
    expect(list.items[0]).toMatchObject({ rating: 4, comment: null, isMine: false });

    const detail = (await as(app, lurker.cookie).get(`/api/ads/${adId}`).expect(200)).body;
    expect(detail.seller.rating).toEqual({ average: 4, count: 1 });

    const notes = (await as(app, seller.cookie).get("/api/notifications").expect(200)).body;
    expect(JSON.stringify(notes)).toMatch(/avaliação/);
  });

  it("recusa nota fora de 1–5, autoavaliação e comentário com link", async () => {
    await as(app, buyer.cookie)
      .put(`/api/users/${sellerId}/review`)
      .send({ rating: 6, comment: null })
      .expect(400);
    await as(app, buyer.cookie)
      .put(`/api/users/${sellerId}/review`)
      .send({ rating: 5, comment: "Melhor preço em www.golpe.com" })
      .expect(400);
    await as(app, seller.cookie)
      .put(`/api/users/${sellerId}/review`)
      .send({ rating: 5, comment: null })
      .expect(400);
  });

  it("avaliações só aparecem para quem enxerga a pessoa", async () => {
    await as(app, outsider.cookie).get(`/api/users/${sellerId}/reviews`).expect(404);
    await as(app, seller.cookie).get(`/api/users/${sellerId}/reviews`).expect(200);
  });
});
