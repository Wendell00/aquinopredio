import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { AdsScheduler } from "../src/ads/ads.scheduler";
import { AdModerationService } from "../src/ads/moderation/ad-moderation.service";
import { StripeGateway } from "../src/billing/stripe.gateway";
import { GeoService } from "../src/geo/geo.service";
import { NotificationsService } from "../src/notifications/notifications.service";
import { SettingsService } from "../src/settings/settings.service";
import { StorageService } from "../src/storage/storage.service";
import { as, createTestApp, resetRateLimits, resident } from "./support/app";
import {
  createFakeStorage,
  createFakeStripe,
  FAKE_STRIPE_SIGNATURE,
  fakeGeo,
  uniqueSpot,
} from "./support/fakes";

/** 1° de latitude ≈ 111 km. */
const metersNorth = (lat: number, meters: number) => lat + meters / 111_000;

describe("Planos Free/Pro e assinatura (e2e)", () => {
  let app: INestApplication;
  let db: DataSource;
  let categoryId: string;
  const stripe = createFakeStripe();

  async function publish(
    owner: { cookie: string; buildingId: string },
    title: string,
    radiusKm: number,
  ): Promise<string> {
    const res = await as(app, owner.cookie)
      .post("/api/ads")
      .send({
        buildingId: owner.buildingId,
        type: "servico",
        categoryId,
        title,
        description: `${title}: descrição longa o suficiente para passar na validação.`,
        priceMode: "a_combinar",
        priceCents: null,
        radiusKm,
        whatsappEnabled: false,
        availability: null,
        tags: [],
        imageIds: [],
      });
    if (res.status !== 201) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
    await app.get(AdModerationService).moderate(res.body.id);
    return res.body.id as string;
  }

  /** Simula o Stripe: grava o estado da assinatura e manda o evento assinado. */
  function stripeSays(
    userId: string,
    status: "active" | "canceled" | "past_due",
    subscriptionId = `sub_${userId.slice(0, 8)}`,
  ) {
    stripe.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      customerId: `cus_${userId.replaceAll("-", "")}`,
      status,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      cancelAtPeriodEnd: false,
      userId,
    });
    return request(app.getHttpServer())
      .post("/api/billing/webhook")
      .set("stripe-signature", FAKE_STRIPE_SIGNATURE)
      .set("Content-Type", "application/json")
      .send(
        JSON.stringify({
          id: `evt_${Math.random().toString(36).slice(2)}`,
          type: "customer.subscription.updated",
          subscriptionId,
        }),
      );
  }

  const userIdOf = async (buildingId: string): Promise<string> =>
    (await db.query(`SELECT created_by FROM buildings WHERE id = $1`, [buildingId]))[0].created_by;

  async function verifiedResident(name: string, lat?: number, lng?: number) {
    const spot = lat !== undefined && lng !== undefined ? { lat, lng } : uniqueSpot();
    const session = await resident(app, spot, name);
    await db.query(`UPDATE buildings SET status = 'verificado' WHERE id = $1`, [
      session.buildingId,
    ]);
    return { ...session, userId: await userIdOf(session.buildingId), ...spot };
  }

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(GeoService)
        .useValue(fakeGeo)
        .overrideProvider(StorageService)
        .useValue(createFakeStorage())
        .overrideProvider(StripeGateway)
        .useValue(stripe.gateway),
    );
    db = app.get(DataSource);
    [{ id: categoryId }] = await db.query(`SELECT id FROM categories WHERE slug = 'outros'`);
  });

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("Free alcança até 1 km e o checkout leva ao Stripe (RN-140, RN-141)", async () => {
    const owner = await verifiedResident("Free");
    const api = as(app, owner.cookie);

    const status = (await api.get("/api/billing").expect(200)).body;
    expect(status).toMatchObject({
      plan: "free",
      checkoutEnabled: true,
      proPriceCents: 5000,
      limits: {
        free: { maxRadiusKm: 1, featuredAds: 0 },
        pro: { maxRadiusKm: 10, featuredAds: 1 },
      },
    });

    const far = await api.post("/api/ads").send({
      buildingId: owner.buildingId,
      type: "servico",
      categoryId,
      title: "Aulas de piano",
      description: "Aulas de piano para todas as idades, no seu apartamento.",
      priceMode: "a_combinar",
      priceCents: null,
      radiusKm: 2,
      whatsappEnabled: false,
      availability: null,
      tags: [],
      imageIds: [],
    });
    expect(far.status).toBe(403);
    expect(far.body.message).toMatch(/Pro/);

    const featureFree = await publish(owner, "Conserto de bicicleta", 1);
    await api.post(`/api/ads/${featureFree}/feature`).expect(403);

    const checkout = await api.post("/api/billing/checkout").expect(201);
    expect(checkout.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
  });

  it("recusa webhook sem assinatura válida", async () => {
    await request(app.getHttpServer())
      .post("/api/billing/webhook")
      .set("stripe-signature", "falsa")
      .set("Content-Type", "application/json")
      .send(
        JSON.stringify({
          id: "evt_x",
          type: "customer.subscription.updated",
          subscriptionId: "sub_x",
        }),
      )
      .expect(400);
  });

  it("Pro: raio de 10 km, destaque no topo do feed e anúncio sem prazo (RN-142 a RN-144)", async () => {
    const seller = await verifiedResident("Profissional");
    const viewer = await verifiedResident(
      "Vizinho a 6 km",
      metersNorth(seller.lat, 6000),
      seller.lng,
    );
    await as(app, seller.cookie).post("/api/billing/checkout").expect(201);
    await stripeSays(seller.userId, "active").expect(200);

    const me = (await as(app, seller.cookie).get("/api/me").expect(200)).body;
    expect(me.plan).toBe("pro");
    const options = (await as(app, seller.cookie).get("/api/ads/form-options").expect(200)).body;
    expect(options.buildings[0].allowedRadiiKm).toContain(10);

    const first = await publish(seller, "Eletricista residencial", 10);
    const second = await publish(seller, "Instalação de chuveiro", 10);
    const other = await publish(viewer, "Bolo caseiro de cenoura", 0);

    let mine = (await as(app, seller.cookie).post(`/api/ads/${first}/feature`).expect(200)).body;
    expect(mine).toMatchObject({ featured: true, expiresAt: null });
    // Limite de 1 destaque: destacar outro tira o destaque do primeiro.
    await as(app, seller.cookie).post(`/api/ads/${second}/feature`).expect(200);
    mine = (await as(app, seller.cookie).get(`/api/ads/mine/${first}`).expect(200)).body;
    expect(mine.featured).toBe(false);

    const feed = (await as(app, viewer.cookie).get("/api/feed").expect(200)).body.items as {
      id: string;
      featured: boolean;
    }[];
    // O destaque fica acima até do anúncio do próprio prédio de quem vê.
    expect(feed[0]).toMatchObject({ id: second, featured: true });
    expect(feed.map((item) => item.id)).toEqual(expect.arrayContaining([first, other]));

    // Anúncio do Pro não expira, mesmo com a data vencida.
    await db.query(`UPDATE ads SET expires_at = now() - interval '1 day' WHERE id = $1`, [first]);
    const scheduler = new AdsScheduler(db, app.get(NotificationsService), app.get(SettingsService));
    await scheduler.expireAds();
    const [{ status }] = await db.query(`SELECT status FROM ads WHERE id = $1`, [first]);
    expect(status).toBe("ativo");
  });

  it("ao voltar para o Free, raio é reduzido, destaque sai e o prazo recomeça (RN-145)", async () => {
    const seller = await verifiedResident("Ex-Pro");
    await as(app, seller.cookie).post("/api/billing/checkout").expect(201);
    await stripeSays(seller.userId, "active").expect(200);
    const adId = await publish(seller, "Passeio com cachorros", 10);
    await as(app, seller.cookie).post(`/api/ads/${adId}/feature`).expect(200);

    // Pagamento atrasado ainda é Pro (o Stripe está tentando cobrar).
    await stripeSays(seller.userId, "past_due").expect(200);
    expect((await as(app, seller.cookie).get("/api/me")).body.plan).toBe("pro");

    await stripeSays(seller.userId, "canceled").expect(200);
    expect((await as(app, seller.cookie).get("/api/me")).body.plan).toBe("free");
    const ad = (await as(app, seller.cookie).get(`/api/ads/mine/${adId}`).expect(200)).body;
    expect(ad).toMatchObject({ radiusKm: 1, featured: false, status: "ativo" });
    expect(new Date(ad.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);

    const notes = (await as(app, seller.cookie).get("/api/notifications").expect(200)).body;
    expect(JSON.stringify(notes)).toMatch(/plano Free/);
  });

  it("assinatura antiga cancelada não derruba a nova que está ativa", async () => {
    const seller = await verifiedResident("Duas assinaturas");
    await as(app, seller.cookie).post("/api/billing/checkout").expect(201);
    await stripeSays(seller.userId, "active", "sub_nova").expect(200);
    await stripeSays(seller.userId, "canceled", "sub_velha").expect(200);
    expect((await as(app, seller.cookie).get("/api/me")).body.plan).toBe("pro");
  });

  it("excluir a conta cancela a assinatura no Stripe (RN-008)", async () => {
    const seller = await verifiedResident("Vai embora");
    await as(app, seller.cookie).post("/api/billing/checkout").expect(201);
    const subscriptionId = `sub_${seller.userId.slice(0, 8)}`;
    await stripeSays(seller.userId, "active", subscriptionId).expect(200);

    await as(app, seller.cookie).delete("/api/me").send({ confirm: "EXCLUIR" }).expect(204);
    expect(stripe.subscriptions.get(subscriptionId)?.status).toBe("canceled");
  });
});
