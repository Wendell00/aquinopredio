import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AiService, AiUnavailableError, delimit } from "../../ai/ai.service";
import {
  MODERATION_PROMPT_VERSION,
  MODERATION_SYSTEM,
  type ModerationOutput,
  moderationOutputSchema,
} from "../../ai/prompts/moderation.prompt";
import type { Env } from "../../config/env";
import { SettingsService } from "../../settings/settings.service";
import { UploadsService } from "../../uploads/uploads.service";
import { Ad, AdModeration } from "../ad.entity";
import { moderateLocally } from "./moderation.rules";

/** Confiança mínima para a IA remover sozinha; abaixo disso vai para revisão (docs §4.3). */
const REMOVE_CONFIDENCE = 0.8;

export type ModerationResult = "ativo" | "em_moderacao" | "removido";

/**
 * Moderação de anúncio publicado/editado (RN-062, RN-090): filtro local + IA.
 * Sem IA, segue `MODERATION_WITHOUT_AI` (RN-113): fila manual ou, em dev, aprovação após o filtro.
 */
@Injectable()
export class AdModerationService {
  private readonly logger = new Logger(AdModerationService.name);

  constructor(
    @InjectRepository(Ad) private readonly ads: Repository<Ad>,
    @InjectRepository(AdModeration) private readonly moderations: Repository<AdModeration>,
    private readonly ai: AiService,
    private readonly uploads: UploadsService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async moderate(adId: string): Promise<ModerationResult | null> {
    const ad = await this.ads.findOne({
      where: { id: adId },
      relations: { category: true, images: { upload: true } },
    });
    if (ad?.status !== "em_moderacao") return null;

    const text = [ad.title, ad.description, ad.tags.join(" "), ad.availability ?? ""].join("\n");
    const local = moderateLocally(text);

    let aiResult: { data: ModerationOutput; model: string } | null = null;
    try {
      const images = [...ad.images]
        .sort((a, b) => a.position - b.position)
        .map((image) => image.upload);
      aiResult = await this.ai.structured({
        task: "moderation",
        promptVersion: MODERATION_PROMPT_VERSION,
        schemaName: "moderacao",
        schema: moderationOutputSchema,
        system: MODERATION_SYSTEM,
        userText: delimit(
          "anuncio",
          JSON.stringify({
            tipo: ad.type,
            categoria: ad.category.name,
            titulo: ad.title,
            descricao: ad.description,
            tags: ad.tags,
            disponibilidade: ad.availability,
          }),
        ),
        imageUrls: await this.uploads.forAi(images.slice(0, 4)),
        userId: ad.userId,
      });
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) throw error;
    }

    if (aiResult) {
      const { decisao, confianca, motivo, categorias_violadas } = aiResult.data;
      const result: ModerationResult =
        decisao === "proibido" && confianca >= REMOVE_CONFIDENCE
          ? "removido"
          : decisao === "aprovado" && local.decision === "aprovado"
            ? "ativo"
            : "em_moderacao";
      await this.record(ad, {
        decision: result === "ativo" ? "aprovado" : result === "removido" ? "proibido" : "revisar",
        decidedBy: "ia",
        categories: [...new Set([...categorias_violadas, ...local.categories])],
        reason: motivo || null,
        confidence: confianca,
        model: aiResult.model,
      });
      return this.apply(
        ad,
        result,
        result === "removido" ? motivo || "Conteúdo não permitido" : null,
      );
    }

    const approveWithoutAi =
      this.config.get("MODERATION_WITHOUT_AI", { infer: true }) === "approve";
    const result: ModerationResult =
      approveWithoutAi && local.decision === "aprovado" ? "ativo" : "em_moderacao";
    await this.record(ad, {
      decision: result === "ativo" ? "aprovado" : "revisar",
      decidedBy: "regras",
      categories: local.categories,
      reason: local.categories.length ? `Termos sinalizados: ${local.categories.join(", ")}` : null,
      confidence: null,
      model: null,
    });
    if (result === "em_moderacao") this.logger.log(`Anúncio ${ad.id} aguardando revisão manual`);
    return this.apply(ad, result, null);
  }

  private async record(
    ad: Ad,
    data: {
      decision: AdModeration["decision"];
      decidedBy: AdModeration["decidedBy"];
      categories: string[];
      reason: string | null;
      confidence: number | null;
      model: string | null;
    },
  ): Promise<void> {
    await this.moderations.save({
      adId: ad.id,
      decision: data.decision,
      decidedBy: data.decidedBy,
      violatedCategories: data.categories,
      reason: data.reason,
      confidence: data.confidence,
      model: data.model,
      promptVersion: data.decidedBy === "ia" ? MODERATION_PROMPT_VERSION : null,
    });
  }

  /** Aplica o resultado. Ao ativar pela primeira vez, começa a contar a validade (RN-063). */
  async apply(ad: Ad, result: ModerationResult, reason: string | null): Promise<ModerationResult> {
    if (result === "ativo") {
      const days = await this.settings.get("ads.activeDays");
      const now = new Date();
      await this.ads.update(ad.id, {
        status: "ativo",
        statusReason: null,
        publishedAt: ad.publishedAt ?? now,
        expiresAt:
          ad.expiresAt && ad.expiresAt > now
            ? ad.expiresAt
            : new Date(now.getTime() + days * 86_400_000),
      });
    } else if (result === "removido") {
      await this.ads.update(ad.id, { status: "removido", statusReason: reason });
    }
    return result;
  }
}
