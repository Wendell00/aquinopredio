import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AiService } from "../src/ai/ai.service";
import { GeoService } from "../src/geo/geo.service";
import {
  as,
  backgroundSettled,
  createTestApp,
  onboardedProfile,
  resetRateLimits,
  resident,
  verificationSettled,
} from "./support/app";
import { buildingInput, createFakeAi, createFakeGeo, uniqueSpot } from "./support/fakes";
import { assertIsolated, describeIsolated } from "./support/isolation";

/**
 * P00-B5.2 — contrato da migration `1761800000000-building-submissions` e do trigger de submissão.
 * Só existe com o schema novo (não roda no baseline anterior à fatia).
 */
describeIsolated("Identidade da submissão de prédio (e2e, P00-B5.2)", () => {
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
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const submission = async (id: string): Promise<string> =>
    (await db.query(`SELECT submission_id FROM buildings WHERE id = $1`, [id]))[0].submission_id;

  async function owner() {
    const session = await onboardedProfile(app, "Dona do Prédio");
    const api = as(app, session.cookie);
    const spot = uniqueSpot();
    const input = buildingInput({ lat: spot.lat, lng: spot.lng });
    const created = await api.post("/api/buildings").send(input).expect(201);
    const [{ id: userId }] = await db.query(`SELECT id FROM users WHERE email = $1`, [
      session.email,
    ]);
    return {
      api,
      input,
      userId: userId as string,
      id: created.body.building.building.id as string,
    };
  }

  async function admin() {
    const session = await resident(app, {}, "Equipe Plataforma");
    await db.query(`UPDATE users SET role = 'platform_admin' WHERE email = $1`, [session.email]);
    return as(app, session.cookie);
  }

  /** Prédio em revisão (sem IA) e recusado pelo admin: pronto para reenvio. */
  async function rejected() {
    ai.buildingValidation = "indisponivel";
    const o = await owner();
    await verificationSettled(app, o.id);
    ai.buildingValidation = "aprovar";
    const adminApi = await admin();
    await adminApi
      .post(`/api/admin/buildings/${o.id}/decision`)
      .send({ decision: "rejeitado", reason: "Endereço não confere" })
      .expect(204);
    return { ...o, adminApi };
  }

  it("S1: decisão automática e do admin não trocam a submissão; registros guardam a julgada", async () => {
    ai.buildingValidation = "indisponivel";
    const o = await owner();
    const created = await submission(o.id);
    expect(created).toMatch(/^[0-9a-f-]{36}$/);
    await verificationSettled(app, o.id);
    expect(await submission(o.id)).toBe(created);

    const adminApi = await admin();
    await adminApi.post(`/api/admin/buildings/${o.id}/decision`).send({ decision: "verificado" });
    expect(await submission(o.id)).toBe(created);
    const records: { submission_id: string }[] = await db.query(
      `SELECT submission_id FROM building_verifications WHERE building_id = $1`,
      [o.id],
    );
    expect(records.map((row) => row.submission_id)).toEqual([created, created]);
  });

  it("S2: reenvio gera nova submissão mesmo com dados iguais", async () => {
    const o = await rejected();
    const before = await submission(o.id);
    const { unit: _unit, ...same } = o.input;
    await o.api.post(`/api/buildings/${o.id}/resubmit`).send(same).expect(200);
    expect(await submission(o.id)).not.toBe(before);
  });

  it("S3: só mudança efetiva de dado analisado troca a submissão", async () => {
    const o = await owner();
    await verificationSettled(app, o.id);
    const id = o.id;
    const check = async (sql: string, changes: boolean) => {
      const before = await submission(id);
      await db.query(sql, [id]);
      const after = await submission(id);
      return changes ? after !== before : after === before;
    };
    // Irrelevantes ou regravação do mesmo valor (inclusive nulo e mesmo ponto).
    expect(await check(`UPDATE buildings SET last_activity_at = now() WHERE id = $1`, false)).toBe(
      true,
    );
    expect(
      await check(
        `UPDATE buildings SET rejection_reason = 'x', suggested_name = 'y' WHERE id = $1`,
        false,
      ),
    ).toBe(true);
    expect(
      await check(
        `UPDATE buildings SET units_estimate = units_estimate, facade_photo_url = facade_photo_url WHERE id = $1`,
        false,
      ),
    ).toBe(true);
    expect(
      await check(`UPDATE buildings SET location = location, name = name WHERE id = $1`, false),
    ).toBe(true);
    expect(await check(`UPDATE buildings SET status = 'verificado' WHERE id = $1`, false)).toBe(
      true,
    );
    // Dados analisados de fato alterados.
    expect(await check(`UPDATE buildings SET name = name || ' II' WHERE id = $1`, true)).toBe(true);
    expect(await check(`UPDATE buildings SET units_estimate = 40 WHERE id = $1`, true)).toBe(true);
    expect(await check(`UPDATE buildings SET units_estimate = NULL WHERE id = $1`, true)).toBe(
      true,
    );
    expect(
      await check(
        `UPDATE buildings SET location = ST_SetSRID(ST_MakePoint(-46.1, -23.1), 4326)::geography WHERE id = $1`,
        true,
      ),
    ).toBe(true);
    // Volta a `pendente_validacao` vindo de outro estado.
    expect(
      await check(`UPDATE buildings SET status = 'pendente_validacao' WHERE id = $1`, true),
    ).toBe(true);
  });

  it("S4: reenvio que falha não troca submissão, contador, vínculo nem usuário", async () => {
    const o = await rejected();
    const state = async () => ({
      submission: await submission(o.id),
      building: (
        await db.query(`SELECT status, name, resubmissions FROM buildings WHERE id = $1`, [o.id])
      )[0],
      membership: (
        await db.query(
          `SELECT status FROM building_memberships WHERE user_id = $1 AND building_id = $2`,
          [o.userId, o.id],
        )
      )[0],
      user: (
        await db.query(`SELECT status, primary_building_id FROM users WHERE id = $1`, [o.userId])
      )[0],
    });
    await db.query(
      `UPDATE building_memberships SET status = 'recusado' WHERE user_id = $1 AND building_id = $2`,
      [o.userId, o.id],
    );
    await db.query(`
      CREATE OR REPLACE FUNCTION e2e_falha_reenvio_s4() RETURNS trigger AS $$
      BEGIN
        IF NEW.building_id = '${o.id}'::uuid AND NEW.status = 'ativo' THEN
          RAISE EXCEPTION 'falha simulada no teste';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await db.query(
      `CREATE TRIGGER e2e_falha_reenvio_s4 BEFORE UPDATE ON building_memberships FOR EACH ROW EXECUTE FUNCTION e2e_falha_reenvio_s4()`,
    );
    cleanups.push(async () => {
      await db.query(`DROP TRIGGER IF EXISTS e2e_falha_reenvio_s4 ON building_memberships`);
      await db.query(`DROP FUNCTION IF EXISTS e2e_falha_reenvio_s4()`);
    });
    const before = await state();
    const { unit: _unit, ...fields } = o.input;
    const res = await o.api
      .post(`/api/buildings/${o.id}/resubmit`)
      .send({ ...fields, name: "Residencial Primavera" });
    expect(await state()).toEqual(before);
    expect(res.status).toBe(500);
  });

  it("S5: down/up — prédios existentes recebem submissões distintas; registros antigos ficam nulos", async () => {
    // Existentes antes da migration: alguns prédios com registros de validação.
    const a = await owner();
    const b = await owner();
    await verificationSettled(app, a.id);
    await verificationSettled(app, b.id);
    await backgroundSettled(app);

    const last = (await db.query(`SELECT name FROM migrations ORDER BY id DESC LIMIT 1`))[0].name;
    expect(last).toBe("BuildingSubmissions1761800000000");
    await db.undoLastMigration({ transaction: "each" });
    try {
      const columns = await db.query(
        `SELECT table_name FROM information_schema.columns WHERE column_name = 'submission_id'
           AND table_name IN ('buildings', 'building_verifications')`,
      );
      expect(columns).toEqual([]);
      expect(
        (
          await db.query(
            `SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'buildings_rotate_submission'`,
          )
        )[0].n,
      ).toBe(0);
    } finally {
      // Sobe de novo mesmo se a verificação acima falhar, para não deixar o banco sem a coluna.
      await db.runMigrations({ transaction: "each" });
    }

    const rows: { id: string; submission_id: string | null }[] = await db.query(
      `SELECT id, submission_id FROM buildings`,
    );
    expect(rows.every((row) => row.submission_id !== null)).toBe(true);
    expect(new Set(rows.map((row) => row.submission_id)).size).toBe(rows.length);
    const history = await db.query(
      `SELECT count(*)::int AS n FROM building_verifications WHERE building_id = ANY($1::uuid[]) AND submission_id IS NOT NULL`,
      [[a.id, b.id]],
    );
    expect(history[0].n).toBe(0);
    expect(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'buildings_rotate_submission'`,
        )
      )[0].n,
    ).toBe(1);
  });
});
