import type { ConfigService } from "@nestjs/config";
import type { DataSource } from "typeorm";
import { type AiService, AiUnavailableError } from "../../ai/ai.service";
import type { Env } from "../../config/env";
import type { NotificationsService } from "../../notifications/notifications.service";
import type { SettingsService } from "../../settings/settings.service";
import type { UploadsService } from "../../uploads/uploads.service";
import { AdModerationService } from "./ad-moderation.service";
import type {
  AdModerationRunsService,
  AppliedDecision,
  ClaimedRun,
  ModerationDecision,
} from "./ad-moderation-runs.service";

const run: ClaimedRun = {
  id: "run-1",
  adId: "ad-1",
  contentVersion: 3,
  contentHash: "hash",
  userId: "user-1",
  type: "produto",
  categoryName: "Alimentação",
  title: "Bolo de pote",
  description: "Bolos caseiros de chocolate",
  tags: ["bolo"],
  availability: null,
  images: [],
};

const approved = { decisao: "aprovado", categorias_violadas: [], motivo: "", confianca: 0.95 };

/**
 * Orquestração de `moderate` (P00-B1, spec 5.7): bordas simuladas (execuções, IA, notificação).
 * O SQL do claim/commit é coberto pelos e2e com PostgreSQL real.
 */
function setup() {
  const ai = { structured: jest.fn() };
  let releaseAi: (value: unknown) => void = () => undefined;
  let failAi: (error: Error) => void = () => undefined;
  const aiCalled = new Promise<void>((called) => {
    ai.structured.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          releaseAi = (data) => resolve({ data, model: "fake/model" });
          failAi = reject;
          called();
        }),
    );
  });
  const runs = {
    claim: jest.fn().mockResolvedValue({ run }),
    commit: jest.fn<Promise<AppliedDecision | null>, [unknown, ModerationDecision, number]>(),
    fail: jest.fn().mockResolvedValue(true),
  };
  const dataSource = { transaction: jest.fn() };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const service = new AdModerationService(
    dataSource as unknown as DataSource,
    runs as unknown as AdModerationRunsService,
    ai as unknown as AiService,
    { forAi: jest.fn().mockResolvedValue([]) } as unknown as UploadsService,
    { get: jest.fn().mockResolvedValue(30) } as unknown as SettingsService,
    { get: () => "approve" } as unknown as ConfigService<Env, true>,
    notifications as unknown as NotificationsService,
  );
  return {
    service,
    ai,
    runs,
    dataSource,
    notifications,
    aiCalled,
    releaseAi: (data: unknown) => releaseAi(data),
    failAi: (error: Error) => failAi(error),
  };
}

const applied = (result: AppliedDecision["result"]): AppliedDecision => ({
  adId: run.adId,
  userId: run.userId,
  title: run.title,
  result,
  statusReason: null,
});

describe("AdModerationService.moderate (P00-B1)", () => {
  it("não abre transação nem aplica nada enquanto a IA está pendente (INV-7)", async () => {
    const t = setup();
    t.runs.commit.mockResolvedValue(applied("ativo"));
    const moderation = t.service.moderate(run.adId);
    await t.aiCalled;
    expect(t.runs.claim).toHaveBeenCalledTimes(1);
    expect(t.runs.commit).not.toHaveBeenCalled();
    expect(t.dataSource.transaction).not.toHaveBeenCalled();
    expect(t.notifications.notify).not.toHaveBeenCalled();

    t.releaseAi(approved);
    expect(await moderation).toBe("ativo");
    expect(t.ai.structured).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: run.id }),
    );
    expect(t.runs.commit).toHaveBeenCalledWith(
      run,
      expect.objectContaining({ result: "ativo" }),
      30,
    );
  });

  it("notifica só depois do commit e só quando aplicado", async () => {
    const t = setup();
    const order: string[] = [];
    t.runs.commit.mockImplementation(async () => {
      order.push("commit");
      return applied("ativo");
    });
    t.notifications.notify.mockImplementation(async () => {
      order.push("notify");
    });
    const moderation = t.service.moderate(run.adId);
    await t.aiCalled;
    t.releaseAi(approved);
    await moderation;
    expect(order).toEqual(["commit", "notify"]);
  });

  it("descarte devolve null, sem notificação nem marca de falha (INV-5)", async () => {
    const t = setup();
    t.runs.commit.mockResolvedValue(null);
    const moderation = t.service.moderate(run.adId);
    await t.aiCalled;
    t.releaseAi(approved);
    expect(await moderation).toBeNull();
    expect(t.notifications.notify).not.toHaveBeenCalled();
    expect(t.runs.fail).not.toHaveBeenCalled();
  });

  it("sem claim não chama a IA (INV-4)", async () => {
    const t = setup();
    t.runs.claim.mockResolvedValue({ run: null, reason: "execucao_em_andamento" });
    expect(await t.service.moderate(run.adId)).toBeNull();
    expect(t.ai.structured).not.toHaveBeenCalled();
    t.runs.claim.mockResolvedValue({ run: null, reason: "revisao_manual" });
    expect(await t.service.moderate(run.adId)).toBe("em_moderacao");
    expect(t.ai.structured).not.toHaveBeenCalled();
  });

  it("IA indisponível segue pelas regras no mesmo commit (INV-8, RN-MOD-003)", async () => {
    const t = setup();
    t.runs.commit.mockResolvedValue(applied("ativo"));
    const moderation = t.service.moderate(run.adId);
    await t.aiCalled;
    t.failAi(new AiUnavailableError("fora do ar"));
    expect(await moderation).toBe("ativo");
    expect(t.runs.commit).toHaveBeenCalledWith(
      run,
      expect.objectContaining({ record: expect.objectContaining({ decidedBy: "regras" }) }),
      30,
    );
    expect(t.runs.fail).not.toHaveBeenCalled();
  });

  it("erro inesperado marca a execução como falha e relança", async () => {
    const t = setup();
    const moderation = t.service.moderate(run.adId);
    await t.aiCalled;
    t.failAi(new Error("bug"));
    await expect(moderation).rejects.toThrow("bug");
    expect(t.runs.fail).toHaveBeenCalledWith(run.id);
    expect(t.runs.commit).not.toHaveBeenCalled();
  });

  it("falha da notificação não marca a execução aplicada como falha", async () => {
    const t = setup();
    t.runs.commit.mockResolvedValue(applied("ativo"));
    t.notifications.notify.mockRejectedValue(new Error("push fora do ar"));
    const moderation = t.service.moderate(run.adId);
    await t.aiCalled;
    t.releaseAi(approved);
    expect(await moderation).toBe("ativo");
    expect(t.runs.fail).not.toHaveBeenCalled();
  });
});
