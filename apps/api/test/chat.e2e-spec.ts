import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AdModerationService } from "../src/ads/moderation/ad-moderation.service";
import { GeoService } from "../src/geo/geo.service";
import { SettingsService } from "../src/settings/settings.service";
import { StorageService } from "../src/storage/storage.service";
import { as, createTestApp, onboardedProfile, resetRateLimits, resident } from "./support/app";
import { createFakeStorage, fakeGeo } from "./support/fakes";

describe("Chat e notificações (e2e)", () => {
  let app: INestApplication;
  let db: DataSource;
  let seller: Awaited<ReturnType<typeof resident>>;
  let buyer: { cookie: string };
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
    const [{ id: categoryId }] = await db.query(`SELECT id FROM categories WHERE slug = 'pets'`);
    seller = await resident(app, {}, "Dona do Pet");
    await db.query(`UPDATE buildings SET status = 'verificado' WHERE id = $1`, [seller.buildingId]);
    buyer = await onboardedProfile(app, "Interessado");
    await as(app, buyer.cookie)
      .post(`/api/buildings/${seller.buildingId}/join`)
      .send({ unit: "22" })
      .expect(200);
    const created = await as(app, seller.cookie)
      .post("/api/ads")
      .send({
        buildingId: seller.buildingId,
        type: "servico",
        categoryId,
        title: "Passeio com cachorros",
        description: "Passeios de 1 hora com cães de qualquer porte, no fim da tarde.",
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

  it("conversa vinculada ao anúncio, com não lidas, aviso de link e notificação (RN-080, RN-085, RN-121)", async () => {
    const buyerApi = as(app, buyer.cookie);
    const sellerApi = as(app, seller.cookie);

    const conversation = (await buyerApi.post(`/api/ads/${adId}/conversations`).expect(201)).body;
    expect(conversation).toMatchObject({
      role: "comprador",
      ad: { id: adId, active: true },
      other: { name: "Dona do Pet" },
    });
    const again = (await buyerApi.post(`/api/ads/${adId}/conversations`).expect(201)).body;
    expect(again.id).toBe(conversation.id);
    // O anunciante só vê a conversa depois da primeira mensagem.
    expect((await sellerApi.get("/api/conversations")).body).toHaveLength(0);

    await buyerApi
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ body: "Oi! Você passeia sábado?" })
      .expect(201);
    const withLink = await buyerApi
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ body: "Veja as fotos em www.meu-site.com" })
      .expect(201);
    expect(withLink.body).toMatchObject({ hasLink: true, mine: true });
    const scam = await buyerApi
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ body: "Me passa o código de verificação que chegou aí" })
      .expect(201);
    expect(scam.body.flagged).toBe(true);

    const unread = await sellerApi.get("/api/me/unread").expect(200);
    expect(unread.body.conversations).toBe(1);
    const inbox = (await sellerApi.get("/api/conversations").expect(200)).body;
    expect(inbox[0]).toMatchObject({ role: "vendedor", unread: 3, other: { name: "Interessado" } });

    const thread = (await sellerApi.get(`/api/conversations/${conversation.id}`).expect(200)).body;
    expect(thread.messages.map((m: { body: string }) => m.body)[0]).toBe(
      "Oi! Você passeia sábado?",
    );
    await sellerApi.post(`/api/conversations/${conversation.id}/read`).expect(204);
    expect((await sellerApi.get("/api/me/unread")).body.conversations).toBe(0);

    await sellerApi
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ body: "Passeio sim!" })
      .expect(201);
    const after = thread.messages.at(-1).createdAt;
    const polled = (
      await buyerApi.get(`/api/conversations/${conversation.id}?after=${encodeURIComponent(after)}`)
    ).body;
    expect(polled.messages.map((m: { body: string }) => m.body)).toEqual(["Passeio sim!"]);

    const notes = (await sellerApi.get("/api/notifications").expect(200)).body;
    expect(notes[0]).toMatchObject({ type: "nova_mensagem", url: `/conversas/${conversation.id}` });
    await sellerApi.post("/api/notifications/read").expect(204);
    expect((await sellerApi.get("/api/me/unread")).body.notifications).toBe(0);
  });

  it("só participantes acessam a conversa", async () => {
    const conversation = (await as(app, buyer.cookie).post(`/api/ads/${adId}/conversations`)).body;
    const intruder = await resident(app, {}, "Intrusa");
    await as(app, intruder.cookie).get(`/api/conversations/${conversation.id}`).expect(404);
    await as(app, intruder.cookie)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ body: "oi" })
      .expect(404);
  });

  it("bloqueio encerra a conversa (RN-082)", async () => {
    const conversation = (await as(app, buyer.cookie).post(`/api/ads/${adId}/conversations`)).body;
    const [{ user_id: sellerId }] = await db.query(
      `SELECT user_id FROM building_memberships WHERE building_id = $1 AND role = 'admin'`,
      [seller.buildingId],
    );
    await as(app, buyer.cookie).post(`/api/users/${sellerId}/block`).expect(204);
    await as(app, seller.cookie)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ body: "oi?" })
      .expect(403);
    const thread = (await as(app, seller.cookie).get(`/api/conversations/${conversation.id}`)).body;
    expect(thread.status).toBe("bloqueada");
    await as(app, buyer.cookie).delete(`/api/users/${sellerId}/block`).expect(204);
  });

  async function publishFor(
    owner: { cookie: string; buildingId: string },
    title: string,
  ): Promise<string> {
    const [{ id: categoryId }] = await db.query(`SELECT id FROM categories WHERE slug = 'pets'`);
    const res = await as(app, owner.cookie)
      .post("/api/ads")
      .send({
        buildingId: owner.buildingId,
        type: "servico",
        categoryId,
        title,
        description: `${title}: descrição longa o bastante para o anúncio de teste.`,
        priceMode: "a_combinar",
        priceCents: null,
        radiusKm: 0,
        whatsappEnabled: false,
        availability: null,
        tags: [],
        imageIds: [],
      })
      .expect(201);
    await app.get(AdModerationService).moderate(res.body.id);
    return res.body.id;
  }

  it("limita novas conversas por dia (RN-084)", async () => {
    const secondAd = await publishFor(seller, "Banho e tosa em casa");
    const settings = app.get(SettingsService);
    await settings.set("chat.newConversationsPerDay", 1);
    try {
      const newcomer = await onboardedProfile(app, "Nova Vizinha");
      const api = as(app, newcomer.cookie);
      await api.post(`/api/buildings/${seller.buildingId}/join`).send({ unit: "33" }).expect(200);
      await api.post(`/api/ads/${adId}/conversations`).expect(201);
      // Reabrir a mesma conversa não conta como nova.
      await api.post(`/api/ads/${adId}/conversations`).expect(201);
      await api.post(`/api/ads/${secondAd}/conversations`).expect(429);
    } finally {
      await settings.reset("chat.newConversationsPerDay");
    }
  });

  it("salva preferências de notificação e respeita tipos desligados (RN-122)", async () => {
    const owner = await resident(app, {}, "Anunciante Silenciosa");
    await db.query(`UPDATE buildings SET status = 'verificado' WHERE id = $1`, [owner.buildingId]);
    const ownerAd = await publishFor(owner, "Aulas de piano");
    const fan = await onboardedProfile(app, "Fã do Piano");
    await as(app, fan.cookie)
      .post(`/api/buildings/${owner.buildingId}/join`)
      .send({ unit: "5" })
      .expect(200);

    const api = as(app, owner.cookie);
    const me = await api
      .put("/api/me/notification-prefs")
      .send({ disabled: ["nova_mensagem"], quietHours: true })
      .expect(200);
    expect(me.body.notificationPrefs.disabled).toEqual(["nova_mensagem"]);
    const before = (await api.get("/api/notifications")).body.length;

    const conversation = (
      await as(app, fan.cookie).post(`/api/ads/${ownerAd}/conversations`).expect(201)
    ).body;
    await as(app, fan.cookie)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ body: "Tem horário?" })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await api.get("/api/notifications")).body.length).toBe(before);
    // A conversa continua chegando; só a notificação foi desligada.
    expect((await api.get("/api/me/unread")).body.conversations).toBe(1);
  });

  it("aceita inscrição de push só com endpoint HTTPS", async () => {
    const api = as(app, buyer.cookie);
    await api
      .post("/api/push/subscriptions")
      .send({
        endpoint: "http://inseguro.example/push",
        keys: { p256dh: "x".repeat(20), auth: "y".repeat(16) },
      })
      .expect(400);
    await api
      .post("/api/push/subscriptions")
      .send({
        endpoint: "https://push.example/abc",
        keys: { p256dh: "x".repeat(20), auth: "y".repeat(16) },
      })
      .expect(204);
    await api
      .post("/api/push/subscriptions/remove")
      .send({ endpoint: "https://push.example/abc" })
      .expect(204);
  });
});
