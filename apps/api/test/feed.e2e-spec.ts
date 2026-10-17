import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AdModerationService } from "../src/ads/moderation/ad-moderation.service";
import { GeoService } from "../src/geo/geo.service";
import { StorageService } from "../src/storage/storage.service";
import { as, createTestApp, onboardedProfile, resetRateLimits, resident } from "./support/app";
import { createFakeStorage, fakeGeo, uniqueSpot } from "./support/fakes";

/** 1° de latitude ≈ 111 km. */
const metersNorth = (lat: number, meters: number) => lat + meters / 111_000;

describe("Feed, detalhe e interações (e2e)", () => {
  let app: INestApplication;
  let db: DataSource;
  let categoryId: string;
  let violaoCategoryId: string;

  // Prédio A (vendedor), B a ~800 m e C a ~4 km.
  let seller: Awaited<ReturnType<typeof resident>>;
  let neighborA: { cookie: string };
  let viewerB: Awaited<ReturnType<typeof resident>>;
  let viewerC: Awaited<ReturnType<typeof resident>>;
  const ads: Record<string, string> = {};

  async function joinBuilding(buildingId: string, name: string) {
    const session = await onboardedProfile(app, name);
    await as(app, session.cookie)
      .post(`/api/buildings/${buildingId}/join`)
      .send({ unit: "101" })
      .expect(200);
    return session;
  }

  async function publish(cookie: string, buildingId: string, overrides: Record<string, unknown>) {
    const res = await as(app, cookie)
      .post("/api/ads")
      .send({
        buildingId,
        type: "servico",
        categoryId,
        title: "Anúncio de teste",
        description: "Descrição suficientemente longa para o anúncio de teste.",
        priceMode: "a_combinar",
        priceCents: null,
        radiusKm: 0,
        whatsappEnabled: false,
        availability: null,
        tags: [],
        imageIds: [],
        ...overrides,
      });
    if (res.status !== 201) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
    await app.get(AdModerationService).moderate(res.body.id);
    return res.body.id as string;
  }

  const feedIds = async (cookie: string, query = "") =>
    (
      (await as(app, cookie).get(`/api/feed${query}`).expect(200)).body.items as { id: string }[]
    ).map((item) => item.id);

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(GeoService)
        .useValue(fakeGeo)
        .overrideProvider(StorageService)
        .useValue(createFakeStorage()),
    );
    db = app.get(DataSource);
    [{ id: categoryId }] = await db.query(
      `SELECT id FROM categories WHERE slug = 'reparos-manutencao'`,
    );
    [{ id: violaoCategoryId }] = await db.query(
      `SELECT id FROM categories WHERE slug = 'aulas-educacao'`,
    );

    const spot = uniqueSpot();
    seller = await resident(app, { lat: spot.lat, lng: spot.lng }, "Vendedora");
    viewerB = await resident(app, { lat: metersNorth(spot.lat, 800), lng: spot.lng }, "Vizinho B");
    viewerC = await resident(app, { lat: metersNorth(spot.lat, 4000), lng: spot.lng }, "Vizinho C");
    await db.query(`UPDATE buildings SET status = 'verificado' WHERE id = ANY($1)`, [
      [seller.buildingId, viewerB.buildingId, viewerC.buildingId],
    ]);
    await db.query(`UPDATE building_memberships SET verified_at = now() WHERE building_id = $1`, [
      seller.buildingId,
    ]);
    neighborA = await joinBuilding(seller.buildingId, "Vizinha do A");

    await as(app, seller.cookie).patch("/api/me").send({ phone: "(11) 91234-5678" }).expect(200);
    ads.onlyBuilding = await publish(seller.cookie, seller.buildingId, {
      title: "Conserto de chuveiro",
      radiusKm: 0,
    });
    ads.oneKm = await publish(seller.cookie, seller.buildingId, {
      title: "Aulas de violão para iniciantes",
      categoryId: violaoCategoryId,
      radiusKm: 1,
      whatsappEnabled: true,
    });
    ads.fiveKm = await publish(seller.cookie, seller.buildingId, {
      title: "Bolo de pote caseiro",
      type: "produto",
      priceMode: "fixo",
      priceCents: 1000,
      radiusKm: 5,
    });
  });

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("aplica o raio de cada anúncio a partir do prédio de origem (RN-057, RN-058)", async () => {
    expect(new Set(await feedIds(neighborA.cookie))).toEqual(
      new Set([ads.onlyBuilding, ads.oneKm, ads.fiveKm]),
    );
    expect(new Set(await feedIds(viewerB.cookie))).toEqual(new Set([ads.oneKm, ads.fiveKm]));
    expect(await feedIds(viewerC.cookie)).toEqual([ads.fiveKm]);
  });

  it("mostra os próprios anúncios no feed, marcados como do leitor (RN-074)", async () => {
    const { body } = await as(app, seller.cookie).get("/api/feed").expect(200);
    expect(new Set(body.items.map((item: { id: string }) => item.id))).toEqual(
      new Set([ads.onlyBuilding, ads.oneKm, ads.fiveKm]),
    );
    expect(body.items.every((item: { isMine: boolean }) => item.isMine)).toBe(true);

    const other = (await as(app, neighborA.cookie).get("/api/feed").expect(200)).body.items;
    expect(other.some((item: { isMine: boolean }) => item.isMine)).toBe(false);
  });

  it("mostra prédio e distância aproximada, nunca o endereço (RN-034, RN-073)", async () => {
    const { body } = await as(app, viewerB.cookie).get("/api/feed").expect(200);
    const card = body.items.find((item: { id: string }) => item.id === ads.oneKm);
    expect(card).toMatchObject({
      sameBuilding: false,
      sellerVerified: true,
      buildingName: "Edifício Jardim das Acácias",
    });
    expect(card.distanceM % 50).toBe(0);
    expect(card.distanceM).toBeGreaterThan(700);
    expect(JSON.stringify(body)).not.toMatch(/Rua das Flores/);

    const own = (await as(app, neighborA.cookie).get("/api/feed").expect(200)).body.items[0];
    expect(own).toMatchObject({ sameBuilding: true, distanceM: null });
  });

  it("filtra por tipo, categoria, distância, preço e busca (RN-072)", async () => {
    const api = neighborA.cookie;
    expect(await feedIds(api, "?type=produto")).toEqual([ads.fiveKm]);
    expect(await feedIds(api, `?categoryId=${violaoCategoryId}`)).toEqual([ads.oneKm]);
    expect(await feedIds(api, "?q=violao")).toEqual([ads.oneKm]);
    expect(await feedIds(api, "?q=bolos")).toEqual([ads.fiveKm]);
    expect(await feedIds(api, "?priceMin=500&priceMax=1500")).toEqual([ads.fiveKm]);
    expect(new Set(await feedIds(viewerB.cookie, "?distanceKm=0"))).toEqual(new Set());
    expect(await feedIds(viewerC.cookie, "?distanceKm=1")).toEqual([]);
  });

  it("detalhe só para quem pode ver o anúncio, com dados públicos do anunciante (RN-130)", async () => {
    const detail = await as(app, viewerB.cookie).get(`/api/ads/${ads.oneKm}`).expect(200);
    expect(detail.body.seller).toMatchObject({ name: "Vendedora", verified: true });
    expect(JSON.stringify(detail.body)).not.toMatch(/91234|101|@teste\.dev/);
    await as(app, viewerC.cookie).get(`/api/ads/${ads.onlyBuilding}`).expect(404);
    const owner = await as(app, seller.cookie).get(`/api/ads/${ads.onlyBuilding}`).expect(200);
    expect(owner.body.isOwner).toBe(true);
  });

  it("gera link do WhatsApp sem expor o número no anúncio (RN-081)", async () => {
    const link = await as(app, viewerB.cookie).get(`/api/ads/${ads.oneKm}/whatsapp`).expect(200);
    expect(link.body.url).toMatch(/^https:\/\/wa\.me\/5511912345678\?text=/);
    await as(app, viewerB.cookie).get(`/api/ads/${ads.fiveKm}/whatsapp`).expect(404);
  });

  it("favorita só o que pode ver e lista os favoritos (RN-083)", async () => {
    const api = as(app, viewerC.cookie);
    await api.put(`/api/ads/${ads.fiveKm}/favorite`).expect(204);
    await api.put(`/api/ads/${ads.onlyBuilding}/favorite`).expect(404);
    const favorites = await api.get("/api/me/favorites").expect(200);
    expect(favorites.body.map((ad: { id: string }) => ad.id)).toEqual([ads.fiveKm]);
    expect((await api.get("/api/feed")).body.items[0].favorited).toBe(true);
    await api.delete(`/api/ads/${ads.fiveKm}/favorite`).expect(204);
    expect((await api.get("/api/me/favorites")).body).toEqual([]);
  });

  it("bloqueio oculta anúncios nos dois sentidos (RN-075, RN-082)", async () => {
    const [{ user_id: sellerId }] = await db.query(
      `SELECT created_by AS user_id FROM buildings WHERE id = $1`,
      [seller.buildingId],
    );
    await as(app, viewerB.cookie).post(`/api/users/${sellerId}/block`).expect(204);
    expect(await feedIds(viewerB.cookie)).toEqual([]);
    await as(app, viewerB.cookie).get(`/api/ads/${ads.oneKm}`).expect(404);
    const blocks = await as(app, viewerB.cookie).get("/api/me/blocks").expect(200);
    expect(blocks.body[0]).toMatchObject({ id: sellerId, name: "Vendedora" });
    await as(app, viewerB.cookie).delete(`/api/users/${sellerId}/block`).expect(204);
    expect((await feedIds(viewerB.cookie)).length).toBe(2);
  });

  it("3 denúncias de pessoas diferentes tiram o anúncio do ar (RN-092, RN-093)", async () => {
    const target = await publish(seller.cookie, seller.buildingId, {
      title: "Anúncio suspeito",
      radiusKm: 5,
    });
    const report = { targetType: "ad", targetId: target, reason: "golpe" };
    await as(app, viewerB.cookie).post("/api/reports").send(report).expect(204);
    await as(app, viewerB.cookie).post("/api/reports").send(report).expect(409);
    await as(app, viewerC.cookie).post("/api/reports").send(report).expect(204);
    expect(await feedIds(neighborA.cookie)).toContain(target);
    await as(app, neighborA.cookie).post("/api/reports").send(report).expect(204);
    expect(await feedIds(neighborA.cookie)).not.toContain(target);
    const mine = await as(app, seller.cookie).get(`/api/ads/mine/${target}`).expect(200);
    expect(mine.body.status).toBe("em_moderacao");
    await as(app, seller.cookie)
      .post("/api/reports")
      .send({ ...report, targetId: ads.oneKm })
      .expect(400);
  });

  it("ordena: primeiro o próprio prédio, depois por distância e data (RN-071)", async () => {
    const neighborBuildingAd = await publish(viewerB.cookie, viewerB.buildingId, {
      title: "Passeio com cães",
      radiusKm: 1,
    });
    expect((await feedIds(viewerB.cookie))[0]).toBe(neighborBuildingAd);
    const anotherInB = await joinBuilding(viewerB.buildingId, "Outro do B");
    const fromB = await feedIds(anotherInB.cookie);
    expect(fromB[0]).toBe(neighborBuildingAd);
  });

  it("raio 0 não vaza para outro prédio no mesmo ponto (RN-057)", async () => {
    const spot = uniqueSpot();
    const first = await resident(app, { lat: spot.lat, lng: spot.lng }, "Prédio Um");
    const second = await resident(
      app,
      { lat: spot.lat, lng: spot.lng, cep: "09999000", number: "1", ignoreDuplicates: true },
      "Prédio Dois",
    );
    await db.query(`UPDATE buildings SET status = 'verificado' WHERE id = ANY($1)`, [
      [first.buildingId, second.buildingId],
    ]);
    const onlyMine = await publish(first.cookie, first.buildingId, {
      title: "Só para o prédio um",
      radiusKm: 0,
    });
    expect(await feedIds(second.cookie)).not.toContain(onlyMine);
    await as(app, second.cookie).get(`/api/ads/${onlyMine}`).expect(404);
  });
});
