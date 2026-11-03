import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { MODERATION_PROMPT_VERSION } from "../../ai/prompts/moderation.prompt";
import type { Upload } from "../../uploads/upload.entity";
import { Ad, type AdModeration } from "../ad.entity";
import { contentHash } from "./content-hash";
import {
  affectedRows,
  type LockedAd,
  lockAd,
  type ModerationResult,
  writeDecision,
} from "./locked-ad";

/** Conteúdo lido no claim: é o que a IA analisa e o que o commit compara. */
export interface ClaimedRun {
  id: string;
  adId: string;
  contentVersion: number;
  contentHash: string;
  userId: string;
  type: string;
  categoryName: string;
  title: string;
  description: string;
  tags: string[];
  availability: string | null;
  images: Upload[];
}

export type ClaimResult = { run: ClaimedRun } | { run: null; reason: string };

export interface ModerationDecision {
  result: ModerationResult;
  /** Motivo exibido ao dono quando removido. */
  statusReason: string | null;
  record: {
    decision: AdModeration["decision"];
    decidedBy: "ia" | "regras";
    categories: string[];
    reason: string | null;
    confidence: number | null;
    model: string | null;
  };
}

export interface AppliedDecision {
  adId: string;
  userId: string;
  title: string;
  result: ModerationResult;
  statusReason: string | null;
}

/**
 * Ciclo de uma execução automática de moderação (spec 5.7, RN-MOD-007):
 * `claim` autoriza no máximo uma execução por episódio, `commit` aplica só se o anúncio ainda
 * está na mesma versão e episódio, `fail` registra erro inesperado. Toda finalização exige
 * `outcome IS NULL`: uma repetição nunca troca o resultado terminal nem duplica efeitos.
 * Nenhuma transação fica aberta durante a chamada à IA (feita por quem chama, entre os passos).
 */
@Injectable()
export class AdModerationRunsService {
  private readonly logger = new Logger(AdModerationRunsService.name);

  constructor(private readonly dataSource: DataSource) {}

  async claim(adId: string): Promise<ClaimResult> {
    return this.dataSource.transaction(async (manager) => {
      const runId = randomUUID();
      const claimed = await affectedRows(
        manager,
        `UPDATE ads SET moderation_run_id = $2
         WHERE id = $1 AND status = 'em_moderacao' AND NOT manual_review AND moderation_run_id IS NULL`,
        [adId, runId],
      );
      if (claimed !== 1) return { run: null, reason: await skipReason(manager, adId) };

      // A linha já está travada pelo UPDATE acima: o snapshot é coerente com a versão autorizada.
      const ad = await manager.getRepository(Ad).findOneOrFail({
        where: { id: adId },
        relations: { category: true, images: { upload: true } },
      });
      const images = [...ad.images].sort((a, b) => a.position - b.position);
      const hash = contentHash({
        type: ad.type,
        categoryId: ad.categoryId,
        title: ad.title,
        description: ad.description,
        tags: ad.tags,
        availability: ad.availability,
        uploadIds: images.map((image) => image.uploadId),
      });
      await manager.query(
        `INSERT INTO ad_moderation_runs (id, ad_id, content_version, content_hash) VALUES ($1, $2, $3, $4)`,
        [runId, adId, ad.contentVersion, hash],
      );
      return {
        run: {
          id: runId,
          adId,
          contentVersion: ad.contentVersion,
          contentHash: hash,
          userId: ad.userId,
          type: ad.type,
          categoryName: ad.category.name,
          title: ad.title,
          description: ad.description,
          tags: ad.tags,
          availability: ad.availability,
          images: images.map((image) => image.upload),
        },
      };
    });
  }

  /**
   * Aplica a decisão se, sob lock, o anúncio continua no mesmo episódio e versão analisados.
   * Devolve `null` quando a execução foi descartada ou já estava finalizada.
   */
  async commit(
    run: Pick<ClaimedRun, "id" | "adId" | "contentVersion" | "contentHash">,
    decision: ModerationDecision,
    activeDays: number,
  ): Promise<AppliedDecision | null> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const ad = await lockAd(manager, run.adId);
      const discard = discardReason(ad, run);
      // Finaliza a execução antes de qualquer efeito: se já era terminal, nada mais acontece.
      const finished = await affectedRows(
        manager,
        `UPDATE ad_moderation_runs SET outcome = $2, discard_reason = $3, finished_at = now()
         WHERE id = $1 AND outcome IS NULL`,
        [run.id, discard ? "descartado" : "aplicado", discard],
      );
      if (finished !== 1) return { kind: "repeticao" as const };
      if (discard || !ad) return { kind: "descartado" as const, reason: discard };

      await writeDecision(manager, ad, decision.result, decision.statusReason, activeDays);
      await manager.query(
        `INSERT INTO ad_moderations (ad_id, decision, decided_by, violated_categories, reason, confidence,
                                     model, prompt_version, content_version, run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          ad.id,
          decision.record.decision,
          decision.record.decidedBy,
          decision.record.categories,
          decision.record.reason,
          decision.record.confidence,
          decision.record.model,
          decision.record.decidedBy === "ia" ? MODERATION_PROMPT_VERSION : null,
          ad.contentVersion,
          run.id,
        ],
      );
      return { kind: "aplicado" as const, ad };
    });

    if (outcome.kind === "repeticao") {
      this.logger.warn(`moderacao.repeticao_ignorada ad=${run.adId} run=${run.id}`);
      return null;
    }
    if (outcome.kind === "descartado") {
      this.logger.warn(
        `moderacao.descartada ad=${run.adId} run=${run.id} versao=${run.contentVersion} motivo=${outcome.reason}`,
      );
      return null;
    }
    return {
      adId: outcome.ad.id,
      userId: outcome.ad.userId,
      title: outcome.ad.title,
      result: decision.result,
      statusReason: decision.statusReason,
    };
  }

  /** Erro inesperado na execução. Nunca sobrescreve um resultado já finalizado. */
  async fail(runId: string): Promise<boolean> {
    const finished = await affectedRows(
      this.dataSource.manager,
      `UPDATE ad_moderation_runs SET outcome = 'falhou', finished_at = now()
       WHERE id = $1 AND outcome IS NULL`,
      [runId],
    );
    return finished === 1;
  }
}

async function skipReason(manager: EntityManager, adId: string): Promise<string> {
  const [row]: { status: string; manual_review: boolean }[] = await manager.query(
    `SELECT status, manual_review FROM ads WHERE id = $1`,
    [adId],
  );
  if (!row) return "inexistente";
  if (row.status !== "em_moderacao") return `estado_${row.status}`;
  if (row.manual_review) return "revisao_manual";
  return "execucao_em_andamento";
}

function discardReason(
  ad: LockedAd | null,
  run: Pick<ClaimedRun, "id" | "contentVersion" | "contentHash">,
): string | null {
  if (!ad) return "estado_inexistente";
  if (ad.status !== "em_moderacao") return `estado_${ad.status}`;
  if (ad.manualReview) return "revisao_manual";
  if (ad.contentVersion !== run.contentVersion || ad.contentHash !== run.contentHash)
    return "versao_alterada";
  if (ad.moderationRunId !== run.id) return "execucao_substituida";
  return null;
}
