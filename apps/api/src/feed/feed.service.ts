import { Injectable, NotFoundException } from "@nestjs/common";
import type { AdDetail, FeedAd, FeedPage, FeedQuery } from "@repo/shared";
import { feedQuerySchema } from "@repo/shared";
import { DataSource } from "typeorm";
import { SettingsService } from "../settings/settings.service";
import { StorageService } from "../storage/storage.service";
import type { User } from "../users/user.entity";

const PAGE_SIZE = 20;

/** Distância aproximada (múltiplos de 50 m): nunca a posição exata de outro prédio (RN-034). */
export function approximateDistance(meters: number | null): number | null {
  return meters === null ? null : Math.round(meters / 50) * 50;
}

interface FeedRow {
  id: string;
  type: FeedAd["type"];
  title: string;
  price_mode: FeedAd["priceMode"];
  price_cents: number | null;
  same_building: boolean;
  building_name: string;
  distance_m: number;
  seller_verified: boolean;
  published_at: Date;
  category_id: string;
  category_name: string;
  category_slug: string;
  category_icon: string;
  cover_id: string | null;
  cover_key: string | null;
  cover_thumb: string | null;
  cover_width: number | null;
  cover_height: number | null;
  favorited: boolean;
}

/**
 * Regra central de visibilidade (RN-058), usada pelo feed e pelo detalhe:
 * o anúncio está ativo e (é do prédio do leitor OU o leitor está dentro do raio do anúncio),
 * não é do próprio leitor e não há bloqueio entre os dois (RN-074, RN-075).
 * Espera `a` (ads) e `v` (prédio do leitor, com `location`) na consulta.
 */
const VISIBLE = `
  a.status = 'ativo'
  AND a.user_id <> $1
  AND (a.building_id = v.id OR ST_DWithin(a.location, v.location, a.radius_m))
  AND NOT EXISTS (
    SELECT 1 FROM user_blocks ub
    WHERE (ub.blocker_id = $1 AND ub.blocked_id = a.user_id) OR (ub.blocker_id = a.user_id AND ub.blocked_id = $1)
  )`;

@Injectable()
export class FeedService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  /** Prédios de onde o usuário pode ver anúncios: vínculos ativos (RN-070). */
  private async viewerBuildings(userId: string): Promise<{ id: string; name: string }[]> {
    return this.dataSource.query(
      `SELECT b.id, b.name FROM building_memberships m JOIN buildings b ON b.id = m.building_id
       WHERE m.user_id = $1 AND m.status = 'ativo' AND b.status NOT IN ('rejeitado', 'arquivado')
       ORDER BY m.created_at`,
      [userId],
    );
  }

  async feed(user: User, rawQuery: FeedQuery): Promise<FeedPage> {
    const query = feedQuerySchema.parse(rawQuery);
    const buildings = await this.viewerBuildings(user.id);
    const building =
      buildings.find((item) => item.id === query.buildingId) ??
      buildings.find((item) => item.id === user.primaryBuildingId) ??
      buildings[0];
    if (!building) {
      return {
        items: [],
        nextCursor: null,
        building: null,
        notice:
          "Seu vínculo com o prédio ainda não foi aprovado. Assim que for, os anúncios aparecem aqui.",
      };
    }

    const radii = await this.settings.get("ads.radiiKm");
    const maxRadiusM = Math.max(...radii, 0) * 1000;
    const params: unknown[] = [user.id, building.id, maxRadiusM];
    const filters: string[] = [];
    const add = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (query.type) filters.push(`a.type = ${add(query.type)}`);
    if (query.categoryId) filters.push(`a.category_id = ${add(query.categoryId)}`);
    if (query.distanceKm !== undefined) {
      filters.push(
        query.distanceKm === 0
          ? "a.building_id = v.id"
          : `(a.building_id = v.id OR ST_DWithin(a.location, v.location, ${add(query.distanceKm * 1000)}))`,
      );
    }
    const effectivePrice = "(CASE WHEN a.price_mode = 'gratuito' THEN 0 ELSE a.price_cents END)";
    if (query.priceMin !== undefined) filters.push(`${effectivePrice} >= ${add(query.priceMin)}`);
    if (query.priceMax !== undefined) filters.push(`${effectivePrice} <= ${add(query.priceMax)}`);
    if (query.verifiedOnly) {
      filters.push(`EXISTS (SELECT 1 FROM building_memberships sm
        WHERE sm.user_id = a.user_id AND sm.building_id = a.building_id AND sm.verified_at IS NOT NULL)`);
    }
    if (query.q) {
      const term = add(query.q);
      filters.push(`(a.search_vector @@ websearch_to_tsquery('portuguese', f_unaccent(${term}))
        OR f_unaccent(lower(a.title)) LIKE '%' || f_unaccent(lower(${term})) || '%')`);
    }
    const offset = query.cursor ?? 0;

    const rows: FeedRow[] = await this.dataSource.query(
      `WITH v AS (SELECT id, location FROM buildings WHERE id = $2)
       SELECT a.id, a.type, a.title, a.price_mode, a.price_cents,
              a.building_id = v.id AS same_building, b.name AS building_name,
              ST_Distance(a.location, v.location) AS distance_m,
              EXISTS (SELECT 1 FROM building_memberships sm
                      WHERE sm.user_id = a.user_id AND sm.building_id = a.building_id AND sm.verified_at IS NOT NULL) AS seller_verified,
              COALESCE(a.published_at, a.created_at) AS published_at,
              c.id AS category_id, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
              cover.id AS cover_id, cover.key AS cover_key, cover.thumb_key AS cover_thumb,
              cover.width AS cover_width, cover.height AS cover_height,
              EXISTS (SELECT 1 FROM favorites f WHERE f.user_id = $1 AND f.ad_id = a.id) AS favorited
       FROM ads a
       CROSS JOIN v
       JOIN buildings b ON b.id = a.building_id
       JOIN categories c ON c.id = a.category_id
       LEFT JOIN LATERAL (
         SELECT u.id, u.key, u.thumb_key, u.width, u.height FROM ad_images i JOIN uploads u ON u.id = i.upload_id
         WHERE i.ad_id = a.id ORDER BY i.position LIMIT 1
       ) cover ON true
       WHERE ST_DWithin(a.location, v.location, $3)
         AND ${VISIBLE}
         ${filters.map((filter) => `AND ${filter}`).join("\n")}
       ORDER BY
         (a.building_id = v.id) DESC,
         CASE WHEN ST_Distance(a.location, v.location) <= 1000 THEN 1
              WHEN ST_Distance(a.location, v.location) <= 3000 THEN 2 ELSE 3 END,
         COALESCE(a.bumped_at, a.published_at, a.created_at) DESC,
         a.id
       LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`,
      params,
    );

    const hasMore = rows.length > PAGE_SIZE;
    return {
      items: rows.slice(0, PAGE_SIZE).map((row) => this.toFeedAd(row)),
      nextCursor: hasMore ? offset + PAGE_SIZE : null,
      building,
      notice: null,
    };
  }

  /** Ids de anúncios favoritados que o usuário ainda pode ver. */
  async favorites(user: User): Promise<FeedAd[]> {
    const buildings = await this.viewerBuildings(user.id);
    if (!buildings.length) return [];
    const rows: (FeedRow & { favorited_at: Date })[] = await this.dataSource.query(
      `SELECT DISTINCT ON (a.id) a.id, a.type, a.title, a.price_mode, a.price_cents,
              a.building_id = v.id AS same_building, b.name AS building_name,
              ST_Distance(a.location, v.location) AS distance_m,
              EXISTS (SELECT 1 FROM building_memberships sm
                      WHERE sm.user_id = a.user_id AND sm.building_id = a.building_id AND sm.verified_at IS NOT NULL) AS seller_verified,
              COALESCE(a.published_at, a.created_at) AS published_at,
              c.id AS category_id, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
              cover.id AS cover_id, cover.key AS cover_key, cover.thumb_key AS cover_thumb,
              cover.width AS cover_width, cover.height AS cover_height,
              true AS favorited, f.created_at AS favorited_at
       FROM favorites f
       JOIN ads a ON a.id = f.ad_id
       JOIN buildings v ON v.id = ANY($2::uuid[])
       JOIN buildings b ON b.id = a.building_id
       JOIN categories c ON c.id = a.category_id
       LEFT JOIN LATERAL (
         SELECT u.id, u.key, u.thumb_key, u.width, u.height FROM ad_images i JOIN uploads u ON u.id = i.upload_id
         WHERE i.ad_id = a.id ORDER BY i.position LIMIT 1
       ) cover ON true
       WHERE f.user_id = $1 AND ${VISIBLE}
       ORDER BY a.id, (a.building_id = v.id) DESC, ST_Distance(a.location, v.location)`,
      [user.id, buildings.map((building) => building.id)],
    );
    return rows
      .sort((a, b) => b.favorited_at.getTime() - a.favorited_at.getTime())
      .map((row) => this.toFeedAd(row));
  }

  /** Detalhe do anúncio: o dono sempre vê; os demais só se for visível de algum prédio deles. */
  async detail(user: User, adId: string): Promise<AdDetail> {
    const buildings = await this.viewerBuildings(user.id);
    const [row] = await this.dataSource.query(
      `SELECT a.*, b.name AS building_name, b.district AS building_district,
              c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
              u.name AS seller_name, u.image AS seller_image, u.created_at AS seller_since,
              EXISTS (SELECT 1 FROM building_memberships sm
                      WHERE sm.user_id = a.user_id AND sm.building_id = a.building_id AND sm.verified_at IS NOT NULL) AS seller_verified,
              EXISTS (SELECT 1 FROM favorites f WHERE f.user_id = $1 AND f.ad_id = a.id) AS favorited,
              EXISTS (SELECT 1 FROM user_blocks ub WHERE ub.blocker_id = $1 AND ub.blocked_id = a.user_id) AS blocked,
              view.same_building, view.distance_m
       FROM ads a
       JOIN buildings b ON b.id = a.building_id
       JOIN categories c ON c.id = a.category_id
       JOIN users u ON u.id = a.user_id
       LEFT JOIN LATERAL (
         SELECT a.building_id = v.id AS same_building, ST_Distance(a.location, v.location) AS distance_m
         FROM buildings v WHERE v.id = ANY($3::uuid[]) AND ${VISIBLE}
         ORDER BY (a.building_id = v.id) DESC, ST_Distance(a.location, v.location) LIMIT 1
       ) view ON true
       WHERE a.id = $2 AND a.status <> 'excluido'`,
      [user.id, adId, buildings.map((building) => building.id)],
    );
    const isOwner = row?.user_id === user.id;
    if (!row || (!isOwner && row.same_building === null))
      throw new NotFoundException("Anúncio não encontrado");

    const images: { id: string; key: string; thumb_key: string; width: number; height: number }[] =
      await this.dataSource.query(
        `SELECT u.id, u.key, u.thumb_key, u.width, u.height FROM ad_images i JOIN uploads u ON u.id = i.upload_id
         WHERE i.ad_id = $1 ORDER BY i.position`,
        [adId],
      );
    return {
      id: row.id,
      type: row.type,
      category: {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
        icon: row.category_icon,
      },
      title: row.title,
      description: row.description,
      priceMode: row.price_mode,
      priceCents: row.price_cents,
      availability: row.availability,
      tags: row.tags,
      images: images.map((image) => ({
        id: image.id,
        url: this.storage.url(image.key),
        thumbUrl: this.storage.url(image.thumb_key),
        width: image.width,
        height: image.height,
      })),
      status: row.status,
      building: {
        name: row.building_name,
        district: row.building_district,
        sameBuilding: isOwner || Boolean(row.same_building),
        distanceM: isOwner || row.same_building ? null : approximateDistance(row.distance_m),
      },
      seller: {
        id: row.user_id,
        name: row.seller_name,
        image: row.seller_image,
        verified: row.seller_verified,
        memberSince: new Date(row.seller_since).toISOString(),
      },
      whatsappEnabled: row.whatsapp_enabled,
      favorited: row.favorited,
      isOwner,
      blocked: row.blocked,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    };
  }

  private toFeedAd(row: FeedRow): FeedAd {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      priceMode: row.price_mode,
      priceCents: row.price_cents,
      cover:
        row.cover_id && row.cover_key && row.cover_thumb
          ? {
              id: row.cover_id,
              url: this.storage.url(row.cover_key),
              thumbUrl: this.storage.url(row.cover_thumb),
              width: row.cover_width ?? 0,
              height: row.cover_height ?? 0,
            }
          : null,
      category: {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
        icon: row.category_icon,
      },
      sameBuilding: row.same_building,
      buildingName: row.building_name,
      distanceM: row.same_building ? null : approximateDistance(row.distance_m),
      sellerVerified: row.seller_verified,
      publishedAt: new Date(row.published_at).toISOString(),
      favorited: row.favorited,
    };
  }
}
