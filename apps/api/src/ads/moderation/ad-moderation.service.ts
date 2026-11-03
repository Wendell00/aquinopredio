import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource, type EntityManager } from "typeorm";
import { AiService, AiUnavailableError, delimit } from "../../ai/ai.service";
import {
  MODERATION_PROMPT_VERSION,
  MODERATION_SYSTEM,
  type ModerationOutput,
  moderationOutputSchema,
} from "../../ai/prompts/moderation.prompt";
import type { Env } from "../../config/env";
import { NotificationsService } from "../../notifications/notifications.service";
import { SettingsService } from "../../settings/settings.service";
import { UploadsService } from "../../uploads/uploads.service";
import {
  AdModerationRunsService,
  type AppliedDecision,
  type ClaimedRun,
  type ModerationDecision,
} from "./ad-moderation-runs.service";
import { lockAd, type ModerationResult, writeDecision } from "./locked-ad";
import { type LocalModerationResult, moderateLocally } from "./moderation.rules";

/** Confiança mínima para a IA remover sozinha; abaixo disso vai para revisão (docs §4.3). */
const REMOVE_CONFIDENCE = 0.8;

export type { ModerationResult } from "./locked-ad";

/**
 * Moderação de anúncio publicado/editado (RN-062, RN-090): filtro local + IA.
 * Sem IA, segue `MODERATION_WITHOUT_AI` (RN-113): fila manual ou, em dev, aprovação após o filtro.
 * Resposta atrasada nunca sobrepõe exclusão, decisão humana ou edição posterior (RN-MOD-007):
 * a execução é autorizada por episódio e só é aplicada se a versão analisada continua atual.
 */
@Injectable()
export class AdModerationService {
  private readonly logger = new Logger(AdModerationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly runs: AdModerationRunsService,
    private readonly ai: AiService,
    private readonly uploads: UploadsService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
    private readonly notifications: NotificationsService,
  ) {}

  /** Resultado aplicado, ou `null` quando a execução não começou ou foi descartada. */
  async moderate(adId: string): Promise<ModerationResult | null> {
    const claim = await this.runs.claim(adId);
    if (!claim.run) {
      this.logger.log(`moderacao.nao_iniciada ad=${adId} motivo=${claim.reason}`);
      // Ocultado por denúncias: só o admin da plataforma decide (RN-093).
      return claim.reason === "revisao_manual" ? "em_moderacao" : null;
    }
    const { run } = claim;
    let applied: AppliedDecision | null;
    try {
      const text = [run.title, run.description, run.tags.join(" "), run.availability ?? ""].join(
        "\n",
      );
      const local = moderateLocally(text);
      const aiResult = await this.askAi(run);
      const decision = aiResult ? decideWithAi(aiResult, local) : this.decideWithRules(local);
      const days = await this.settings.get("ads.activeDays");
      applied = await this.runs.commit(run, decision, days);
    } catch (error) {
      await this.runs
        .fail(run.id)
        .catch((cause) => this.logger.error(`moderacao.falha_ao_registrar run=${run.id}`, cause));
      throw error;
    }
    if (!applied) return null;
    if (applied.result === "em_moderacao")
      this.logger.log(`Anúncio ${adId} aguardando revisão manual`);
    await this.notifyOutcome(applied);
    return applied.result;
  }

  /** `null` quando a IA não está disponível (RN-113). */
  private async askAi(run: ClaimedRun): Promise<{ data: ModerationOutput; model: string } | null> {
    try {
      return await this.ai.structured({
        task: "moderation",
        promptVersion: MODERATION_PROMPT_VERSION,
        schemaName: "moderacao",
        schema: moderationOutputSchema,
        system: MODERATION_SYSTEM,
        userText: delimit(
          "anuncio",
          JSON.stringify({
            tipo: run.type,
            categoria: run.categoryName,
            titulo: run.title,
            descricao: run.description,
            tags: run.tags,
            disponibilidade: run.availability,
          }),
        ),
        imageUrls: await this.uploads.forAi(run.images.slice(0, 4)),
        userId: run.userId,
        correlationId: run.id,
      });
    } catch (error) {
      if (error instanceof AiUnavailableError) return null;
      throw error;
    }
  }

  private decideWithRules(local: LocalModerationResult): ModerationDecision {
    const approveWithoutAi =
      this.config.get("MODERATION_WITHOUT_AI", { infer: true }) === "approve";
    const result: ModerationResult =
      approveWithoutAi && local.decision === "aprovado" ? "ativo" : "em_moderacao";
    return {
      result,
      statusReason: null,
      record: {
        decision: result === "ativo" ? "aprovado" : "revisar",
        decidedBy: "regras",
        categories: local.categories,
        reason: local.categories.length
          ? `Termos sinalizados: ${local.categories.join(", ")}`
          : null,
        confidence: null,
        model: null,
      },
    };
  }

  /**
   * Decisão manual do admin da plataforma (fila de moderação, denúncias, RN-062/RN-093).
   * Anúncio, registro e o que `inTransaction` gravar (denúncias, auditoria) entram juntos ou
   * nada entra. Exclusão é definitiva (spec 5.7): nem o admin reativa um anúncio excluído.
   */
  async decideByAdmin(
    adId: string,
    decision: "aprovar" | "remover",
    reason: string | null,
    reviewerId: string,
    inTransaction?: (manager: EntityManager) => Promise<void>,
  ): Promise<void> {
    const result: ModerationResult = decision === "aprovar" ? "ativo" : "removido";
    const days = await this.settings.get("ads.activeDays");
    const ad = await this.dataSource.transaction(async (manager) => {
      const locked = await lockAd(manager, adId);
      if (!locked || locked.status === "excluido")
        throw new NotFoundException("Anúncio não encontrado");
      // A decisão humana encerra a revisão manual; aprovar zera as denúncias que ocultaram o anúncio.
      await manager.query(
        `UPDATE ads SET manual_review = false, needs_moderation = false,
           report_count = CASE WHEN $2 THEN 0 ELSE report_count END, updated_at = now()
         WHERE id = $1`,
        [adId, decision === "aprovar"],
      );
      await writeDecision(manager, locked, result, reason, days);
      await manager.query(
        `INSERT INTO ad_moderations (ad_id, decision, decided_by, violated_categories, reason, reviewer_id, content_version)
         VALUES ($1, $2, 'admin', '{}', $3, $4, $5)`,
        [
          adId,
          decision === "aprovar" ? "aprovado" : "proibido",
          reason,
          reviewerId,
          locked.contentVersion,
        ],
      );
      await inTransaction?.(manager);
      return locked;
    });
    await this.notifyOutcome({
      adId,
      userId: ad.userId,
      title: ad.title,
      result,
      statusReason: reason,
    });
  }

  /** Só depois do commit; falha de notificação não desfaz nem marca a decisão como falha. */
  private async notifyOutcome(applied: AppliedDecision): Promise<void> {
    if (applied.result === "em_moderacao") return;
    try {
      await this.notifications.notify(
        applied.userId,
        applied.result === "ativo"
          ? {
              type: "anuncio_aprovado",
              title: "Seu anúncio está no ar",
              body: `“${applied.title}” já aparece para os vizinhos.`,
              url: `/anuncios/${applied.adId}`,
            }
          : {
              type: "anuncio_removido",
              title: "Anúncio não aprovado",
              body: `“${applied.title}”: ${applied.statusReason ?? "conteúdo não permitido"}.`,
              url: "/meus-anuncios",
            },
      );
    } catch (error) {
      this.logger.error(
        `moderacao.notificacao_falhou ad=${applied.adId}: ${(error as Error).message}`,
      );
    }
  }
}

function decideWithAi(
  aiResult: { data: ModerationOutput; model: string },
  local: LocalModerationResult,
): ModerationDecision {
  const { decisao, confianca, motivo, categorias_violadas } = aiResult.data;
  let result: ModerationResult = "em_moderacao";
  if (decisao === "proibido" && confianca >= REMOVE_CONFIDENCE) result = "removido";
  else if (decisao === "aprovado" && local.decision === "aprovado") result = "ativo";
  const decision = { ativo: "aprovado", removido: "proibido", em_moderacao: "revisar" } as const;
  return {
    result,
    statusReason: result === "removido" ? motivo || "Conteúdo não permitido" : null,
    record: {
      decision: decision[result],
      decidedBy: "ia",
      categories: [...new Set([...categorias_violadas, ...local.categories])],
      reason: motivo || null,
      confidence: confianca,
      model: aiResult.model,
    },
  };
}
