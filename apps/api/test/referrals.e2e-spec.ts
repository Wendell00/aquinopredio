import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { GeoService } from "../src/geo/geo.service";
import { StorageService } from "../src/storage/storage.service";
import { as, createTestApp, onboardedProfile, resetRateLimits, resident } from "./support/app";
import { createFakeStorage, fakeGeo, uniqueSpot } from "./support/fakes";

/** 1° de latitude ≈ 111 km. */
const metersNorth = (lat: number, meters: number) => lat + meters / 111_000;

const referral = {
  service: "Eletricista, troca chuveiro, tomadas e disjuntores",
  providerName: "Seu João",
  providerPhone: "(11) 98765-4321",
  providerConsent: true,
};

describe("Indicações de prestadores (e2e)", () => {
  let app: INestApplication;
  let db: DataSource;
  // Prédio A (quem indica), B a ~800 m (dentro de 1 km) e C a ~4 km.
  let author: Awaited<ReturnType<typeof resident>>;
  let neighbor: { cookie: string };
  let viewerB: Awaited<ReturnType<typeof resident>>;
  let viewerC: Awaited<ReturnType<typeof resident>>;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(GeoService)
        .useValue(fakeGeo)
        .overrideProvider(StorageService)
        .useValue(createFakeStorage()),
    );
    db = app.get(DataSource);
    const spot = uniqueSpot();
    author = await resident(app, { lat: spot.lat, lng: spot.lng }, "Quem Indica");
    viewerB = await resident(app, { lat: metersNorth(spot.lat, 800), lng: spot.lng }, "Vizinho B");
    viewerC = await resident(app, { lat: metersNorth(spot.lat, 4000), lng: spot.lng }, "Vizinho C");
    neighbor = await onboardedProfile(app, "Vizinha do A");
    await as(app, neighbor.cookie)
      .post(`/api/buildings/${author.buildingId}/join`)
      .send({ unit: "12" })
      .expect(200);
  });

  beforeEach(async () => {
    await resetRateLimits(app);
    await db.query(`DELETE FROM service_referrals`);
  });

  afterAll(async () => {
    await app.close();
  });

  it("morador indica um prestador e o telefone é salvo em E.164 (RN-089)", async () => {
    const created = await as(app, author.cookie).post("/api/referrals").send(referral).expect(201);
    expect(created.body).toMatchObject({
      providerName: "Seu João",
      providerPhone: "+5511987654321",
      sameBuilding: true,
      isMine: true,
      author: { name: "Quem Indica" },
    });
  });

  it("exige a autorização da pessoa indicada", async () => {
    await as(app, author.cookie)
      .post("/api/referrals")
      .send({ ...referral, providerConsent: false })
      .expect(400);
  });

  it("recusa links e o mesmo contato duas vezes no prédio", async () => {
    await as(app, author.cookie)
      .post("/api/referrals")
      .send({ ...referral, service: "Eletricista, veja em www.joao.com.br" })
      .expect(400);
    await as(app, author.cookie).post("/api/referrals").send(referral).expect(201);
    await as(app, neighbor.cookie).post("/api/referrals").send(referral).expect(409);
  });

  it("aparece no prédio e no raio de 1 km, mas não a 4 km", async () => {
    await as(app, author.cookie).post("/api/referrals").send(referral).expect(201);

    const same = await as(app, neighbor.cookie).get("/api/referrals").expect(200);
    expect(same.body.items).toHaveLength(1);
    expect(same.body.items[0]).toMatchObject({ sameBuilding: true, isMine: false });

    const near = await as(app, viewerB.cookie).get("/api/referrals").expect(200);
    expect(near.body.items).toHaveLength(1);
    expect(near.body.items[0].sameBuilding).toBe(false);

    const far = await as(app, viewerC.cookie).get("/api/referrals").expect(200);
    expect(far.body.items).toHaveLength(0);
  });

  it("busca pelo serviço ou pelo nome, sem diferenciar acento", async () => {
    await as(app, author.cookie).post("/api/referrals").send(referral).expect(201);
    const byService = await as(app, neighbor.cookie).get("/api/referrals?q=chuveiro").expect(200);
    expect(byService.body.items).toHaveLength(1);
    const byName = await as(app, neighbor.cookie).get("/api/referrals?q=joao").expect(200);
    expect(byName.body.items).toHaveLength(1);
    const none = await as(app, neighbor.cookie).get("/api/referrals?q=pintor").expect(200);
    expect(none.body.items).toHaveLength(0);
  });

  it("bloqueio esconde as indicações nos dois sentidos (RN-075)", async () => {
    const created = await as(app, author.cookie).post("/api/referrals").send(referral).expect(201);
    const [{ created_by: authorId }] = await db.query(
      `SELECT created_by FROM buildings WHERE id = $1`,
      [author.buildingId],
    );
    await as(app, viewerB.cookie).post(`/api/users/${authorId}/block`).expect(204);
    const list = await as(app, viewerB.cookie).get("/api/referrals").expect(200);
    expect(list.body.items).toHaveLength(0);
    await as(app, viewerB.cookie)
      .post("/api/reports")
      .send({ targetType: "referral", targetId: created.body.id, reason: "spam" })
      .expect(404);
    await as(app, viewerB.cookie).delete(`/api/users/${authorId}/block`).expect(204);
  });

  it("só quem indicou apaga a indicação", async () => {
    const created = await as(app, author.cookie).post("/api/referrals").send(referral).expect(201);
    await as(app, neighbor.cookie).delete(`/api/referrals/${created.body.id}`).expect(404);
    await as(app, author.cookie).delete(`/api/referrals/${created.body.id}`).expect(204);
    const list = await as(app, neighbor.cookie).get("/api/referrals").expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it("some após denúncias de 3 pessoas diferentes (RN-093)", async () => {
    const created = await as(app, author.cookie).post("/api/referrals").send(referral).expect(201);
    const id = created.body.id;
    await as(app, author.cookie)
      .post("/api/reports")
      .send({ targetType: "referral", targetId: id, reason: "spam" })
      .expect(400);
    for (const person of [neighbor, viewerB]) {
      await as(app, person.cookie)
        .post("/api/reports")
        .send({ targetType: "referral", targetId: id, reason: "golpe" })
        .expect(204);
    }
    const third = await onboardedProfile(app, "Terceira");
    await as(app, third.cookie)
      .post(`/api/buildings/${author.buildingId}/join`)
      .send({ unit: "7" })
      .expect(200);
    await as(app, third.cookie)
      .post("/api/reports")
      .send({ targetType: "referral", targetId: id, reason: "golpe" })
      .expect(204);

    const list = await as(app, neighbor.cookie).get("/api/referrals").expect(200);
    expect(list.body.items).toHaveLength(0);
    const [row] = await db.query(`SELECT status FROM service_referrals WHERE id = $1`, [id]);
    expect(row.status).toBe("oculta");
  });
});
