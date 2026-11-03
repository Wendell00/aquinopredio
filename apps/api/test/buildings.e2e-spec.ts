import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { GeoService } from "../src/geo/geo.service";
import {
  as,
  backgroundSettled,
  createTestApp,
  onboardedProfile,
  resetRateLimits,
  verificationSettled,
} from "./support/app";
import { buildingInput, createFakeGeo } from "./support/fakes";
import { armGate } from "./support/sync";

/**
 * A validação de prédio roda em segundo plano (fire-and-forget) e, sem IA (chave vazia nos e2e),
 * termina em `pendente_revisao` (RN-113). Os testes esperam a validação **disparada pelo fluxo**
 * (`verificationSettled`), sem chamar `verify` de novo, e observam o estado pendente prendendo
 * o mapa falso numa barreira (antes de qualquer transação). P00-B5.1.
 */
describe("Prédios e onboarding (e2e)", () => {
  let app: INestApplication;
  const geo = createFakeGeo();
  const cleanups: (() => unknown)[] = [];

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(GeoService).useValue(geo));
  });

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterEach(async () => {
    // Libera barreiras e espera validações/notificações deste teste, mesmo se uma asserção falhou;
    // só depois devolve o mapa falso ao normal.
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    try {
      await backgroundSettled(app);
    } finally {
      geo.failing = false;
    }
  });

  /** Prende a validação do prédio nestas coordenadas antes da consulta ao mapa. */
  function holdVerification(lat: number) {
    const gate = armGate(geo, "reverse", {
      label: "validação do prédio antes do mapa",
      // A latitude volta do PostGIS com menos casas decimais: compara com tolerância.
      match: (atLat) => Math.abs(Number(atLat) - lat) < 1e-6,
    });
    cleanups.push(gate.restore);
    return gate;
  }

  const buildingRow = async (id: string) =>
    (
      await app
        .get(DataSource)
        .query(`SELECT status, rejection_reason FROM buildings WHERE id = $1`, [id])
    )[0];
  const verificationRows = (id: string) =>
    app
      .get(DataSource)
      .query(
        `SELECT decision, decided_by FROM building_verifications WHERE building_id = $1 ORDER BY created_at`,
        [id],
      );

  afterAll(async () => {
    await app.close();
  });

  it("bloqueia o app até ter prédio, e libera ao criar um (RN-005, RN-031)", async () => {
    const { cookie } = await onboardedProfile(app);
    const api = as(app, cookie);

    const before = await api.get("/api/me").expect(200);
    expect(before.body.onboardingStep).toBe("predio");

    const input = buildingInput();
    const gate = holdVerification(input.lat);
    const created = await api.post("/api/buildings").send(input).expect(201);
    // A validação disparada pelo fluxo começou e está presa antes de decidir.
    await gate.reached();
    expect(created.body.result).toBe("created");
    expect(created.body.building).toMatchObject({
      status: "ativo",
      isPrimary: true,
      unit: "Apto 42",
    });
    expect(created.body.building.building.status).toBe("pendente_validacao");

    const after = await api.get("/api/me").expect(200);
    expect(after.body).toMatchObject({ status: "ativo", onboardingStep: "concluido" });

    gate.release();
    const id = created.body.building.building.id;
    expect(await verificationSettled(app, id)).toMatchObject({ decision: "pendente_revisao" });
    expect((await buildingRow(id)).status).toBe("pendente_revisao");
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
    const gate = holdVerification(input.lat);
    const created = await as(app, owner.cookie).post("/api/buildings").send(input).expect(201);
    const buildingId = created.body.building.building.id;
    await gate.reached();

    const resident = await onboardedProfile(app);
    const api = as(app, resident.cookie);
    // Recém-cadastrado (na fila de validação) já aparece; recusado não (RN-021).
    const pending = await api.get(`/api/buildings/search?cep=${input.cep}`).expect(200);
    expect(pending.body.map((b: { id: string }) => b.id)).toContain(buildingId);
    // Os estados abaixo são só preparação da busca: a validação real termina antes.
    gate.release();
    await verificationSettled(app, buildingId);
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
    expect(joined.body).toMatchObject({ status: "ativo", isPrimary: true });
    await api.post(`/api/buildings/${buildingId}/join`).send({ unit: "Casa 7" }).expect(409);
    expect((await api.get("/api/me")).body.onboardingStep).toBe("concluido");
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
    const id = created.body.building.building.id;
    const outcome = await verificationSettled(app, id);
    expect(outcome).toMatchObject({ decision: "pendente_revisao", decidedBy: "regras" });
    expect((await buildingRow(id)).status).toBe("pendente_revisao");
    expect(await verificationRows(id)).toEqual([
      { decision: "pendente_revisao", decided_by: "regras" },
    ]);
  });

  it("valida o prédio: mapa e IA fora do ar não aprovam (RN-113, RN-BLD-008)", async () => {
    geo.failing = true;
    const { cookie } = await onboardedProfile(app);
    const created = await as(app, cookie).post("/api/buildings").send(buildingInput()).expect(201);
    const id = created.body.building.building.id;
    expect(await verificationSettled(app, id)).toMatchObject({
      decision: "pendente_revisao",
      decidedBy: "regras",
    });
    expect((await buildingRow(id)).status).toBe("pendente_revisao");
  });

  it("rejeita nome de teste e devolve o usuário ao onboarding; permite 1 reenvio (RN-029)", async () => {
    const { cookie } = await onboardedProfile(app);
    const api = as(app, cookie);
    const input = buildingInput({ name: "Prédio Teste" });
    const created = await api.post("/api/buildings").send(input).expect(201);
    const buildingId = created.body.building.building.id;

    const outcome = await verificationSettled(app, buildingId);
    expect(outcome?.decision).toBe("rejeitado");

    const me = await api.get("/api/me").expect(200);
    expect(me.body.onboardingStep).toBe("predio");
    const [mine] = (await api.get("/api/me/buildings").expect(200)).body;
    expect(mine.building).toMatchObject({ status: "rejeitado", canResubmit: true });
    expect(mine.building.rejectionReason).toMatch(/teste/);

    const { unit: _unit, ...fields } = input;
    const gate = holdVerification(input.lat);
    const resubmitted = await api
      .post(`/api/buildings/${buildingId}/resubmit`)
      .send({ ...fields, name: "Edifício Primavera" })
      .expect(200);
    await gate.reached();
    expect(resubmitted.body.building).toMatchObject({
      status: "pendente_validacao",
      canResubmit: false,
    });
    expect((await api.get("/api/me")).body.onboardingStep).toBe("concluido");

    // A 2ª validação (do reenvio) é a disparada pelo fluxo; sem IA vai para revisão.
    gate.release();
    expect(await verificationSettled(app, buildingId, 1)).toMatchObject({
      decision: "pendente_revisao",
    });
  });

  it("não expõe a unidade de outros moradores na busca (RN-007)", async () => {
    const owner = await onboardedProfile(app);
    const input = buildingInput();
    const created = await as(app, owner.cookie).post("/api/buildings").send(input).expect(201);
    // Preparação da busca: a validação real termina antes de o status ser fixado.
    await verificationSettled(app, created.body.building.building.id);
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
