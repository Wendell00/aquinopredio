import type { INestApplication } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { Response } from "supertest";
import { DataSource, type Repository } from "typeorm";
import { AiService } from "../src/ai/ai.service";
import { Building } from "../src/buildings/building.entity";
import { MaintenanceScheduler } from "../src/buildings/maintenance/maintenance.scheduler";
import { BuildingVerificationService } from "../src/buildings/verification/building-verification.service";
import { GeoService } from "../src/geo/geo.service";
import {
  as,
  backgroundSettled,
  backgroundTracker,
  createTestApp,
  onboardedProfile,
  resetRateLimits,
  resident,
  verificationSettled,
} from "./support/app";
import { buildingInput, createFakeAi, createFakeGeo, uniqueSpot } from "./support/fakes";
import { assertIsolated, describeIsolated } from "./support/isolation";
import { armGate, armGateAfter, holdUserLock, waitBlockedBy } from "./support/sync";

const TEST_NAME = "Prédio Teste";

/**
 * P00-B5.2 — resultado atrasado da validação de prédio (spec §5.16 item 2; §5.7 por analogia).
 * Rotas e serviços reais; barreiras só no mapa falso (depois de a validação ler o prédio) e na
 * leitura do reenvio. Asserções só com o schema anterior à P00-B5.2 (status, dados, registros,
 * moradores, notificações), para rodar também antes da correção; a identidade da submissão e o
 * trigger são conferidos em `building-submissions.e2e-spec.ts`.
 *
 * Capacidade de cada validação: nome de teste → rejeita (regra forçada); IA falsa → aprova;
 * IA indisponível → revisão. O vencedor de disputas é deduzido do banco, sem supor ordem.
 */
describeIsolated("Validação de prédio atrasada (e2e, P00-B5.2)", () => {
  let app: INestApplication;
  let db: DataSource;
  const ai = createFakeAi();
  const geo = createFakeGeo();
  const cleanups: (() => unknown)[] = [];

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(GeoService).useValue(geo).overrideProvider(AiService).useValue(ai),
    );
    await assertIsolated(app);
    db = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    try {
      await backgroundSettled(app);
    } finally {
      ai.buildingValidation = "aprovar";
      geo.failing = false;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // —— Apoio ——

  /** Prende a validação do prédio nestas coordenadas depois de ela ler o prédio. */
  function holdVerification(lat: number, label = "validação antes do mapa") {
    const gate = armGate(geo, "reverse", {
      label,
      // A latitude volta do PostGIS com menos casas decimais: compara com tolerância.
      match: (atLat) => Math.abs(Number(atLat) - lat) < 1e-6,
    });
    cleanups.push(gate.restore);
    return gate;
  }

  /** Pausa a leitura inicial do reenvio (depois de ler, antes de gravar). */
  function holdResubmitRead(buildingId: string) {
    const repo = app.get<Repository<Building>>(getRepositoryToken(Building));
    const gate = armGateAfter(repo, "findOneBy", {
      label: "reenvio leu o prédio",
      match: (where) => (where as { id?: string } | undefined)?.id === buildingId,
    });
    cleanups.push(gate.restore);
    return gate;
  }

  async function admin() {
    const session = await resident(app, {}, "Equipe Plataforma");
    await db.query(`UPDATE users SET role = 'platform_admin' WHERE email = $1`, [session.email]);
    return as(app, session.cookie);
  }

  /** Dono com prédio criado pela rota real; a validação disparada fica presa se `held`. */
  async function owner(name = "Edifício Jardim das Acácias", held = true) {
    const session = await onboardedProfile(app, "Dona do Prédio");
    const api = as(app, session.cookie);
    const spot = uniqueSpot();
    const input = buildingInput({ name, lat: spot.lat, lng: spot.lng });
    const gate = held ? holdVerification(spot.lat, "validação da criação") : null;
    const created = await api.post("/api/buildings").send(input).expect(201);
    await gate?.reached();
    const [{ id: userId }] = await db.query(`SELECT id FROM users WHERE email = $1`, [
      session.email,
    ]);
    return {
      api,
      userId: userId as string,
      id: created.body.building.building.id as string,
      input,
      gate,
    };
  }

  const decide = (
    adminApi: Awaited<ReturnType<typeof admin>>,
    id: string,
    decision: string,
    reason?: string,
  ) => adminApi.post(`/api/admin/buildings/${id}/decision`).send({ decision, reason });

  const resubmit = (
    api: Awaited<ReturnType<typeof owner>>["api"],
    id: string,
    fields: Record<string, unknown>,
  ) => api.post(`/api/buildings/${id}/resubmit`).send(fields);

  /** Campos de reenvio válidos (nome real) num ponto novo do mapa. */
  function newSubmission(input: Record<string, unknown>) {
    const { unit: _unit, ...fields } = input;
    const spot = uniqueSpot();
    return { ...fields, name: "Residencial Primavera", lat: spot.lat, lng: spot.lng };
  }

  async function buildingRow(id: string) {
    const [row] = await db.query(
      `SELECT status, rejection_reason, name, resubmissions FROM buildings WHERE id = $1`,
      [id],
    );
    return row;
  }
  async function records(id: string) {
    const rows: { decided_by: string; decision: string }[] = await db.query(
      `SELECT decided_by, decision FROM building_verifications WHERE building_id = $1 ORDER BY created_at`,
      [id],
    );
    return rows.map((row) => `${row.decided_by}:${row.decision}`);
  }
  async function userRow(userId: string) {
    const [row] = await db.query(`SELECT status, primary_building_id FROM users WHERE id = $1`, [
      userId,
    ]);
    return row;
  }
  async function membership(userId: string, id: string) {
    const [row] = await db.query(
      `SELECT status, unit FROM building_memberships WHERE user_id = $1 AND building_id = $2`,
      [userId, id],
    );
    return row;
  }
  async function notices(userId: string) {
    const rows: { title: string }[] = await db.query(
      `SELECT title FROM notifications WHERE user_id = $1 AND type = 'predio_atualizado' ORDER BY created_at`,
      [userId],
    );
    return rows.map((row) => row.title);
  }
  const record = (line: string) => process.stdout.write(`[P00-B5.2] ${line}\n`);

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

  /** Prédio recusado pelo admin, com a validação da criação já concluída (revisão, sem IA). */
  async function rejectedByAdmin() {
    ai.buildingValidation = "indisponivel";
    const o = await owner(undefined, false);
    expect(await verificationSettled(app, o.id)).toMatchObject({ decision: "pendente_revisao" });
    ai.buildingValidation = "aprovar";
    const adminApi = await admin();
    await decide(adminApi, o.id, "rejeitado", "Endereço não confere").expect(204);
    await backgroundSettled(app);
    expect(await userRow(o.userId)).toMatchObject({ status: "onboarding_pendente" });
    return { ...o, adminApi };
  }

  // —— Decisão do admin com validação suspensa ——

  it("V1: admin aprova enquanto validação capaz de rejeitar está suspensa", async () => {
    const o = await owner(TEST_NAME);
    const adminApi = await admin();
    await decide(adminApi, o.id, "verificado").expect(204);
    o.gate?.release();
    const outcome = await verificationSettled(app, o.id);
    await backgroundSettled(app);

    expect(await buildingRow(o.id)).toMatchObject({ status: "verificado", rejection_reason: null });
    expect(await records(o.id)).toEqual(["admin:verificado"]);
    expect(await userRow(o.userId)).toEqual({ status: "ativo", primary_building_id: o.id });
    expect(await notices(o.userId)).toEqual(["Prédio verificado"]);
    expect(outcome).toBeNull();
  });

  it("V2: admin rejeita enquanto validação capaz de aprovar está suspensa", async () => {
    const o = await owner();
    const adminApi = await admin();
    await decide(adminApi, o.id, "rejeitado", "Endereço não confere").expect(204);
    o.gate?.release();
    const outcome = await verificationSettled(app, o.id);
    await backgroundSettled(app);

    expect(await buildingRow(o.id)).toMatchObject({
      status: "rejeitado",
      rejection_reason: "Endereço não confere",
    });
    expect(await records(o.id)).toEqual(["admin:rejeitado"]);
    expect(await userRow(o.userId)).toEqual({
      status: "onboarding_pendente",
      primary_building_id: null,
    });
    expect(await notices(o.userId)).toEqual(["Não conseguimos confirmar o prédio"]);
    expect(outcome).toBeNull();
  });

  // —— Reenvio com a validação antiga em curso ——

  async function resubmittedWhileOldHeld() {
    const o = await owner(TEST_NAME);
    const adminApi = await admin();
    await decide(adminApi, o.id, "rejeitado", "Nome inválido").expect(204);
    const fields = newSubmission(o.input);
    const newGate = holdVerification(fields.lat, "validação do reenvio");
    await resubmit(o.api, o.id, fields).expect(200);
    await newGate.reached();
    return { ...o, newGate, fields };
  }

  async function expectNewSubmissionApplied(
    o: Awaited<ReturnType<typeof resubmittedWhileOldHeld>>,
    oldOutcome: unknown,
    newOutcome: unknown,
  ) {
    await backgroundSettled(app);
    expect(await buildingRow(o.id)).toMatchObject({
      status: "verificado",
      name: "Residencial Primavera",
      resubmissions: 1,
    });
    expect(await records(o.id)).toEqual(["admin:rejeitado", "ia:verificado"]);
    expect(await userRow(o.userId)).toEqual({ status: "ativo", primary_building_id: o.id });
    expect(oldOutcome).toBeNull();
    expect(newOutcome).toMatchObject({ decision: "verificado" });
  }

  it("V3a: reenvio com dados novos — resultado antigo liberado antes do novo é descartado", async () => {
    const o = await resubmittedWhileOldHeld();
    o.gate?.release();
    const oldOutcome = await verificationSettled(app, o.id, 0);
    o.newGate.release();
    const newOutcome = await verificationSettled(app, o.id, 1);
    await expectNewSubmissionApplied(o, oldOutcome, newOutcome);
  });

  it("V3b: reenvio com dados novos — resultado antigo liberado depois do novo é descartado", async () => {
    const o = await resubmittedWhileOldHeld();
    o.newGate.release();
    const newOutcome = await verificationSettled(app, o.id, 1);
    o.gate?.release();
    const oldOutcome = await verificationSettled(app, o.id, 0);
    await expectNewSubmissionApplied(o, oldOutcome, newOutcome);
  });

  // —— Mesma submissão duas vezes ——

  it("V4a: dois reenvios concorrentes — um aplicado, o outro recusado, uma validação", async () => {
    const o = await rejectedByAdmin();
    const fields = newSubmission(o.input);
    const before = backgroundTracker(app).verifications.count(o.id);
    const gate1 = holdResubmitRead(o.id);
    const first: Promise<Response> = Promise.resolve(resubmit(o.api, o.id, fields));
    await gate1.reached();
    const gate2 = holdResubmitRead(o.id);
    const second: Promise<Response> = Promise.resolve(resubmit(o.api, o.id, fields));
    await gate2.reached();
    gate1.release();
    gate2.release();
    const statuses = [(await first).status, (await second).status];
    await backgroundSettled(app);
    record(`V4a respostas: ${statuses.join(" / ")}`);

    expect((await buildingRow(o.id)).resubmissions).toBe(1);
    expect(backgroundTracker(app).verifications.count(o.id) - before).toBe(1);
    expect(statuses.sort()).toEqual([200, 409]);
  });

  it("V4b: duas execuções da mesma submissão — exatamente uma aplica", async () => {
    const o = await owner();
    // 2ª entrega da mesma submissão pelo serviço real (simula reentrega/retentativa).
    const gate2 = holdVerification(o.input.lat, "2ª execução");
    const second = app.get(BuildingVerificationService).verify(o.id);
    await gate2.reached();
    o.gate?.release();
    gate2.release();
    const outcomes = [
      await verificationSettled(app, o.id, 0),
      await verificationSettled(app, o.id, 1),
    ];
    await second.catch(() => undefined);
    await backgroundSettled(app);
    record(`V4b resultados: ${outcomes.map((x) => (x ? x.decision : "descartado")).join(" / ")}`);

    expect(await records(o.id)).toEqual(["ia:verificado"]);
    expect(await notices(o.userId)).toEqual(["Prédio verificado"]);
    expect(outcomes.filter((x) => x === null)).toHaveLength(1);
    expect(outcomes.filter((x) => x?.decision === "verificado")).toHaveLength(1);
  });

  // —— Automática primeiro, admin depois (controle) ——

  it("V5: automática aplica e o admin decide depois (permissões atuais)", async () => {
    ai.buildingValidation = "indisponivel";
    const review = await owner(undefined, false);
    expect(await verificationSettled(app, review.id)).toMatchObject({
      decision: "pendente_revisao",
    });
    ai.buildingValidation = "aprovar";
    const adminApi = await admin();
    await decide(adminApi, review.id, "verificado").expect(204);
    expect(await records(review.id)).toEqual(["regras:pendente_revisao", "admin:verificado"]);

    const approved = await owner(undefined, false);
    expect(await verificationSettled(app, approved.id)).toMatchObject({ decision: "verificado" });
    await decide(adminApi, approved.id, "rejeitado", "Revisão posterior").expect(204);
    await backgroundSettled(app);
    expect(await buildingRow(approved.id)).toMatchObject({ status: "rejeitado" });
    expect(await records(approved.id)).toEqual(["ia:verificado", "admin:rejeitado"]);
  });

  // —— Falha intermediária ——

  it("V6a: falha no registro desfaz a validação automática e a decisão do admin", async () => {
    const o = await owner();
    await failingTrigger(
      "e2e_falha_registro_predio",
      "building_verifications",
      "INSERT",
      `NEW.building_id = '${o.id}'::uuid`,
    );
    o.gate?.release();
    await expect(verificationSettled(app, o.id)).rejects.toThrow("falha simulada");
    expect(await buildingRow(o.id)).toMatchObject({ status: "pendente_validacao" });

    const adminApi = await admin();
    await decide(adminApi, o.id, "rejeitado", "Teste").expect(500);
    await backgroundSettled(app);
    expect(await buildingRow(o.id)).toMatchObject({ status: "pendente_validacao" });
    expect(await records(o.id)).toEqual([]);
    expect(await userRow(o.userId)).toEqual({ status: "ativo", primary_building_id: o.id });
    expect(await notices(o.userId)).toEqual([]);
  });

  it("V6b: falha depois de efeitos nos moradores desfaz a rejeição inteira", async () => {
    const o = await owner(TEST_NAME);
    // Falha no 2º efeito da rejeição (prédio principal), depois de o 1º (onboarding) ser gravado.
    await failingTrigger(
      "e2e_falha_principal",
      "users",
      "UPDATE",
      `NEW.primary_building_id IS NULL AND OLD.primary_building_id = '${o.id}'::uuid`,
    );
    o.gate?.release();
    await expect(verificationSettled(app, o.id)).rejects.toThrow("falha simulada");
    expect(await buildingRow(o.id)).toMatchObject({ status: "pendente_validacao" });

    const adminApi = await admin();
    await decide(adminApi, o.id, "rejeitado", "Teste").expect(500);
    await backgroundSettled(app);
    expect(await buildingRow(o.id)).toMatchObject({ status: "pendente_validacao" });
    expect(await records(o.id)).toEqual([]);
    expect(await userRow(o.userId)).toEqual({ status: "ativo", primary_building_id: o.id });
    expect(await notices(o.userId)).toEqual([]);
  });

  it("V6c: falha no reenvio não deixa efeito parcial nem dispara validação", async () => {
    const o = await rejectedByAdmin();
    const before = {
      building: await buildingRow(o.id),
      membership: await membership(o.userId, o.id),
      user: await userRow(o.userId),
      verifications: backgroundTracker(app).verifications.count(o.id),
    };
    // Falha ao reativar o vínculo, depois de o prédio já ter sido regravado.
    await db.query(
      `UPDATE building_memberships SET status = 'recusado' WHERE user_id = $1 AND building_id = $2`,
      [o.userId, o.id],
    );
    before.membership = await membership(o.userId, o.id);
    await failingTrigger(
      "e2e_falha_reenvio",
      "building_memberships",
      "UPDATE",
      `NEW.building_id = '${o.id}'::uuid AND NEW.status = 'ativo'`,
    );

    const res = await resubmit(o.api, o.id, newSubmission(o.input));
    await backgroundSettled(app);
    expect({
      building: await buildingRow(o.id),
      membership: await membership(o.userId, o.id),
      user: await userRow(o.userId),
      verifications: backgroundTracker(app).verifications.count(o.id),
    }).toEqual(before);
    expect(res.status).toBe(500);
  });

  // —— Arquivamento e reenvio × admin ——

  it("V8: arquivamento não é desfeito por validação atrasada", async () => {
    const o = await owner(TEST_NAME);
    const adminApi = await admin();
    await decide(adminApi, o.id, "verificado").expect(204);
    // Preparação do arquivamento (RN-033): sem morador ativo e sem atividade recente.
    await db.query(`UPDATE building_memberships SET status = 'removido' WHERE building_id = $1`, [
      o.id,
    ]);
    await db.query(
      `UPDATE buildings SET last_activity_at = now() - interval '400 days' WHERE id = $1`,
      [o.id],
    );
    expect(await app.get(MaintenanceScheduler).archiveInactiveBuildings()).toBeGreaterThanOrEqual(
      1,
    );
    expect((await buildingRow(o.id)).status).toBe("arquivado");

    o.gate?.release();
    const outcome = await verificationSettled(app, o.id);
    expect((await buildingRow(o.id)).status).toBe("arquivado");
    expect(await records(o.id)).toEqual(["admin:verificado"]);
    expect(outcome).toBeNull();
  });

  it("V9: admin decide depois da leitura do reenvio — o reenvio não desfaz a decisão", async () => {
    const o = await rejectedByAdmin();
    const gate = holdResubmitRead(o.id);
    const pending: Promise<Response> = Promise.resolve(
      resubmit(o.api, o.id, newSubmission(o.input)),
    );
    await gate.reached();
    await decide(o.adminApi, o.id, "verificado").expect(204);
    gate.release();
    const res = await pending;
    await backgroundSettled(app);

    expect(await buildingRow(o.id)).toMatchObject({ status: "verificado", resubmissions: 0 });
    expect(await records(o.id)).toEqual([
      "regras:pendente_revisao",
      "admin:rejeitado",
      "admin:verificado",
    ]);
    expect(res.status).toBe(409);
  });

  it("V9b: reenvio com o lock e admin rejeitando na fila — a rejeição prevalece", async () => {
    const o = await rejectedByAdmin();
    const fields = newSubmission(o.input);
    const newGate = holdVerification(fields.lat, "validação do reenvio");
    // O reenvio fica preso ao gravar efeitos no usuário (linha travada pelo teste).
    const holder = await holdUserLock(o.userId);
    cleanups.push(holder.end);
    const resubmitted: Promise<Response> = Promise.resolve(resubmit(o.api, o.id, fields));
    await waitBlockedBy(holder.client, holder.pid, 1, "reenvio esperando o usuário");
    const rejected: Promise<Response> = Promise.resolve(
      decide(o.adminApi, o.id, "rejeitado", "Rejeição final"),
    );
    await waitBlockedBy(holder.client, holder.pid, 2, "admin na fila");
    await holder.commit();
    const statuses = [(await resubmitted).status, (await rejected).status];
    record(`V9b respostas (reenvio / admin): ${statuses.join(" / ")}`);
    newGate.release();
    const late = await verificationSettled(app, o.id, 1).catch(() => "sem execução");
    await backgroundSettled(app);

    expect(await buildingRow(o.id)).toMatchObject({
      status: "rejeitado",
      rejection_reason: "Rejeição final",
      resubmissions: 1,
    });
    expect(await userRow(o.userId)).toEqual({
      status: "onboarding_pendente",
      primary_building_id: null,
    });
    expect(await membership(o.userId, o.id)).toMatchObject({ status: "ativo" });
    expect(late).toBeNull();
    expect(statuses).toEqual([200, 204]);
  });

  // —— Fluxos normais (controle) ——

  it("V7: aprovado, recusado e em revisão continuam funcionando", async () => {
    const approved = await owner(undefined, false);
    expect(await verificationSettled(app, approved.id)).toMatchObject({ decision: "verificado" });
    expect((await buildingRow(approved.id)).status).toBe("verificado");

    const refused = await owner(TEST_NAME, false);
    expect(await verificationSettled(app, refused.id)).toMatchObject({ decision: "rejeitado" });
    expect(await userRow(refused.userId)).toMatchObject({ status: "onboarding_pendente" });

    ai.buildingValidation = "indisponivel";
    const review = await owner(undefined, false);
    expect(await verificationSettled(app, review.id)).toMatchObject({
      decision: "pendente_revisao",
      decidedBy: "regras",
    });
  });
});
