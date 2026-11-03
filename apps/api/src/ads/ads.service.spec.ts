import type { UpdateAdInput } from "@repo/shared";
import type { DataSource, Repository } from "typeorm";
import type { AiService } from "../ai/ai.service";
import type { PlansService } from "../billing/plans.service";
import type { SettingsService } from "../settings/settings.service";
import { Upload } from "../uploads/upload.entity";
import type { UploadsService } from "../uploads/uploads.service";
import type { User } from "../users/user.entity";
import { Ad, AdImage, type Category } from "./ad.entity";
import type { AdDraftsService } from "./ad-drafts.service";
import { AdsService } from "./ads.service";
import type { AdModerationService } from "./moderation/ad-moderation.service";

const ids = {
  ad: "4a1f2b0e-1c4d-4f7e-9a51-0b6c1d2e3f40",
  user: "5b2f3c1d-2d5e-4a8f-8b62-1c7d2e3f4a51",
  building: "6c3a4d2e-3e6f-4b9a-9c73-2d8e3f4a5b62",
  category: "7d4b5e3f-4f7a-4cab-8d84-3e9f4a5b6c73",
  otherCategory: "8e5c6f4a-5a8b-4dbc-9e95-4fa05b6c7d84",
  upload1: "9f6d7a5b-6b9c-4ecd-8fa6-5ab16c7d8e95",
  upload2: "a07e8b6c-7cad-4fde-9ab7-6bc27d8e9fa6",
};

const current: UpdateAdInput = {
  buildingId: ids.building,
  type: "produto",
  categoryId: ids.category,
  title: "Bolo de pote caseiro",
  description: "Bolos de pote caseiros, sabores variados.",
  priceMode: "fixo",
  priceCents: 1000,
  radiusKm: 0,
  whatsappEnabled: false,
  availability: null,
  tags: ["bolo"],
  imageIds: [ids.upload1],
};

/**
 * Edição sob lock (P00-B1, spec 5.7, RN-064): todo campo que a moderação lê incrementa a versão,
 * e campos fora da moderação não. Bordas simuladas; o lock real é coberto pelos e2e.
 */
function setup(states: { read?: string; locked?: string; occupied?: number } = {}) {
  const stored = {
    id: ids.ad,
    userId: ids.user,
    buildingId: ids.building,
    type: current.type,
    categoryId: current.categoryId,
    title: current.title,
    description: current.description,
    availability: current.availability,
    tags: current.tags,
    status: states.read ?? "ativo",
    statusReason: null,
    manualReview: false,
    contentVersion: 4,
    radiusM: 0,
    priceMode: "fixo",
    priceCents: 1000,
    featuredAt: null,
    bumpedAt: null,
    publishedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    building: { name: "Edifício" },
    category: { id: ids.category, name: "Alimentação", slug: "alimentacao", icon: "utensils" },
    images: [],
  };
  const locked = { ...stored, status: states.locked ?? stored.status };
  const currentImages = [{ uploadId: ids.upload1, position: 0 }];
  // Ordem do que a transação faz: lock de cota, lock da linha, contagem, escrita.
  const steps: string[] = [];
  const adUpdate = jest.fn().mockImplementation(async () => {
    steps.push("escrita");
    return { affected: 1 };
  });
  const manager = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) {
        steps.push("cota");
        return [];
      }
      if (sql.includes("FROM ad_images")) {
        steps.push("associacao");
        return [];
      }
      if (sql.includes("count(*)")) {
        steps.push("contagem");
        return [{ count: states.occupied ?? 0 }];
      }
      throw new Error(`consulta inesperada: ${sql}`);
    }),
    getRepository: (entity: unknown) => {
      if (entity === Ad)
        return {
          findOne: jest.fn(async () => {
            steps.push("linha");
            return locked;
          }),
          update: adUpdate,
        };
      if (entity === AdImage)
        return {
          find: jest.fn(async () => currentImages),
          delete: jest.fn(),
          save: jest.fn(),
        };
      if (entity === Upload) {
        // Uploads lidos com lock (P00-B4.1): a cadeia do query builder termina em `getMany`.
        const chain = {
          where: () => chain,
          andWhere: () => chain,
          orderBy: () => chain,
          setLock: () => chain,
          getMany: jest.fn(async () => {
            steps.push("uploads");
            return [
              { id: ids.upload1, attachedAt: new Date() },
              { id: ids.upload2, attachedAt: null },
            ];
          }),
        };
        return {
          createQueryBuilder: () => chain,
          update: jest.fn(async () => {
            steps.push("marca");
            return { affected: 1 };
          }),
        };
      }
      throw new Error("repositório inesperado");
    },
  };
  const dataSource = {
    transaction: jest.fn((work: (m: typeof manager) => unknown) => work(manager)),
    query: jest.fn(async (sql: string) => {
      if (sql.includes("building_memberships m JOIN"))
        return [
          {
            id: ids.building,
            name: "Edifício",
            status: "verificado",
            verified_at: null,
            location: "",
          },
        ];
      if (sql.includes("similarity")) return [{ score: null }];
      return [{ favorites: 0, conversations: 0 }];
    }),
  };
  const moderation = { moderate: jest.fn().mockResolvedValue(null) };
  const service = new AdsService(
    { findOne: jest.fn().mockResolvedValue(stored) } as unknown as Repository<Ad>,
    { existsBy: jest.fn().mockResolvedValue(true) } as unknown as Repository<Category>,
    dataSource as unknown as DataSource,
    {
      get: jest.fn(async (key: string) => (key === "ads.radiiKm" ? [0, 1, 3] : 72)),
    } as unknown as SettingsService,
    {
      markAttached: jest.fn(),
      toImage: jest.fn(),
    } as unknown as UploadsService,
    {} as AdDraftsService,
    {} as AiService,
    {
      planOf: jest.fn().mockResolvedValue("free"),
      limits: jest.fn().mockResolvedValue({ maxRadiusKm: 1 }),
    } as unknown as PlansService,
    moderation as unknown as AdModerationService,
  );
  const user = { id: ids.user, status: "ativo" } as User;
  return { service, user, adUpdate, moderation, dataSource, steps, currentImages };
}

describe("AdsService.update — versão do conteúdo (P00-B1)", () => {
  const moderatedChanges: [string, Partial<UpdateAdInput>][] = [
    ["título", { title: "Bolo de pote gourmet" }],
    ["descrição", { description: "Outra descrição longa o bastante." }],
    ["tipo", { type: "servico" }],
    ["categoria", { categoryId: ids.otherCategory }],
    ["disponibilidade", { availability: "noites" }],
    ["tags", { tags: ["bolo", "doce"] }],
    ["fotos", { imageIds: [ids.upload1, ids.upload2] }],
    ["ordem das fotos", { imageIds: [ids.upload2, ids.upload1] }],
  ];

  it.each(moderatedChanges)("mudar %s incrementa a versão e remodera", async (_, change) => {
    const t = setup();
    await t.service.update(t.user, ids.ad, { ...current, ...change });
    const [, written] = t.adUpdate.mock.calls[0];
    expect(typeof written.contentVersion).toBe("function");
    expect(written.contentVersion()).toBe("content_version + 1");
    expect(written.status).toBe("em_moderacao");
    expect(t.moderation.moderate).toHaveBeenCalledWith(ids.ad);
  });

  it("mudar só o preço não incrementa a versão nem remodera", async () => {
    const t = setup();
    await t.service.update(t.user, ids.ad, { ...current, priceCents: 1200 });
    const [, written] = t.adUpdate.mock.calls[0];
    expect(written).not.toHaveProperty("contentVersion");
    expect(written).not.toHaveProperty("status");
    expect(t.moderation.moderate).not.toHaveBeenCalled();
  });
});

/** Pausa sob lock (P00-B2.1, RN-ADS-005 só para pausa): o estado travado decide, não a leitura. */
describe("AdsService.pause — decisão sob lock", () => {
  it("ativo sob lock: grava pausado condicionado ao status e à versão travados", async () => {
    const t = setup();
    await t.service.pause(t.user, ids.ad);
    expect(t.adUpdate).toHaveBeenCalledTimes(1);
    expect(t.adUpdate).toHaveBeenCalledWith(
      { id: ids.ad, status: "ativo", contentVersion: 4 },
      { status: "pausado" },
    );
  });

  it("já pausado sob lock: sucesso sem escrita", async () => {
    const t = setup({ read: "pausado" });
    await expect(t.service.pause(t.user, ids.ad)).resolves.toBeDefined();
    expect(t.adUpdate).not.toHaveBeenCalled();
  });

  it("leu ativo, mas o lock vê removido: 400 sem escrita", async () => {
    const t = setup({ locked: "removido" });
    await expect(t.service.pause(t.user, ids.ad)).rejects.toThrow(
      "Só anúncios ativos podem ser pausados",
    );
    expect(t.adUpdate).not.toHaveBeenCalled();
  });

  it("leu ativo, mas o lock vê excluído: 404 sem escrita", async () => {
    const t = setup({ locked: "excluido" });
    await expect(t.service.pause(t.user, ids.ad)).rejects.toThrow("Anúncio não encontrado");
    expect(t.adUpdate).not.toHaveBeenCalled();
  });

  it("em moderação na leitura inicial: 400 sem abrir transação", async () => {
    const t = setup({ read: "em_moderacao" });
    await expect(t.service.pause(t.user, ids.ad)).rejects.toThrow(
      "Só anúncios ativos podem ser pausados",
    );
    expect(t.dataSource.transaction).not.toHaveBeenCalled();
  });
});

/**
 * Cota de anúncios ativos sob lock (P00-B3, RN-065): lock de cota antes da linha, contagem na
 * conexão da transação, 403 sem escrita. Limite do mock: 72 (`ads.maxActiveResident`).
 */
describe("AdsService.resume/renew — cota sob lock", () => {
  it("reativação: cota → linha → contagem → escrita", async () => {
    const t = setup({ read: "pausado", occupied: 1 });
    await t.service.resume(t.user, ids.ad);
    expect(t.steps).toEqual(["cota", "linha", "contagem", "escrita"]);
  });

  it("reativação com a cota cheia sob lock: 403 sem escrita", async () => {
    const t = setup({ read: "pausado", occupied: 72 });
    await expect(t.service.resume(t.user, ids.ad)).rejects.toThrow(
      "Você já tem 72 anúncios ativos",
    );
    expect(t.adUpdate).not.toHaveBeenCalled();
  });

  it("renovação de expirado: cota → linha → contagem → escrita", async () => {
    const t = setup({ read: "expirado", occupied: 1 });
    await t.service.renew(t.user, ids.ad);
    expect(t.steps).toEqual(["cota", "linha", "contagem", "escrita"]);
  });

  it("renovação de ativo com a cota cheia: permitida, sem contagem", async () => {
    const t = setup({ read: "ativo", occupied: 72 });
    await t.service.renew(t.user, ids.ad);
    expect(t.steps).toEqual(["cota", "linha", "escrita"]);
  });
});

/** Uploads na edição (P00-B4.1): travados e marcados na mesma transação, depois da linha. */
describe("AdsService.update — uploads sob lock", () => {
  it("linha → uploads travados → associação atual → escrita → marca, tudo na transação", async () => {
    const t = setup();
    await t.service.update(t.user, ids.ad, { ...current, imageIds: [ids.upload1, ids.upload2] });
    expect(t.steps).toEqual(["linha", "uploads", "associacao", "escrita", "marca"]);
  });

  it("upload já usado fora deste anúncio: 400 sem escrita nem marca", async () => {
    const t = setup();
    // upload1 está marcado e não pertence às imagens atuais deste anúncio.
    t.currentImages.length = 0;
    await expect(
      t.service.update(t.user, ids.ad, { ...current, imageIds: [ids.upload1] }),
    ).rejects.toThrow("Uma das fotos não pode ser usada");
    expect(t.steps).toEqual(["linha", "uploads"]);
  });
});
