import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, type EntityManager, Repository } from "typeorm";
import { AiService, AiUnavailableError, delimit } from "../../ai/ai.service";
import {
  BUILDING_VALIDATION_PROMPT_VERSION,
  BUILDING_VALIDATION_SYSTEM,
  type BuildingValidationOutput,
  buildingValidationOutputSchema,
} from "../../ai/prompts/building-validation.prompt";
import { GeoService, type NearbyPlace, type ReverseResult } from "../../geo/geo.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { SettingsService } from "../../settings/settings.service";
import { Building, BuildingVerification } from "../building.entity";
import { decide, evaluateRules, type VerificationDecision } from "./verification.rules";

export interface VerificationOutcome {
  decision: VerificationDecision;
  score: number | null;
  decidedBy: "ia" | "regras" | "admin";
}

type VerificationResult = {
  decision: VerificationDecision;
  score: number | null;
  decidedBy: "ia" | "regras" | "admin";
  reviewerId?: string;
  input: Record<string, unknown>;
  output: BuildingValidationOutput | null;
  model?: string;
  reason: string | null;
  suggestedName?: string | null;
};

/** Dados do prédio usados na notificação da decisão. */
type DecidedBuilding = Pick<Building, "id" | "name" | "createdBy">;

/**
 * Pipeline de validação de prédio (docs §4.2): evidências do mapa → regras determinísticas →
 * análise por IA → decisão pelos limites da RN-027. Sem IA, o prédio vai para revisão manual (RN-113).
 *
 * Resultado atrasado (spec 5.16 item 2; P00-B5.2): a execução captura a submissão do prédio antes
 * das chamadas externas e só aplica se, na gravação, o prédio ainda estiver `pendente_validacao`
 * na mesma submissão. Decisão do admin ou reenvio no meio do caminho descartam o resultado.
 */
@Injectable()
export class BuildingVerificationService {
  private readonly logger = new Logger(BuildingVerificationService.name);

  constructor(
    @InjectRepository(Building) private readonly buildings: Repository<Building>,
    private readonly dataSource: DataSource,
    private readonly geo: GeoService,
    private readonly ai: AiService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * @param options.requireEvidence Falha (para a fila tentar de novo) se o mapa não responder.
   *   Na última tentativa segue sem evidências, e a decisão fica com a IA e as regras.
   */
  async verify(
    buildingId: string,
    options: { requireEvidence?: boolean } = {},
  ): Promise<VerificationOutcome | null> {
    const building = await this.buildings.findOneBy({ id: buildingId });
    if (building?.status !== "pendente_validacao") return null;
    const [lng, lat] = building.location.coordinates;

    const [reverse, nearby] = await Promise.all([
      this.geo.reverse(lat, lng).catch((error): ReverseResult | null => {
        if (options.requireEvidence) throw error;
        return null;
      }),
      this.geo.nearbyPlaces(lat, lng).catch((error): NearbyPlace[] => {
        if (options.requireEvidence) throw error;
        return [];
      }),
    ]);
    const rules = evaluateRules({
      name: building.name,
      cep: building.cep,
      number: building.number,
      geocodePrecision: null,
      reverse,
      nearby,
    });
    const input = {
      informado: {
        nome: building.name,
        tipo: building.type,
        endereco: `${building.street}, ${building.number} — ${building.district}, ${building.city}/${building.state}`,
        cep: building.cep,
        unidades: building.unitsEstimate,
        coordenadas: { lat, lng },
      },
      geocodificacao_reversa: reverse,
      lugares_proximos: nearby.slice(0, 25),
      regras: rules,
    };

    if (rules.forcedRejectionReason) {
      return this.applyAutomatic(building, {
        decision: "rejeitado",
        score: 0,
        decidedBy: "regras",
        input,
        output: null,
        reason: rules.forcedRejectionReason,
      });
    }

    const thresholds = {
      verify: await this.settings.get("buildings.verifyThreshold"),
      review: await this.settings.get("buildings.reviewThreshold"),
    };

    let ai: { data: BuildingValidationOutput; model: string } | null = null;
    try {
      ai = await this.ai.structured({
        task: "building_validation",
        promptVersion: BUILDING_VALIDATION_PROMPT_VERSION,
        schemaName: "validacao_predio",
        schema: buildingValidationOutputSchema,
        system: BUILDING_VALIDATION_SYSTEM,
        userText: delimit("dados_do_cadastro", JSON.stringify(input, null, 2)),
        imageUrls: building.facadePhotoUrl ? [building.facadePhotoUrl] : [],
        userId: building.createdBy,
      });
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) throw error;
      this.logger.warn(`Validação do prédio ${building.id} sem IA: vai para revisão manual`);
    }

    if (!ai) {
      return this.applyAutomatic(building, {
        decision: "pendente_revisao",
        score: null,
        decidedBy: "regras",
        input,
        output: null,
        reason: null,
      });
    }

    const score = Math.min(ai.data.score, rules.scoreCap);
    const decision = decide(score, thresholds);
    return this.applyAutomatic(building, {
      decision,
      score,
      decidedBy: "ia",
      input,
      output: ai.data,
      model: ai.model,
      reason:
        decision === "rejeitado"
          ? (ai.data.motivo_para_usuario ?? "Não conseguimos confirmar este endereço.")
          : null,
      suggestedName:
        ai.data.nome_sugerido &&
        ai.data.nome_sugerido.trim().toLowerCase() !== building.name.toLowerCase()
          ? ai.data.nome_sugerido.trim()
          : null,
    });
  }

  /** Decisão manual do admin da plataforma na fila de revisão (RN-027). */
  async decideByAdmin(
    buildingId: string,
    decision: "verificado" | "rejeitado",
    reason: string | null,
    reviewerId: string,
  ): Promise<void> {
    const result: VerificationResult = {
      decision,
      score: null,
      decidedBy: "admin",
      reviewerId,
      input: { revisao_manual: true },
      output: null,
      reason: decision === "rejeitado" ? reason : null,
    };
    // Estados aceitos: os mesmos de antes (R3 fora desta fatia). O lock serializa com a aplicação
    // automática e com o reenvio; `NO KEY UPDATE` não bloqueia quem cria vínculo (FK em KEY SHARE).
    const building = await this.dataSource.transaction(async (manager) => {
      const [locked]: {
        id: string;
        name: string;
        created_by: string | null;
        submission_id: string;
      }[] = await manager.query(
        `SELECT id, name, created_by, submission_id FROM buildings WHERE id = $1 FOR NO KEY UPDATE`,
        [buildingId],
      );
      if (!locked) throw new NotFoundException("Prédio não encontrado");
      await manager.getRepository(Building).update(locked.id, {
        status: result.decision,
        rejectionReason: result.reason,
        suggestedName: null,
      });
      await this.writeEffects(manager, locked.id, locked.submission_id, result);
      return { id: locked.id, name: locked.name, createdBy: locked.created_by };
    });
    this.notifyDecision(building, result);
  }

  /**
   * Aplica o resultado automático só se o prédio ainda está `pendente_validacao` na submissão
   * capturada antes das chamadas externas. A transição condicional é o primeiro passo: a mesma
   * submissão aplica no máximo uma vez, e o descarte não grava registro, efeito nem notificação.
   */
  private async applyAutomatic(
    building: Building,
    result: VerificationResult,
  ): Promise<VerificationOutcome | null> {
    const applied = await this.dataSource.transaction(async (manager) => {
      const [, affected]: [unknown[], number] = await manager.query(
        `UPDATE buildings SET status = $3, rejection_reason = $4, suggested_name = $5, updated_at = now()
         WHERE id = $1 AND status = 'pendente_validacao' AND submission_id = $2`,
        [
          building.id,
          building.submissionId,
          result.decision,
          result.reason,
          result.suggestedName ?? null,
        ],
      );
      if (affected !== 1) return false;
      await this.writeEffects(manager, building.id, building.submissionId, result);
      return true;
    });
    if (!applied) {
      this.logger.warn(
        `predio.validacao_descartada predio=${building.id} submissao=${building.submissionId} motivo=${await this.discardReason(building)}`,
      );
      return null;
    }
    this.notifyDecision(building, result);
    return { decision: result.decision, score: result.score, decidedBy: result.decidedBy };
  }

  /** Registro da decisão e efeitos nos moradores, na transação de quem decidiu. */
  private async writeEffects(
    manager: EntityManager,
    buildingId: string,
    submissionId: string,
    result: VerificationResult,
  ): Promise<void> {
    await manager.getRepository(BuildingVerification).save({
      buildingId,
      submissionId,
      input: result.input,
      output: result.output,
      score: result.score,
      decision: result.decision,
      decidedBy: result.decidedBy,
      reviewerId: result.reviewerId ?? null,
      model: result.model ?? null,
      promptVersion: result.decidedBy === "ia" ? BUILDING_VALIDATION_PROMPT_VERSION : null,
    });
    if (result.decision === "rejeitado") {
      // RN-029: sem outro vínculo válido, o usuário volta para o onboarding.
      await manager.query(
        `UPDATE users u SET status = 'onboarding_pendente', updated_at = now()
         WHERE u.status = 'ativo'
           AND u.id IN (SELECT user_id FROM building_memberships WHERE building_id = $1)
           AND NOT EXISTS (
             SELECT 1 FROM building_memberships m JOIN buildings b ON b.id = m.building_id
             WHERE m.user_id = u.id AND m.status IN ('ativo', 'pendente') AND b.id <> $1
               AND b.status NOT IN ('rejeitado', 'arquivado'))`,
        [buildingId],
      );
      await manager.query(
        `UPDATE users SET primary_building_id = NULL WHERE primary_building_id = $1`,
        [buildingId],
      );
    }
  }

  /** Só depois do commit de uma decisão aplicada. */
  private notifyDecision(building: DecidedBuilding, result: VerificationResult): void {
    if (!building.createdBy || result.decision === "pendente_revisao") return;
    void this.notifications.notify(building.createdBy, {
      type: "predio_atualizado",
      title:
        result.decision === "verificado"
          ? "Prédio verificado"
          : "Não conseguimos confirmar o prédio",
      body:
        result.decision === "verificado"
          ? `“${building.name}” foi verificado. Seus anúncios já podem alcançar prédios vizinhos.`
          : (result.reason ?? "Revise os dados e reenvie."),
      url: result.decision === "verificado" ? "/inicio" : "/onboarding",
    });
  }

  /** Diagnóstico do descarte (só para log): estado atual ou submissão substituída. */
  private async discardReason(building: Building): Promise<string> {
    const [row]: { status: string; submission_id: string }[] = await this.dataSource.query(
      `SELECT status, submission_id FROM buildings WHERE id = $1`,
      [building.id],
    );
    if (!row) return "inexistente";
    if (row.submission_id !== building.submissionId) return "submissao_substituida";
    return `estado_${row.status}`;
  }
}
