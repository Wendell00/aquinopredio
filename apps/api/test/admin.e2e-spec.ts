import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { AdModerationService } from "../src/ads/moderation/ad-moderation.service";
import { GeoService } from "../src/geo/geo.service";
import { SettingsService } from "../src/settings/settings.service";
import { StorageService } from "../src/storage/storage.service";
import {
  as,
  createTestApp,
  ORIGIN,
  onboardedProfile,
  resetRateLimits,
  resident,
  signUpAndLogin,
} from "./support/app";
import { createFakeStorage, fakeGeo } from "./support/fakes";

describe("Administração e conta (e2e)", () => {
  let app: INestApplication;
  let db: DataSource;
  let categoryId: string;

  const userIdOf = async (email: string): Promise<string> =>
    (await db.query(`SELECT id FROM users WHERE email = $1`, [email]))[0].id;

  async function publish(
    owner: { cookie: string; buildingId: string },
    title: string,
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

  async function platformAdmin() {
    const session = await resident(app, {}, "Equipe Plataforma");
    await db.query(`UPDATE users SET role = 'platform_admin' WHERE email = $1`, [session.email]);
    return session;
  }

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(GeoService)
        .useValue(fakeGeo)
        .overrideProvider(StorageService)
        .useValue(createFakeStorage()),
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

  describe("prédio sem administrador", () => {
    it("vizinho entra no prédio na hora e não existe painel de administração do prédio (RN-037)", async () => {
      const creator = await resident(app, {}, "Quem cadastrou");
      await db.query(`UPDATE buildings SET status = 'verificado' WHERE id = $1`, [
        creator.buildingId,
      ]);
      const neighbor = await onboardedProfile(app, "Vizinha nova");
      const joined = await as(app, neighbor.cookie)
        .post(`/api/buildings/${creator.buildingId}/join`)
        .send({ unit: "7B" })
        .expect(200);
      expect(joined.body.status).toBe("ativo");
      expect(joined.body).not.toHaveProperty("role");
      expect((await as(app, neighbor.cookie).get("/api/me")).body.onboardingStep).toBe("concluido");

      await as(app, creator.cookie).get(`/api/buildings/${creator.buildingId}/admin`).expect(404);
    });
  });

  describe("admin da plataforma", () => {
    it("só admins da plataforma acessam o painel", async () => {
      const common = await resident(app);
      await as(app, common.cookie).get("/api/admin/metrics").expect(403);
      const admin = await platformAdmin();
      const metrics = (await as(app, admin.cookie).get("/api/admin/metrics").expect(200)).body;
      expect(metrics.users.total).toBeGreaterThan(0);
      expect(metrics.adsByCategory).toHaveLength(16);
    });

    it("revisa prédios pendentes com o relatório e decide (RN-027)", async () => {
      const owner = await resident(app, {}, "Criador");
      await db.query(`UPDATE buildings SET status = 'pendente_revisao' WHERE id = $1`, [
        owner.buildingId,
      ]);
      const admin = await platformAdmin();
      const queue = (
        await as(app, admin.cookie).get("/api/admin/buildings?status=pendente_revisao").expect(200)
      ).body;
      expect(queue.map((b: { id: string }) => b.id)).toContain(owner.buildingId);
      await as(app, admin.cookie)
        .post(`/api/admin/buildings/${owner.buildingId}/decision`)
        .send({ decision: "rejeitado" })
        .expect(400);
      await as(app, admin.cookie)
        .post(`/api/admin/buildings/${owner.buildingId}/decision`)
        .send({ decision: "verificado" })
        .expect(204);
      const [mine] = (await as(app, owner.cookie).get("/api/me/buildings")).body;
      expect(mine.building.status).toBe("verificado");
      expect((await as(app, owner.cookie).get("/api/notifications")).body[0].type).toBe(
        "predio_atualizado",
      );
    });

    it("aprova anúncio denunciado e encerra as denúncias; remove com motivo", async () => {
      const seller = await resident(app, {}, "Vendedor Denunciado");
      await db.query(`UPDATE buildings SET status = 'verificado' WHERE id = $1`, [
        seller.buildingId,
      ]);
      const adId = await publish(seller, "Aulas de xadrez");
      const reporter = await onboardedProfile(app, "Denunciante");
      await as(app, reporter.cookie)
        .post(`/api/buildings/${seller.buildingId}/join`)
        .send({ unit: "3" })
        .expect(200);
      await as(app, reporter.cookie)
        .post("/api/reports")
        .send({ targetType: "ad", targetId: adId, reason: "spam" })
        .expect(204);

      const admin = await platformAdmin();
      const reports = (await as(app, admin.cookie).get("/api/admin/reports").expect(200)).body;
      const report = reports.find((r: { targetId: string }) => r.targetId === adId);
      expect(report).toMatchObject({ targetLabel: "Aulas de xadrez", reporterName: "Denunciante" });

      await as(app, admin.cookie)
        .post(`/api/admin/ads/${adId}/decision`)
        .send({ decision: "aprovar" })
        .expect(204);
      const [{ status }] = await db.query(`SELECT status FROM reports WHERE id = $1`, [report.id]);
      expect(status).toBe("improcedente");

      await as(app, admin.cookie)
        .post(`/api/admin/ads/${adId}/decision`)
        .send({ decision: "remover", reason: "Anúncio repetido" })
        .expect(204);
      const ad = (await as(app, seller.cookie).get(`/api/ads/mine/${adId}`)).body;
      expect(ad).toMatchObject({ status: "removido", statusReason: "Anúncio repetido" });
    });

    it("aplica sanções progressivas e o banimento bloqueia login e novo cadastro (RN-009, RN-095)", async () => {
      const target = await resident(app, {}, "Infrator");
      const targetId = await userIdOf(target.email);
      const admin = await platformAdmin();
      const api = as(app, admin.cookie);

      expect(
        (
          await api
            .post(`/api/admin/users/${targetId}/sanctions`)
            .send({ reason: "Spam no chat" })
            .expect(201)
        ).body.type,
      ).toBe("aviso");
      expect(
        (
          await api
            .post(`/api/admin/users/${targetId}/sanctions`)
            .send({ reason: "Spam de novo" })
            .expect(201)
        ).body.type,
      ).toBe("suspensao");
      const suspended = await as(app, target.cookie)
        .post("/api/ads")
        .send({ buildingId: target.buildingId });
      expect(suspended.status).toBe(400); // corpo inválido, mas ainda logado
      expect((await as(app, target.cookie).get("/api/me")).body.status).toBe("suspenso");

      expect(
        (
          await api
            .post(`/api/admin/users/${targetId}/sanctions`)
            .send({ reason: "Golpe" })
            .expect(201)
        ).body.type,
      ).toBe("banimento");
      await as(app, target.cookie).get("/api/me").expect(401);
      const login = await request(app.getHttpServer())
        .post("/api/auth/sign-in/email")
        .set("Origin", ORIGIN)
        .send({ email: target.email, password: target.password });
      expect([401, 403]).toContain(login.status);

      await db.query(`DELETE FROM users WHERE id = $1`, [targetId]);
      const again = await request(app.getHttpServer())
        .post("/api/auth/sign-up/email")
        .set("Origin", ORIGIN)
        .send({ name: "Infrator de novo", email: target.email, password: "outra-senha-forte-1" });
      // O Better Auth responde igual para não revelar quem existe; o que importa é a conta não ser criada.
      const [{ total }] = await db.query(
        `SELECT count(*)::int AS total FROM users WHERE email = $1`,
        [target.email],
      );
      expect({ status: again.status, total }).toEqual({ status: again.status, total: 0 });
    });

    it("altera configurações com validação de tipo", async () => {
      const admin = await platformAdmin();
      const api = as(app, admin.cookie);
      const list = (await api.get("/api/admin/settings").expect(200)).body;
      expect(list.find((s: { key: string }) => s.key === "ads.maxActiveResident")).toMatchObject({
        value: 5,
        defaultValue: 5,
      });
      await api
        .put("/api/admin/settings/ads.maxActiveResident")
        .send({ value: "muitos" })
        .expect(400);
      await api
        .put("/api/admin/settings/ads.radiiKm")
        .send({ value: [0, 1, 2] })
        .expect(204);
      await api.put("/api/admin/settings/nao.existe").send({ value: 1 }).expect(404);
      await app.get(SettingsService).reset("ads.radiiKm");
    });
  });

  describe("conta (LGPD)", () => {
    it("exporta os dados do titular em JSON (RN-133)", async () => {
      const me = await resident(app, {}, "Titular");
      const res = await as(app, me.cookie).get("/api/me/export").expect(200);
      expect(res.headers["content-disposition"]).toMatch(/attachment/);
      expect(res.body.perfil).toMatchObject({ name: "Titular", email: me.email });
      expect(res.body.predios[0].unidade).toBe("Apto 42");
    });

    it("exclui a conta anonimizando e exige login recente (RN-008)", async () => {
      const me = await resident(app, {}, "Vai Sair");
      const id = await userIdOf(me.email);
      await db.query(
        `UPDATE sessions SET created_at = now() - interval '1 hour' WHERE user_id = $1`,
        [id],
      );
      const stale = await as(app, me.cookie).delete("/api/me").send({ confirm: "EXCLUIR" });
      expect(stale.status).toBe(403);
      expect(stale.body.code).toBe("FRESH_LOGIN_REQUIRED");

      const fresh = await signUpAndLogin(app).catch(() => null);
      expect(fresh).not.toBeNull();
      await db.query(`UPDATE sessions SET created_at = now() WHERE user_id = $1`, [id]);
      await as(app, me.cookie).delete("/api/me").send({ confirm: "nao" }).expect(400);
      await as(app, me.cookie).delete("/api/me").send({ confirm: "EXCLUIR" }).expect(204);
      await as(app, me.cookie).get("/api/me").expect(401);
      const [row] = await db.query(`SELECT name, email, phone, status FROM users WHERE id = $1`, [
        id,
      ]);
      expect(row).toMatchObject({ name: "Usuário removido", phone: null, status: "excluido" });
      expect(row.email).not.toBe(me.email);
    });
  });
});
