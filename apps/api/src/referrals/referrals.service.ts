import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  type CreateReferralInput,
  createReferralInputSchema,
  type Referral,
  type ReferralPage,
  type ReferralQuery,
  referralQuerySchema,
} from "@repo/shared";
import { DataSource } from "typeorm";
import { containsExternalLink, moderateLocally } from "../ads/moderation/moderation.rules";
import { SettingsService } from "../settings/settings.service";
import type { User } from "../users/user.entity";

const PAGE_SIZE = 20;

interface ReferralRow {
  id: string;
  service: string;
  provider_name: string;
  provider_phone: string;
  author_id: string;
  author_name: string;
  author_username: string | null;
  same_building: boolean;
  building_name: string;
  created_at: Date;
}

/**
 * Indicação visível para o leitor do prédio `v` (RN-089): ativa, do mesmo prédio ou de um prédio
 * dentro do alcance configurado, de autor ativo e sem bloqueio entre os dois (RN-075).
 * Espera `r` (service_referrals), `b` (prédio da indicação), `v` (prédio do leitor),
 * `$1` = leitor e `$2` = alcance em metros.
 */
const VISIBLE = `
  r.status = 'ativa'
  AND (r.building_id = v.id OR ST_DWithin(b.location, v.location, $2))
  AND u.status IN ('ativo', 'suspenso')
  AND NOT EXISTS (
    SELECT 1 FROM user_blocks ub
    WHERE (ub.blocker_id = $1 AND ub.blocked_id = r.author_id) OR (ub.blocker_id = r.author_id AND ub.blocked_id = $1)
  )`;

const SELECT = `
  SELECT r.id, r.service, r.provider_name, r.provider_phone, r.author_id, r.created_at,
         u.name AS author_name, u.username AS author_username,
         r.building_id = v.id AS same_building, b.name AS building_name
  FROM service_referrals r
  JOIN users u ON u.id = r.author_id
  JOIN buildings b ON b.id = r.building_id`;

/** Indicações de prestadores de fora do app (RN-089). */
@Injectable()
export class ReferralsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
  ) {}

  private async viewerBuildings(userId: string): Promise<{ id: string }[]> {
    return this.dataSource.query(
      `SELECT b.id FROM building_memberships m JOIN buildings b ON b.id = m.building_id
       WHERE m.user_id = $1 AND m.status = 'ativo' AND b.status NOT IN ('rejeitado', 'arquivado')
       ORDER BY m.created_at`,
      [userId],
    );
  }

  private async pickBuilding(user: User, buildingId?: string): Promise<string | null> {
    const buildings = await this.viewerBuildings(user.id);
    const building =
      buildings.find((item) => item.id === buildingId) ??
      buildings.find((item) => item.id === user.primaryBuildingId) ??
      buildings[0];
    return building?.id ?? null;
  }

  private async radiusM(): Promise<number> {
    return (await this.settings.get("referrals.radiusKm")) * 1000;
  }

  async list(user: User, rawQuery: ReferralQuery): Promise<ReferralPage> {
    const query = referralQuerySchema.parse(rawQuery);
    const buildingId = await this.pickBuilding(user, query.buildingId);
    if (!buildingId) return { items: [], nextCursor: null };

    const params: unknown[] = [user.id, await this.radiusM(), buildingId];
    let search = "";
    if (query.q) {
      params.push(query.q);
      search = `AND (f_unaccent(lower(r.service)) LIKE '%' || f_unaccent(lower($4)) || '%'
                  OR f_unaccent(lower(r.provider_name)) LIKE '%' || f_unaccent(lower($4)) || '%')`;
    }
    const offset = query.cursor ?? 0;
    const rows: ReferralRow[] = await this.dataSource.query(
      `WITH v AS (SELECT id, location FROM buildings WHERE id = $3)
       ${SELECT} CROSS JOIN v
       WHERE ${VISIBLE} ${search}
       ORDER BY (r.building_id = v.id) DESC, r.created_at DESC, r.id
       LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`,
      params,
    );
    const hasMore = rows.length > PAGE_SIZE;
    return {
      items: rows.slice(0, PAGE_SIZE).map((row) => toReferral(row, user.id)),
      nextCursor: hasMore ? offset + PAGE_SIZE : null,
    };
  }

  async create(user: User, rawInput: CreateReferralInput): Promise<Referral> {
    const input = createReferralInputSchema.parse(rawInput);
    if (user.status !== "ativo") throw new ForbiddenException("Sua conta não pode indicar agora.");
    const buildingId = await this.pickBuilding(user, input.buildingId);
    if (!buildingId || (input.buildingId && input.buildingId !== buildingId)) {
      throw new ForbiddenException("Você só pode indicar a partir de um prédio onde mora.");
    }
    assertClean(`${input.service} ${input.providerName}`);

    const [{ count }] = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM service_referrals
       WHERE author_id = $1 AND created_at > now() - interval '1 day'`,
      [user.id],
    );
    const limit = await this.settings.get("referrals.maxPerDay");
    if (count >= limit) {
      throw new HttpException(
        `Você chegou ao limite de ${limit} indicações por dia. Tente amanhã.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let id: string;
    try {
      [{ id }] = await this.dataSource.query(
        `INSERT INTO service_referrals (author_id, building_id, service, provider_name, provider_phone)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [user.id, buildingId, input.service, input.providerName, input.providerPhone],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ConflictException("Esse contato já foi indicado no seu prédio.");
      }
      throw error;
    }
    const [row] = await this.dataSource.query(
      `WITH v AS (SELECT id FROM buildings WHERE id = $2) ${SELECT} CROSS JOIN v WHERE r.id = $1`,
      [id, buildingId],
    );
    return toReferral(row, user.id);
  }

  /** Quem indicou pode apagar a qualquer momento. */
  async remove(user: User, id: string): Promise<void> {
    const [{ count }] = await this.dataSource.query(
      `WITH deleted AS (DELETE FROM service_referrals WHERE id = $1 AND author_id = $2 RETURNING id)
       SELECT count(*)::int AS count FROM deleted`,
      [id, user.id],
    );
    if (!count) throw new NotFoundException("Indicação não encontrada");
  }

  /** Para denúncias: o leitor precisa conseguir ver a indicação a partir de algum prédio dele. */
  async assertVisible(user: User, id: string): Promise<{ isMine: boolean }> {
    const buildings = await this.viewerBuildings(user.id);
    const [row] = await this.dataSource.query(
      `SELECT r.author_id FROM service_referrals r
       JOIN users u ON u.id = r.author_id
       JOIN buildings b ON b.id = r.building_id
       JOIN buildings v ON v.id = ANY($3::uuid[])
       WHERE r.id = $4 AND ${VISIBLE}
       LIMIT 1`,
      [user.id, await this.radiusM(), buildings.map((item) => item.id), id],
    );
    if (!row) throw new NotFoundException("Indicação não encontrada");
    return { isMine: row.author_id === user.id };
  }
}

function toReferral(row: ReferralRow, viewerId: string): Referral {
  return {
    id: row.id,
    service: row.service,
    providerName: row.provider_name,
    providerPhone: row.provider_phone,
    author: { name: row.author_name, username: row.author_username },
    sameBuilding: row.same_building,
    buildingName: row.building_name,
    createdAt: new Date(row.created_at).toISOString(),
    isMine: row.author_id === viewerId,
  };
}

/** O texto fica visível para vizinhos: sem links nem termos que a moderação barra (RN-091). */
function assertClean(text: string): void {
  if (containsExternalLink(text)) {
    throw new BadRequestException("A indicação não pode ter links.");
  }
  if (moderateLocally(text).decision !== "aprovado") {
    throw new BadRequestException("A indicação tem termos que não são permitidos no app.");
  }
}
