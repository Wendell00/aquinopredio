import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  BuildingSearchQuery,
  BuildingSummary,
  CreateBuildingInput,
  CreateBuildingResponse,
  DuplicateCheckInput,
  MyBuilding,
  ResubmitBuildingInput,
} from "@repo/shared";
import type { Queue } from "bullmq";
import { DataSource, In, Repository } from "typeorm";
import { SettingsService } from "../settings/settings.service";
import type { User } from "../users/user.entity";
import { UsersService } from "../users/users.service";
import { Building, BuildingMembership } from "./building.entity";
import {
  BUILDING_VERIFICATION_QUEUE,
  type BuildingVerificationJob,
} from "./verification/verification.queue";

/** Prédios que aparecem na busca e aceitam novos moradores (RN-021). */
const SEARCHABLE: Building["status"][] = ["verificado", "pendente_revisao"];
const OPEN_MEMBERSHIP: BuildingMembership["status"][] = ["pendente", "ativo"];

interface SummaryRow {
  id: string;
  name: string;
  type: Building["type"];
  street: string;
  district: string;
  city: string;
  state: string;
  status: Building["status"];
  distance_m: number | null;
  residents: number;
}

@Injectable()
export class BuildingsService {
  constructor(
    @InjectRepository(Building) private readonly buildings: Repository<Building>,
    @InjectRepository(BuildingMembership)
    private readonly memberships: Repository<BuildingMembership>,
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    @InjectQueue(BUILDING_VERIFICATION_QUEUE)
    private readonly verificationQueue: Queue<BuildingVerificationJob>,
  ) {}

  /** Busca por nome (sem acento, tolerante a erro de digitação), CEP ou proximidade (RN-020). */
  async search(query: BuildingSearchQuery): Promise<BuildingSummary[]> {
    const params: unknown[] = [SEARCHABLE];
    const where: string[] = ["b.status = ANY($1::building_status[])"];
    let distance = "NULL::float";
    let order = "b.name";

    if (query.lat !== undefined && query.lng !== undefined) {
      params.push(query.lng, query.lat);
      const point = `ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}), 4326)::geography`;
      distance = `ST_Distance(b.location, ${point})`;
      where.push(`ST_DWithin(b.location, ${point}, 2000)`);
      order = "distance_m";
    }
    if (query.cep) {
      params.push(query.cep);
      where.push(`b.cep = $${params.length}`);
    }
    if (query.q) {
      params.push(query.q);
      const term = `f_unaccent(lower($${params.length}))`;
      where.push(
        `(f_unaccent(lower(b.name)) % ${term} OR f_unaccent(lower(b.name)) LIKE '%' || ${term} || '%')`,
      );
      if (order === "b.name") order = `similarity(f_unaccent(lower(b.name)), ${term}) DESC`;
    }

    const rows: SummaryRow[] = await this.dataSource.query(
      `SELECT b.id, b.name, b.type, b.street, b.district, b.city, b.state, b.status,
              ${distance} AS distance_m,
              (SELECT count(*)::int FROM building_memberships m WHERE m.building_id = b.id AND m.status = 'ativo') AS residents
       FROM buildings b
       WHERE ${where.join(" AND ")}
       ORDER BY ${order}
       LIMIT 20`,
      params,
    );
    return rows.map(toSummary);
  }

  /** Candidatos a duplicidade: raio configurável ou mesmo CEP + número (RN-025). */
  async findDuplicates(input: DuplicateCheckInput): Promise<BuildingSummary[]> {
    const radius = await this.settings.get("buildings.duplicateRadiusM");
    const rows: SummaryRow[] = await this.dataSource.query(
      `SELECT b.id, b.name, b.type, b.street, b.district, b.city, b.state, b.status,
              ST_Distance(b.location, p.point) AS distance_m,
              (SELECT count(*)::int FROM building_memberships m WHERE m.building_id = b.id AND m.status = 'ativo') AS residents
       FROM buildings b, (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS point) p
       WHERE b.status <> 'rejeitado' AND b.status <> 'arquivado'
         AND (ST_DWithin(b.location, p.point, $3) OR (b.cep = $4 AND lower(b.number) = lower($5)))
       ORDER BY distance_m
       LIMIT 10`,
      [input.lng, input.lat, radius, input.cep, input.number],
    );
    return rows.map(toSummary);
  }

  async create(user: User, input: CreateBuildingInput): Promise<CreateBuildingResponse> {
    await this.assertCanAddBuilding(user.id);

    // RN-030: antifraude — limite de prédios criados por janela de 30 dias.
    const maxCreated = await this.settings.get("buildings.maxCreatedPer30Days");
    const created = await this.buildings
      .createQueryBuilder("b")
      .where("b.created_by = :userId AND b.created_at > now() - interval '30 days'", {
        userId: user.id,
      })
      .getCount();
    if (created >= maxCreated) {
      throw new ForbiddenException(
        `Você já cadastrou ${maxCreated} prédios nos últimos 30 dias. Tente mais tarde.`,
      );
    }

    if (!input.ignoreDuplicates) {
      const candidates = await this.findDuplicates(input);
      if (candidates.length) return { result: "duplicates", candidates };
    }

    const building = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(Building).save(
        manager.getRepository(Building).create({
          name: input.name,
          type: input.type,
          cep: input.cep,
          street: input.street,
          number: input.number,
          district: input.district,
          city: input.city,
          state: input.state,
          location: { type: "Point", coordinates: [input.lng, input.lat] },
          unitsEstimate: input.unitsEstimate ?? null,
          status: "pendente_validacao",
          joinPolicy: "automatica",
          createdBy: user.id,
          resubmissions: 0,
          lastActivityAt: new Date(),
        }),
      );
      // RN-031: quem cria vira administrador do prédio.
      await manager.getRepository(BuildingMembership).save(
        manager.getRepository(BuildingMembership).create({
          userId: user.id,
          buildingId: saved.id,
          unit: input.unit,
          role: "admin",
          status: "ativo",
          decidedAt: new Date(),
        }),
      );
      return saved;
    });

    await this.afterJoin(user, building.id);
    await this.enqueueVerification(building.id, "criacao");
    return { result: "created", building: await this.myBuilding(user.id, building.id) };
  }

  /** Pedido de vínculo com prédio existente (RN-022, RN-037). */
  async join(user: User, buildingId: string, unit: string): Promise<MyBuilding> {
    const building = await this.buildings.findOneBy({ id: buildingId });
    if (!building || !SEARCHABLE.includes(building.status))
      throw new NotFoundException("Prédio não encontrado");

    const existing = await this.memberships.findOneBy({ userId: user.id, buildingId });
    if (existing && OPEN_MEMBERSHIP.includes(existing.status)) {
      throw new ConflictException("Você já tem vínculo com este prédio");
    }
    if (existing?.status === "removido") {
      throw new ForbiddenException(
        "Você foi removido deste prédio. Fale com o administrador do prédio.",
      );
    }
    await this.assertCanAddBuilding(user.id);

    const status = building.joinPolicy === "automatica" ? "ativo" : "pendente";
    await this.memberships.save({
      ...(existing ?? {}),
      userId: user.id,
      buildingId,
      unit,
      role: "morador",
      status,
      decidedAt: status === "ativo" ? new Date() : null,
    });
    await this.buildings.update(buildingId, { lastActivityAt: new Date() });
    await this.afterJoin(user, buildingId);
    return this.myBuilding(user.id, buildingId);
  }

  /** Correção e reenvio de prédio rejeitado — uma vez (RN-029). */
  async resubmit(
    user: User,
    buildingId: string,
    input: ResubmitBuildingInput,
  ): Promise<MyBuilding> {
    const building = await this.buildings.findOneBy({ id: buildingId });
    if (!building || building.createdBy !== user.id)
      throw new NotFoundException("Prédio não encontrado");
    if (building.status !== "rejeitado")
      throw new BadRequestException("Só prédios recusados podem ser reenviados");
    const max = await this.settings.get("buildings.maxResubmissions");
    if (building.resubmissions >= max) {
      throw new ForbiddenException(
        "Este prédio já foi reenviado. Fale com o suporte para uma nova análise.",
      );
    }

    await this.buildings.update(buildingId, {
      name: input.name,
      type: input.type,
      cep: input.cep,
      street: input.street,
      number: input.number,
      district: input.district,
      city: input.city,
      state: input.state,
      location: { type: "Point", coordinates: [input.lng, input.lat] },
      unitsEstimate: input.unitsEstimate ?? null,
      status: "pendente_validacao",
      rejectionReason: null,
      suggestedName: null,
      resubmissions: building.resubmissions + 1,
    });
    await this.memberships.update({ userId: user.id, buildingId }, { status: "ativo" });
    await this.afterJoin(user, buildingId);
    await this.enqueueVerification(buildingId, "reenvio");
    return this.myBuilding(user.id, buildingId);
  }

  async myBuildings(userId: string): Promise<MyBuilding[]> {
    const user = await this.users.findById(userId);
    const memberships = await this.memberships.find({
      where: { userId, status: In(["pendente", "ativo", "recusado"]) },
      relations: { building: true },
      order: { createdAt: "ASC" },
    });
    const counts = await this.residentCounts(memberships.map((m) => m.buildingId));
    const maxResubmissions = await this.settings.get("buildings.maxResubmissions");
    return memberships.map((m) =>
      toMyBuilding(m, user?.primaryBuildingId ?? null, counts, maxResubmissions, userId),
    );
  }

  async myBuilding(userId: string, buildingId: string): Promise<MyBuilding> {
    const found = (await this.myBuildings(userId)).find((item) => item.building.id === buildingId);
    if (!found) throw new NotFoundException("Prédio não encontrado");
    return found;
  }

  /** Troca o prédio principal (RN-039): precisa de vínculo ativo ou pendente. */
  async setPrimary(user: User, buildingId: string): Promise<void> {
    const membership = await this.memberships.findOneBy({ userId: user.id, buildingId });
    if (!membership || !OPEN_MEMBERSHIP.includes(membership.status)) {
      throw new NotFoundException("Você não tem vínculo com este prédio");
    }
    await this.users.setPrimaryBuilding(user.id, buildingId);
  }

  /** RN-035: limite de prédios por usuário (principal + adicionais). */
  private async assertCanAddBuilding(userId: string): Promise<void> {
    const max = await this.settings.get("buildings.maxPerUser");
    const current = await this.memberships.countBy({ userId, status: In(OPEN_MEMBERSHIP) });
    if (current >= max) {
      throw new ForbiddenException(
        `Você pode participar de até ${max} prédios. Saia de um para entrar em outro.`,
      );
    }
  }

  /** Conclui o onboarding (RN-005) e define o prédio principal na primeira vez. */
  private async afterJoin(user: User, buildingId: string): Promise<void> {
    if (!user.primaryBuildingId) {
      await this.users.setPrimaryBuilding(user.id, buildingId);
      user.primaryBuildingId = buildingId;
    }
    await this.users.activate(user.id);
  }

  private async enqueueVerification(
    buildingId: string,
    reason: BuildingVerificationJob["reason"],
  ): Promise<void> {
    await this.verificationQueue.add(
      "verify",
      { buildingId, reason },
      {
        jobId: `${buildingId}-${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 1000,
      },
    );
  }

  private async residentCounts(buildingIds: string[]): Promise<Map<string, number>> {
    if (!buildingIds.length) return new Map();
    const rows: { building_id: string; total: number }[] = await this.dataSource.query(
      `SELECT building_id, count(*)::int AS total FROM building_memberships
       WHERE building_id = ANY($1::uuid[]) AND status = 'ativo' GROUP BY building_id`,
      [buildingIds],
    );
    return new Map(rows.map((row) => [row.building_id, row.total]));
  }
}

function toSummary(row: SummaryRow): BuildingSummary {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    street: row.street,
    district: row.district,
    city: row.city,
    state: row.state,
    status: row.status,
    distanceM: row.distance_m === null ? null : Math.round(row.distance_m),
    residents: row.residents,
  };
}

function toMyBuilding(
  membership: BuildingMembership,
  primaryBuildingId: string | null,
  counts: Map<string, number>,
  maxResubmissions: number,
  userId: string,
): MyBuilding {
  const b = membership.building;
  return {
    membershipId: membership.id,
    unit: membership.unit,
    role: membership.role,
    status: membership.status,
    isPrimary: primaryBuildingId === b.id,
    verifiedResident: membership.verifiedAt !== null,
    building: {
      id: b.id,
      name: b.name,
      type: b.type,
      street: b.street,
      number: b.number,
      district: b.district,
      city: b.city,
      state: b.state,
      cep: b.cep,
      lng: b.location.coordinates[0],
      lat: b.location.coordinates[1],
      status: b.status,
      joinPolicy: b.joinPolicy,
      rejectionReason: b.rejectionReason,
      suggestedName: b.suggestedName,
      canResubmit:
        b.status === "rejeitado" && b.createdBy === userId && b.resubmissions < maxResubmissions,
      residents: counts.get(b.id) ?? 0,
    },
  };
}
