import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { AiService, AiUnavailableError, delimit } from "../../ai/ai.service";
import {
  BUILDING_VALIDATION_PROMPT_VERSION,
  BUILDING_VALIDATION_SYSTEM,
  type BuildingValidationOutput,
  buildingValidationOutputSchema,
} from "../../ai/prompts/building-validation.prompt";
import { GeoService, type NearbyPlace, type ReverseResult } from "../../geo/geo.service";
import { SettingsService } from "../../settings/settings.service";
import { Building, BuildingVerification } from "../building.entity";
import { decide, evaluateRules, type VerificationDecision } from "./verification.rules";

export interface VerificationOutcome {
  decision: VerificationDecision;
  score: number | null;
  decidedBy: "ia" | "regras";
}

/**
 * Pipeline de validação de prédio (docs §4.2): evidências do mapa → regras determinísticas →
 * análise por IA → decisão pelos limites da RN-027. Sem IA, o prédio vai para revisão manual (RN-113).
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
      return this.apply(building, {
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
      return this.apply(building, {
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
    return this.apply(building, {
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

  private async apply(
    building: Building,
    result: {
      decision: VerificationDecision;
      score: number | null;
      decidedBy: "ia" | "regras";
      input: Record<string, unknown>;
      output: BuildingValidationOutput | null;
      model?: string;
      reason: string | null;
      suggestedName?: string | null;
    },
  ): Promise<VerificationOutcome> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(BuildingVerification).save({
        buildingId: building.id,
        input: result.input,
        output: result.output,
        score: result.score,
        decision: result.decision,
        decidedBy: result.decidedBy,
        model: result.model ?? null,
        promptVersion: result.decidedBy === "ia" ? BUILDING_VALIDATION_PROMPT_VERSION : null,
      });
      await manager.getRepository(Building).update(building.id, {
        status: result.decision,
        rejectionReason: result.reason,
        suggestedName: result.suggestedName ?? null,
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
          [building.id],
        );
        await manager.query(
          `UPDATE users SET primary_building_id = NULL WHERE primary_building_id = $1`,
          [building.id],
        );
      }
    });
    return { decision: result.decision, score: result.score, decidedBy: result.decidedBy };
  }
}
