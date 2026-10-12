import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  type AdFields,
  type AdFormOptions,
  type AdStatus,
  allowedRadii,
  type CreateAdInput,
  createAdInputSchema,
  type MyAd,
  type UpdateAdInput,
  updateAdInputSchema,
} from "@repo/shared";
import type { Queue } from "bullmq";
import { DataSource, In, Not, Repository } from "typeorm";
import { AiService } from "../ai/ai.service";
import { SettingsService } from "../settings/settings.service";
import { UploadsService } from "../uploads/uploads.service";
import type { User } from "../users/user.entity";
import { Ad, AdImage, Category } from "./ad.entity";
import { AdDraftsService } from "./ad-drafts.service";
import { AD_MODERATION_QUEUE, type AdModerationJob } from "./moderation/moderation.queue";

/** Estados que ocupam vaga no limite de anúncios ativos (RN-065). */
const COUNTS_AS_ACTIVE: AdStatus[] = ["ativo", "em_moderacao"];
const EDITABLE: AdStatus[] = ["em_moderacao", "ativo", "pausado", "expirado"];

interface PublishContext {
  buildingName: string;
  location: string;
  allowedRadiiKm: number[];
  buildingVerified: boolean;
  residentVerified: boolean;
}

@Injectable()
export class AdsService {
  constructor(
    @InjectRepository(Ad) private readonly ads: Repository<Ad>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly uploads: UploadsService,
    private readonly drafts: AdDraftsService,
    private readonly ai: AiService,
    @InjectQueue(AD_MODERATION_QUEUE) private readonly moderationQueue: Queue<AdModerationJob>,
  ) {}

  listCategories(): Promise<Category[]> {
    return this.categories.find({ where: { active: true }, order: { sortOrder: "ASC" } });
  }

  /** Tudo que o formulário de anúncio precisa saber de antemão. */
  async formOptions(user: User): Promise<AdFormOptions> {
    const [categories, buildings, activeAds, maxActiveAds, aiRemainingToday] = await Promise.all([
      this.listCategories(),
      this.publishableBuildings(user.id),
      this.ads.countBy({ userId: user.id, status: In(COUNTS_AS_ACTIVE) }),
      this.maxActiveAds(user.id),
      this.ai.enabled ? this.drafts.remainingToday(user.id) : Promise.resolve(0),
    ]);
    const blocked = this.publishBlockReason(user);
    return {
      categories: categories.map(({ id, name, slug, icon }) => ({ id, name, slug, icon })),
      buildings: buildings.map((building) => ({
        id: building.id,
        name: building.buildingName,
        allowedRadiiKm: building.allowedRadiiKm,
        buildingVerified: building.buildingVerified,
        residentVerified: building.residentVerified,
      })),
      activeAds,
      maxActiveAds,
      aiEnabled: this.ai.enabled,
      aiRemainingToday,
      hasPhone: Boolean(user.phone),
      canPublish: !blocked && buildings.length > 0,
      cannotPublishReason:
        blocked ??
        (buildings.length ? null : "Você precisa de um vínculo ativo com um prédio para anunciar."),
    };
  }

  async create(user: User, rawInput: CreateAdInput): Promise<MyAd> {
    const parsed = createAdInputSchema.parse(rawInput);
    const input: AdFields = parsed;
    this.assertCanPublish(user);
    await this.publishContext(user, input);
    await this.assertActiveLimit(user.id);
    await this.assertNotDuplicate(user.id, input);
    const images = await this.uploads.claim(user.id, input.imageIds);
    await this.assertCategory(input.categoryId);

    const adId = await this.dataSource.transaction(async (manager) => {
      const result: { id: string }[] = await manager.query(
        `INSERT INTO ads (user_id, building_id, type, category_id, title, description, price_mode, price_cents,
                          radius_m, location, whatsapp_enabled, availability, tags, status, ai_generated)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, b.location, $10, $11, $12, 'em_moderacao', $13
         FROM buildings b WHERE b.id = $2
         RETURNING id`,
        [
          user.id,
          input.buildingId,
          input.type,
          input.categoryId,
          input.title,
          input.description,
          input.priceMode,
          input.priceCents,
          Math.round(input.radiusKm * 1000),
          input.whatsappEnabled,
          input.availability,
          input.tags,
          Boolean(parsed.aiDraftId),
        ],
      );
      const id = result[0]?.id;
      if (!id) throw new NotFoundException("Prédio não encontrado");
      await manager
        .getRepository(AdImage)
        .save(images.map((upload, position) => ({ adId: id, uploadId: upload.id, position })));
      return id;
    });
    await this.uploads.markAttached(images.map((image) => image.id));
    if (parsed.aiDraftId) await this.drafts.linkToAd(parsed.aiDraftId, user.id, adId);
    await this.enqueueModeration(adId);
    return this.getMine(user.id, adId);
  }

  /** Edição (RN-064): título, descrição ou fotos alterados → nova moderação. */
  async update(user: User, adId: string, rawInput: UpdateAdInput): Promise<MyAd> {
    const input = updateAdInputSchema.parse(rawInput);
    const ad = await this.findOwned(user.id, adId, { images: true });
    if (!EDITABLE.includes(ad.status))
      throw new BadRequestException("Este anúncio não pode mais ser editado");
    if (ad.buildingId !== input.buildingId) {
      throw new BadRequestException("Para mudar o prédio do anúncio, crie um novo anúncio");
    }
    await this.publishContext(user, input);
    await this.assertNotDuplicate(user.id, input, adId);
    await this.assertCategory(input.categoryId);
    const currentUploadIds = [...ad.images]
      .sort((a, b) => a.position - b.position)
      .map((image) => image.uploadId);
    const images = await this.uploads.claim(user.id, input.imageIds, {
      allowAttachedTo: currentUploadIds,
    });

    // Tudo que a moderação lê conta como conteúdo (RN-064).
    const contentChanged =
      ad.title !== input.title ||
      ad.description !== input.description ||
      ad.type !== input.type ||
      ad.categoryId !== input.categoryId ||
      (ad.availability ?? null) !== input.availability ||
      ad.tags.join(",") !== input.tags.join(",") ||
      currentUploadIds.join(",") !== input.imageIds.join(",");
    const remoderate = contentChanged && (ad.status === "ativo" || ad.status === "em_moderacao");
    // Pausado/expirado: modera ao reativar (senão bastaria editar pausado e reativar).
    const deferModeration = contentChanged && !remoderate;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Ad).update(ad.id, {
        type: input.type,
        categoryId: input.categoryId,
        title: input.title,
        description: input.description,
        priceMode: input.priceMode,
        priceCents: input.priceCents,
        radiusM: Math.round(input.radiusKm * 1000),
        whatsappEnabled: input.whatsappEnabled,
        availability: input.availability,
        tags: input.tags,
        ...(remoderate
          ? {
              status: "em_moderacao" as const,
              statusReason: ad.manualReview ? ad.statusReason : null,
            }
          : {}),
        ...(deferModeration ? { needsModeration: true } : {}),
      });
      await manager.getRepository(AdImage).delete({ adId: ad.id });
      await manager
        .getRepository(AdImage)
        .save(images.map((upload, position) => ({ adId: ad.id, uploadId: upload.id, position })));
    });
    await this.uploads.markAttached(images.map((image) => image.id));
    if (remoderate) await this.enqueueModeration(ad.id);
    return this.getMine(user.id, ad.id);
  }

  async pause(user: User, adId: string): Promise<MyAd> {
    const ad = await this.findOwned(user.id, adId);
    if (ad.status !== "ativo")
      throw new BadRequestException("Só anúncios ativos podem ser pausados");
    await this.ads.update(ad.id, { status: "pausado" });
    return this.getMine(user.id, ad.id);
  }

  async resume(user: User, adId: string): Promise<MyAd> {
    const ad = await this.findOwned(user.id, adId);
    if (ad.status !== "pausado")
      throw new BadRequestException("Só anúncios pausados podem ser reativados");
    this.assertCanPublish(user);
    await this.assertMembership(user.id, ad.buildingId);
    await this.assertActiveLimit(user.id);
    if (ad.needsModeration) {
      await this.ads.update(ad.id, { status: "em_moderacao", needsModeration: false });
      await this.enqueueModeration(ad.id);
      return this.getMine(user.id, ad.id);
    }
    const expired = ad.expiresAt !== null && ad.expiresAt <= new Date();
    await this.ads.update(ad.id, { status: expired ? "expirado" : "ativo" });
    return this.getMine(user.id, ad.id);
  }

  /** Renovação gratuita de 1 clique: reinicia a validade (RN-063). */
  async renew(user: User, adId: string): Promise<MyAd> {
    const ad = await this.findOwned(user.id, adId);
    if (ad.status !== "ativo" && ad.status !== "expirado") {
      throw new BadRequestException("Só anúncios ativos ou expirados podem ser renovados");
    }
    this.assertCanPublish(user);
    await this.assertMembership(user.id, ad.buildingId);
    if (ad.status === "expirado") await this.assertActiveLimit(user.id);
    const days = await this.settings.get("ads.activeDays");
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    if (ad.needsModeration) {
      await this.ads.update(ad.id, {
        status: "em_moderacao",
        needsModeration: false,
        expiresAt,
        expiryWarnedAt: null,
      });
      await this.enqueueModeration(ad.id);
      return this.getMine(user.id, ad.id);
    }
    await this.ads.update(ad.id, { status: "ativo", expiresAt, expiryWarnedAt: null });
    return this.getMine(user.id, ad.id);
  }

  /** "Subir anúncio" no feed, 1 vez a cada 72 h (RN-067). */
  async bump(user: User, adId: string): Promise<MyAd> {
    const ad = await this.findOwned(user.id, adId);
    if (ad.status !== "ativo")
      throw new BadRequestException("Só anúncios ativos podem subir no feed");
    this.assertCanPublish(user);
    const canBumpAt = await this.canBumpAt(ad);
    if (canBumpAt && canBumpAt > new Date()) {
      throw new ConflictException(
        `Você poderá subir este anúncio de novo em ${formatWhen(canBumpAt)}`,
      );
    }
    await this.ads.update(ad.id, { bumpedAt: new Date() });
    return this.getMine(user.id, ad.id);
  }

  async remove(user: User, adId: string): Promise<void> {
    const ad = await this.findOwned(user.id, adId);
    await this.ads.update(ad.id, { status: "excluido" });
  }

  async listMine(userId: string): Promise<MyAd[]> {
    const ads = await this.ads.find({
      where: { userId, status: Not("excluido") },
      relations: { category: true, building: true, images: { upload: true } },
      order: { createdAt: "DESC" },
    });
    return Promise.all(ads.map((ad) => this.toMyAd(ad)));
  }

  async getMine(userId: string, adId: string): Promise<MyAd> {
    const ad = await this.ads.findOne({
      where: { id: adId, userId, status: Not("excluido") },
      relations: { category: true, building: true, images: { upload: true } },
    });
    if (!ad) throw new NotFoundException("Anúncio não encontrado");
    return this.toMyAd(ad);
  }

  // —— Regras ——

  private publishBlockReason(user: User): string | null {
    if (user.status === "suspenso") {
      const until = user.suspendedUntil ? ` até ${formatWhen(user.suspendedUntil)}` : "";
      return `Sua conta está suspensa para publicação${until}.`;
    }
    if (user.status !== "ativo") return "Conclua seu cadastro para anunciar.";
    return null;
  }

  /** RN-095: suspensão bloqueia publicar, renovar e subir. */
  private assertCanPublish(user: User): void {
    const reason = this.publishBlockReason(user);
    if (reason) throw new ForbiddenException(reason);
  }

  private async publishableBuildings(userId: string): Promise<(PublishContext & { id: string })[]> {
    const rows: {
      id: string;
      name: string;
      status: string;
      verified_at: Date | null;
      location: string;
    }[] = await this.dataSource.query(
      `SELECT b.id, b.name, b.status, m.verified_at, b.location::text AS location
         FROM building_memberships m JOIN buildings b ON b.id = m.building_id
         WHERE m.user_id = $1 AND m.status = 'ativo'
           AND b.status IN ('verificado', 'pendente_revisao', 'pendente_validacao')
         ORDER BY m.created_at`,
      [userId],
    );
    const radii = await this.settings.get("ads.radiiKm");
    const unverifiedMaxKm = await this.settings.get("ads.unverifiedMaxRadiusKm");
    return rows.map((row) => {
      const buildingVerified = row.status === "verificado";
      const residentVerified = row.verified_at !== null;
      return {
        id: row.id,
        buildingName: row.name,
        location: row.location,
        buildingVerified,
        residentVerified,
        allowedRadiiKm: allowedRadii({
          buildingVerified,
          residentVerified,
          radii,
          unverifiedMaxKm,
        }),
      };
    });
  }

  /** RN-050 (vínculo ativo) + RN-028/RN-059 (raio permitido). */
  private async publishContext(
    user: User,
    input: Pick<AdFields, "buildingId" | "radiusKm">,
  ): Promise<PublishContext> {
    const building = (await this.publishableBuildings(user.id)).find(
      (item) => item.id === input.buildingId,
    );
    if (!building)
      throw new ForbiddenException(
        "Você só pode anunciar a partir de um prédio em que mora (vínculo ativo).",
      );
    if (!building.allowedRadiiKm.includes(input.radiusKm)) {
      const reason = !building.buildingVerified
        ? "Enquanto o prédio está em verificação, o anúncio fica só para o seu prédio."
        : `Sem o selo de morador verificado, o raio máximo é ${Math.max(...building.allowedRadiiKm)} km.`;
      throw new ForbiddenException(reason);
    }
    return building;
  }

  private async assertMembership(userId: string, buildingId: string): Promise<void> {
    const found = (await this.publishableBuildings(userId)).some(
      (building) => building.id === buildingId,
    );
    if (!found)
      throw new ForbiddenException("Seu vínculo com o prédio deste anúncio não está ativo.");
  }

  private async maxActiveAds(userId: string): Promise<number> {
    const [row] = await this.dataSource.query(
      `SELECT EXISTS (SELECT 1 FROM building_memberships WHERE user_id = $1 AND status = 'ativo' AND verified_at IS NOT NULL) AS verified`,
      [userId],
    );
    return row?.verified
      ? this.settings.get("ads.maxActiveVerified")
      : this.settings.get("ads.maxActiveResident");
  }

  /** RN-065 */
  private async assertActiveLimit(userId: string): Promise<void> {
    const [active, max] = await Promise.all([
      this.ads.countBy({ userId, status: In(COUNTS_AS_ACTIVE) }),
      this.maxActiveAds(userId),
    ]);
    if (active >= max) {
      throw new ForbiddenException(
        `Você já tem ${max} anúncios ativos. Pause ou exclua um para publicar outro.`,
      );
    }
  }

  /** RN-066: mesmo usuário, texto > 90% parecido com outro anúncio ativo. */
  private async assertNotDuplicate(
    userId: string,
    input: Pick<AdFields, "title" | "description">,
    exceptId?: string,
  ): Promise<void> {
    const [row] = await this.dataSource.query(
      `SELECT max(similarity(lower(title || ' ' || description), lower($2))) AS score
       FROM ads WHERE user_id = $1 AND status IN ('ativo', 'em_moderacao') AND ($3::uuid IS NULL OR id <> $3)`,
      [userId, `${input.title} ${input.description}`, exceptId ?? null],
    );
    if (row?.score !== null && Number(row?.score) > 0.9) {
      throw new ConflictException("Você já tem um anúncio ativo muito parecido com este.");
    }
  }

  private async assertCategory(categoryId: string): Promise<void> {
    if (!(await this.categories.existsBy({ id: categoryId, active: true }))) {
      throw new BadRequestException("Categoria inválida");
    }
  }

  private async findOwned(
    userId: string,
    adId: string,
    relations: { images?: boolean } = {},
  ): Promise<Ad> {
    const ad = await this.ads.findOne({
      where: { id: adId, userId, status: Not("excluido") },
      relations,
    });
    if (!ad) throw new NotFoundException("Anúncio não encontrado");
    return ad;
  }

  private async enqueueModeration(adId: string): Promise<void> {
    await this.moderationQueue.add(
      "moderate",
      { adId },
      { attempts: 3, backoff: { type: "exponential", delay: 15_000 }, removeOnComplete: 1000 },
    );
  }

  private async canBumpAt(
    ad: Pick<Ad, "bumpedAt" | "publishedAt" | "status">,
  ): Promise<Date | null> {
    const reference = ad.bumpedAt ?? ad.publishedAt;
    if (!reference || ad.status !== "ativo") return null;
    const hours = await this.settings.get("ads.bumpIntervalHours");
    return new Date(reference.getTime() + hours * 3_600_000);
  }

  private async toMyAd(ad: Ad): Promise<MyAd> {
    const [stats] = await this.dataSource
      .query(
        `SELECT
         (SELECT count(*)::int FROM favorites f WHERE f.ad_id = $1) AS favorites,
         (SELECT count(*)::int FROM conversations c WHERE c.ad_id = $1) AS conversations`,
        [ad.id],
      )
      .catch(() => [{ favorites: 0, conversations: 0 }]);
    const canBumpAt = await this.canBumpAt(ad);
    return {
      id: ad.id,
      buildingId: ad.buildingId,
      buildingName: ad.building.name,
      type: ad.type,
      category: {
        id: ad.category.id,
        name: ad.category.name,
        slug: ad.category.slug,
        icon: ad.category.icon,
      },
      title: ad.title,
      description: ad.description,
      priceMode: ad.priceMode,
      priceCents: ad.priceCents,
      radiusKm: ad.radiusM / 1000,
      whatsappEnabled: ad.whatsappEnabled,
      availability: ad.availability,
      tags: ad.tags,
      images: [...(ad.images ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((image) => this.uploads.toImage(image.upload)),
      status: ad.status,
      statusReason: ad.statusReason,
      aiGenerated: ad.aiGenerated,
      expiresAt: ad.expiresAt?.toISOString() ?? null,
      bumpedAt: ad.bumpedAt?.toISOString() ?? null,
      canBumpAt: canBumpAt?.toISOString() ?? null,
      publishedAt: ad.publishedAt?.toISOString() ?? null,
      createdAt: ad.createdAt.toISOString(),
      stats: { favorites: stats?.favorites ?? 0, conversations: stats?.conversations ?? 0 },
    };
  }
}

function formatWhen(date: Date): string {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
