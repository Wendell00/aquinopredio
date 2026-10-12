import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { BuildingVerificationService } from "../src/buildings/verification/building-verification.service";
import { GeoService } from "../src/geo/geo.service";
import { as, createTestApp, onboardedProfile, resetRateLimits } from "./support/app";
import { buildingInput, fakeGeo } from "./support/fakes";

describe("Prédios e onboarding (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(GeoService).useValue(fakeGeo));
  });

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("bloqueia o app até ter prédio, e libera ao criar um (RN-005, RN-031)", async () => {
    const { cookie } = await onboardedProfile(app);
    const api = as(app, cookie);

    const before = await api.get("/api/me").expect(200);
    expect(before.body.onboardingStep).toBe("predio");

    const created = await api.post("/api/buildings").send(buildingInput()).expect(201);
    expect(created.body.result).toBe("created");
    expect(created.body.building).toMatchObject({
      role: "admin",
      status: "ativo",
      isPrimary: true,
      unit: "Apto 42",
    });
    expect(created.body.building.building.status).toBe("pendente_validacao");

    const after = await api.get("/api/me").expect(200);
    expect(after.body).toMatchObject({ status: "ativo", onboardingStep: "concluido" });
  });

  it("aponta duplicidade por proximidade e por CEP + número (RN-025)", async () => {
    const owner = await onboardedProfile(app);
    const input = buildingInput();
    await as(app, owner.cookie).post("/api/buildings").send(input).expect(201);

    const other = await onboardedProfile(app);
    const nearby = await as(app, other.cookie)
      .post("/api/buildings")
      .send({ ...input, name: "Outro Nome", lat: input.lat + 0.0003, number: "1" })
      .expect(201);
    expect(nearby.body.result).toBe("duplicates");
    expect(nearby.body.candidates[0].name).toBe(input.name);
    expect(nearby.body.candidates[0]).not.toHaveProperty("number");

    const sameAddress = await as(app, other.cookie)
      .post("/api/buildings/duplicates")
      .send({ cep: input.cep, number: input.number, lat: input.lat + 0.5, lng: input.lng })
      .expect(200);
    expect(sameAddress.body).toHaveLength(1);
  });

  it("busca prédios válidos (não recusados) e permite entrar com a unidade (RN-021, RN-037)", async () => {
    const owner = await onboardedProfile(app);
    const input = buildingInput({ name: "Condomínio Bela Vista do Parque" });
    const created = await as(app, owner.cookie).post("/api/buildings").send(input).expect(201);
    const buildingId = created.body.building.building.id;

    const resident = await onboardedProfile(app);
    const api = as(app, resident.cookie);
    // Recém-cadastrado (na fila de validação) já aparece; recusado não (RN-021).
    const pending = await api.get(`/api/buildings/search?cep=${input.cep}`).expect(200);
    expect(pending.body.map((b: { id: string }) => b.id)).toContain(buildingId);
    await app
      .get(DataSource)
      .query(`UPDATE buildings SET status = 'rejeitado' WHERE id = $1`, [buildingId]);
    const rejected = await api.get(`/api/buildings/search?cep=${input.cep}`).expect(200);
    expect(rejected.body).toHaveLength(0);

    await app
      .get(DataSource)
      .query(`UPDATE buildings SET status = 'verificado' WHERE id = $1`, [buildingId]);
    const found = await api
      .get(`/api/buildings/search?q=${encodeURIComponent("bela vista parque")}`)
      .expect(200);
    expect(found.body.map((b: { id: string }) => b.id)).toContain(buildingId);

    const near = await api
      .get(`/api/buildings/search?lat=${input.lat}&lng=${input.lng}`)
      .expect(200);
    expect(near.body[0]).toMatchObject({ id: buildingId, distanceM: 0, residents: 1 });

    const joined = await api
      .post(`/api/buildings/${buildingId}/join`)
      .send({ unit: "Casa 7" })
      .expect(200);
    expect(joined.body).toMatchObject({ status: "ativo", role: "morador", isPrimary: true });
    await api.post(`/api/buildings/${buildingId}/join`).send({ unit: "Casa 7" }).expect(409);
    expect((await api.get("/api/me")).body.onboardingStep).toBe("concluido");
  });

  it("vínculo fica pendente quando o prédio exige aprovação", async () => {
    const owner = await onboardedProfile(app);
    const created = await as(app, owner.cookie)
      .post("/api/buildings")
      .send(buildingInput())
      .expect(201);
    const buildingId = created.body.building.building.id;
    await app
      .get(DataSource)
      .query(
        `UPDATE buildings SET status = 'verificado', join_policy = 'aprovacao_admin' WHERE id = $1`,
        [buildingId],
      );

    const resident = await onboardedProfile(app);
    const joined = await as(app, resident.cookie)
      .post(`/api/buildings/${buildingId}/join`)
      .send({ unit: "12" });
    expect(joined.body.status).toBe("pendente");
  });

  it("limita prédios criados em 30 dias (RN-030)", async () => {
    const { cookie } = await onboardedProfile(app);
    const api = as(app, cookie);
    await api.post("/api/buildings").send(buildingInput()).expect(201);
    await api.post("/api/buildings").send(buildingInput()).expect(201);
    const third = await api.post("/api/buildings").send(buildingInput());
    expect(third.status).toBe(403);
  });

  it("valida o prédio: sem IA vai para revisão manual (RN-113)", async () => {
    const { cookie } = await onboardedProfile(app);
    const created = await as(app, cookie).post("/api/buildings").send(buildingInput()).expect(201);
    const outcome = await app
      .get(BuildingVerificationService)
      .verify(created.body.building.building.id);
    expect(outcome).toMatchObject({ decision: "pendente_revisao", decidedBy: "regras" });
  });

  it("rejeita nome de teste e devolve o usuário ao onboarding; permite 1 reenvio (RN-029)", async () => {
    const { cookie } = await onboardedProfile(app);
    const api = as(app, cookie);
    const input = buildingInput({ name: "Prédio Teste" });
    const created = await api.post("/api/buildings").send(input).expect(201);
    const buildingId = created.body.building.building.id;

    const outcome = await app.get(BuildingVerificationService).verify(buildingId);
    expect(outcome?.decision).toBe("rejeitado");

    const me = await api.get("/api/me").expect(200);
    expect(me.body.onboardingStep).toBe("predio");
    const [mine] = (await api.get("/api/me/buildings").expect(200)).body;
    expect(mine.building).toMatchObject({ status: "rejeitado", canResubmit: true });
    expect(mine.building.rejectionReason).toMatch(/teste/);

    const { unit: _unit, ...fields } = input;
    const resubmitted = await api
      .post(`/api/buildings/${buildingId}/resubmit`)
      .send({ ...fields, name: "Edifício Primavera" })
      .expect(200);
    expect(resubmitted.body.building).toMatchObject({
      status: "pendente_validacao",
      canResubmit: false,
    });
    expect((await api.get("/api/me")).body.onboardingStep).toBe("concluido");
  });

  it("não expõe a unidade de outros moradores na busca (RN-007)", async () => {
    const owner = await onboardedProfile(app);
    const input = buildingInput();
    const created = await as(app, owner.cookie).post("/api/buildings").send(input).expect(201);
    await app
      .get(DataSource)
      .query(`UPDATE buildings SET status = 'verificado' WHERE id = $1`, [
        created.body.building.building.id,
      ]);
    const other = await onboardedProfile(app);
    const res = await as(app, other.cookie)
      .get(`/api/buildings/search?cep=${input.cep}`)
      .expect(200);
    expect(JSON.stringify(res.body)).not.toContain("Apto 42");
  });
});
