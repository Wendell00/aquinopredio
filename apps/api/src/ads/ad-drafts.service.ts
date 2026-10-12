import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { AdDraft, GenerateAdDraftInput, ImprovedText, ImproveTextInput } from "@repo/shared";
import { generateAdDraftInputSchema, improveTextInputSchema } from "@repo/shared";
import { Repository } from "typeorm";
import { AiService, AiUnavailableError, delimit, type StructuredResult } from "../ai/ai.service";
import {
  AD_GENERATION_PROMPT_VERSION,
  AD_IMPROVE_PROMPT_VERSION,
  type AdGenerationOutput,
  adGenerationOutputSchema,
  adGenerationSystem,
  adImproveOutputSchema,
  adImproveSystem,
} from "../ai/prompts/ad-generation.prompt";
import { SettingsService } from "../settings/settings.service";
import { UploadsService } from "../uploads/uploads.service";
import type { User } from "../users/user.entity";
import { AiAdDraft, Category } from "./ad.entity";

const AI_UNAVAILABLE = "A IA está indisponível agora. Você pode criar o anúncio manualmente.";

@Injectable()
export class AdDraftsService {
  constructor(
    @InjectRepository(AiAdDraft) private readonly drafts: Repository<AiAdDraft>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    private readonly ai: AiService,
    private readonly uploads: UploadsService,
    private readonly settings: SettingsService,
  ) {}

  /** Gerações restantes hoje (RN-110). Gerar e melhorar contam no mesmo limite (RN-054). */
  async remainingToday(userId: string): Promise<number> {
    const limit = await this.settings.get("ai.dailyAdGenerations");
    const [row] = await this.drafts.query(
      `SELECT count(*)::int AS total FROM ai_ad_drafts
       WHERE user_id = $1 AND created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')`,
      [userId],
    );
    return Math.max(0, limit - (row?.total ?? 0));
  }

  /** Rascunho a partir de texto livre e fotos (RN-053). Nunca publica sozinho. */
  async generate(user: User, rawInput: GenerateAdDraftInput): Promise<AdDraft> {
    const input = generateAdDraftInputSchema.parse(rawInput);
    await this.assertQuota(user.id);
    const images = await this.uploads.claim(user.id, input.imageIds);
    const categories = await this.categories.find({
      where: { active: true },
      order: { sortOrder: "ASC" },
    });
    const names = categories.map((category) => category.name) as [string, ...string[]];
    const schema = adGenerationOutputSchema(names);

    let result: StructuredResult<AdGenerationOutput>;
    try {
      result = await this.ai.structured({
        task: "ad_generation",
        promptVersion: AD_GENERATION_PROMPT_VERSION,
        schemaName: "rascunho_anuncio",
        schema,
        system: adGenerationSystem(input.tone),
        userText: [
          delimit("texto_do_morador", input.text || "(sem texto, use só as fotos)"),
          `Fotos enviadas: ${images.length}`,
        ].join("\n\n"),
        imageUrls: await this.uploads.forAi(images),
        userId: user.id,
      });
    } catch (error) {
      if (error instanceof AiUnavailableError)
        throw new ServiceUnavailableException(AI_UNAVAILABLE);
      throw error;
    }

    const output = result.data;
    const draft = await this.drafts.save({
      userId: user.id,
      kind: "gerar",
      inputText: input.text || null,
      inputUploadIds: input.imageIds,
      tone: input.tone,
      output,
      model: result.model,
      promptVersion: AD_GENERATION_PROMPT_VERSION,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });

    const category = categories.find((item) => item.name === output.categoria) ?? null;
    const coverIndex = output.imagem_principal_sugerida;
    const priceCents = output.preco.valor === null ? null : Math.round(output.preco.valor * 100);
    return {
      draftId: draft.id,
      title: output.titulo,
      description: output.descricao,
      type: output.tipo,
      categoryId: category?.id ?? null,
      priceMode: output.preco.modo,
      priceCents,
      tags: output.tags.map((tag) => tag.toLowerCase()).slice(0, 8),
      availability: output.disponibilidade,
      toConfirm: output.campos_a_confirmar,
      warnings: output.alertas,
      coverImageId: coverIndex !== null ? (input.imageIds[coverIndex] ?? null) : null,
      remainingToday: await this.remainingToday(user.id),
    };
  }

  /** "Melhorar texto com IA" em anúncio escrito à mão (RN-055). */
  async improve(user: User, rawInput: ImproveTextInput): Promise<ImprovedText> {
    const input = improveTextInputSchema.parse(rawInput);
    await this.assertQuota(user.id);
    try {
      const result = await this.ai.structured({
        task: "ad_generation",
        promptVersion: AD_IMPROVE_PROMPT_VERSION,
        schemaName: "texto_melhorado",
        schema: adImproveOutputSchema,
        system: adImproveSystem(input.tone),
        userText: delimit(
          "anuncio",
          JSON.stringify({ titulo: input.title, descricao: input.description }),
        ),
        userId: user.id,
      });
      await this.drafts.save({
        userId: user.id,
        kind: "melhorar",
        inputText: `${input.title}\n\n${input.description}`,
        inputUploadIds: [],
        tone: input.tone,
        output: result.data,
        model: result.model,
        promptVersion: AD_IMPROVE_PROMPT_VERSION,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
      return {
        title: result.data.titulo || input.title,
        description: result.data.descricao,
        remainingToday: await this.remainingToday(user.id),
      };
    } catch (error) {
      if (error instanceof AiUnavailableError)
        throw new ServiceUnavailableException(AI_UNAVAILABLE);
      throw error;
    }
  }

  async linkToAd(draftId: string, userId: string, adId: string): Promise<boolean> {
    const result = await this.drafts.update({ id: draftId, userId }, { adId });
    return Boolean(result.affected);
  }

  private async assertQuota(userId: string): Promise<void> {
    if (!this.ai.enabled) throw new ServiceUnavailableException(AI_UNAVAILABLE);
    if ((await this.remainingToday(userId)) <= 0) {
      throw new HttpException(
        "Você usou todas as gerações com IA de hoje. Amanhã tem mais — ou crie o anúncio manualmente.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
