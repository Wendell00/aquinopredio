import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { BuildingAd, BuildingAdminView, JoinPolicy, MemberAction } from "@repo/shared";
import { DataSource, type EntityManager } from "typeorm";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";
import type { User } from "../users/user.entity";

interface MemberRow {
  membership_id: string;
  user_id: string;
  name: string;
  image: string | null;
  unit: string;
  role: "morador" | "admin";
  status: "pendente" | "ativo" | "recusado" | "removido";
  verified_at: Date | null;
  created_at: Date;
}

/** Ações do administrador do prédio (RN-037 a RN-041, RN-094). */
@Injectable()
export class BuildingAdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Só administradores com vínculo ativo administram o prédio. */
  private async assertAdmin(user: User, buildingId: string): Promise<void> {
    const [row] = await this.dataSource.query(
      `SELECT 1 FROM building_memberships WHERE user_id = $1 AND building_id = $2 AND role = 'admin' AND status = 'ativo'`,
      [user.id, buildingId],
    );
    if (!row && user.role !== "platform_admin")
      throw new ForbiddenException("Só administradores do prédio podem fazer isso");
  }

  async view(user: User, buildingId: string): Promise<BuildingAdminView> {
    await this.assertAdmin(user, buildingId);
    const [building] = await this.dataSource.query(
      `SELECT id, name, type, status, join_policy, district, city FROM buildings WHERE id = $1`,
      [buildingId],
    );
    if (!building) throw new NotFoundException("Prédio não encontrado");
    const members: MemberRow[] = await this.dataSource.query(
      `SELECT m.id AS membership_id, m.user_id, u.name, u.image, m.unit, m.role, m.status, m.verified_at, m.created_at
       FROM building_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.building_id = $1 AND m.status IN ('pendente', 'ativo') AND u.status NOT IN ('excluido', 'banido')
       ORDER BY (m.status = 'pendente') DESC, m.role, u.name`,
      [buildingId],
    );
    return {
      building: {
        id: building.id,
        name: building.name,
        type: building.type,
        status: building.status,
        joinPolicy: building.join_policy,
        district: building.district,
        city: building.city,
      },
      members: members.map((row) => ({
        membershipId: row.membership_id,
        userId: row.user_id,
        name: row.name,
        image: row.image,
        unit: row.unit,
        role: row.role,
        status: row.status,
        verified: row.verified_at !== null,
        requestedAt: row.created_at.toISOString(),
        isMe: row.user_id === user.id,
      })),
      admins: members.filter((row) => row.role === "admin" && row.status === "ativo").length,
      maxAdmins: await this.settings.get("buildings.maxAdmins"),
      autoApproveDays: await this.settings.get("buildings.autoApproveJoinDays"),
    };
  }

  async updateSettings(user: User, buildingId: string, joinPolicy: JoinPolicy): Promise<void> {
    await this.assertAdmin(user, buildingId);
    await this.dataSource.query(
      `UPDATE buildings SET join_policy = $2, updated_at = now() WHERE id = $1`,
      [buildingId, joinPolicy],
    );
    await this.audit.log(
      user.id,
      "predio.politica",
      { type: "building", id: buildingId },
      { joinPolicy },
    );
  }

  async memberAction(
    user: User,
    buildingId: string,
    membershipId: string,
    action: MemberAction,
  ): Promise<void> {
    await this.assertAdmin(user, buildingId);
    const [member] = await this.dataSource.query(
      `SELECT m.*, b.name AS building_name FROM building_memberships m JOIN buildings b ON b.id = m.building_id
       WHERE m.id = $1 AND m.building_id = $2`,
      [membershipId, buildingId],
    );
    if (!member) throw new NotFoundException("Morador não encontrado");
    if (member.user_id === user.id && action !== "verificar")
      throw new BadRequestException("Use a opção de renunciar");

    await this.dataSource.transaction(async (manager) => {
      switch (action) {
        case "aprovar":
        case "recusar": {
          if (member.status !== "pendente")
            throw new BadRequestException("Este pedido já foi respondido");
          const status = action === "aprovar" ? "ativo" : "recusado";
          await manager.query(
            `UPDATE building_memberships SET status = $2, decided_at = now(), updated_at = now() WHERE id = $1`,
            [membershipId, status],
          );
          if (status === "recusado") await this.reconcileUser(manager, member.user_id);
          void this.notifications.notify(member.user_id, {
            type: "vinculo_atualizado",
            title:
              action === "aprovar"
                ? "Você entrou no prédio"
                : "Pedido para entrar no prédio recusado",
            body:
              action === "aprovar"
                ? `Seu vínculo com “${member.building_name}” foi aprovado.`
                : `O administrador de “${member.building_name}” recusou o pedido. Confira se escolheu o prédio certo.`,
            url: action === "aprovar" ? "/inicio" : "/perfil",
          });
          break;
        }
        case "verificar":
        case "remover_selo": {
          if (member.status !== "ativo")
            throw new BadRequestException("O morador precisa estar com vínculo ativo");
          // RN-038 (a): selo concedido pelo administrador.
          await manager.query(
            `UPDATE building_memberships SET verified_at = $2, verified_method = $3, updated_at = now() WHERE id = $1`,
            [
              membershipId,
              action === "verificar" ? new Date() : null,
              action === "verificar" ? "admin" : null,
            ],
          );
          break;
        }
        case "remover": {
          if (member.role === "admin")
            throw new ForbiddenException("Não é possível remover outro administrador");
          // RN-040: morador removido, anúncios naquele prédio pausados.
          await manager.query(
            `UPDATE building_memberships SET status = 'removido', updated_at = now() WHERE id = $1`,
            [membershipId],
          );
          await manager.query(
            `UPDATE ads SET status = 'pausado', updated_at = now() WHERE user_id = $1 AND building_id = $2 AND status IN ('ativo', 'em_moderacao')`,
            [member.user_id, buildingId],
          );
          await this.reconcileUser(manager, member.user_id);
          void this.notifications.notify(member.user_id, {
            type: "vinculo_atualizado",
            title: "Você foi removido de um prédio",
            body: `Seu vínculo com “${member.building_name}” foi encerrado pelo administrador. Seus anúncios de lá foram pausados.`,
            url: "/perfil",
          });
          break;
        }
        case "promover": {
          // RN-041: até 3 administradores, só moradores verificados.
          if (member.status !== "ativo" || !member.verified_at) {
            throw new BadRequestException("Só moradores verificados podem virar administradores");
          }
          const [{ admins }] = await manager.query(
            `SELECT count(*)::int AS admins FROM building_memberships WHERE building_id = $1 AND role = 'admin' AND status = 'ativo'`,
            [buildingId],
          );
          if (admins >= (await this.settings.get("buildings.maxAdmins"))) {
            throw new ForbiddenException("O prédio já tem o número máximo de administradores");
          }
          await manager.query(
            `UPDATE building_memberships SET role = 'admin', updated_at = now() WHERE id = $1`,
            [membershipId],
          );
          break;
        }
      }
      await this.audit.log(
        user.id,
        `morador.${action}`,
        { type: "membership", id: membershipId },
        { buildingId },
        manager,
      );
    });
  }

  /** RN-041: renunciar; se ninguém sobrar, o morador verificado mais antigo assume. */
  async resign(user: User, buildingId: string): Promise<void> {
    await this.assertAdmin(user, buildingId);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE building_memberships SET role = 'morador', updated_at = now() WHERE building_id = $1 AND user_id = $2`,
        [buildingId, user.id],
      );
      const [{ admins }] = await manager.query(
        `SELECT count(*)::int AS admins FROM building_memberships WHERE building_id = $1 AND role = 'admin' AND status = 'ativo'`,
        [buildingId],
      );
      if (admins === 0) {
        await manager.query(
          `UPDATE building_memberships SET role = 'admin', updated_at = now()
           WHERE id = (SELECT id FROM building_memberships
                       WHERE building_id = $1 AND status = 'ativo' AND verified_at IS NOT NULL AND user_id <> $2
                       ORDER BY created_at LIMIT 1)`,
          [buildingId, user.id],
        );
      }
      await this.audit.log(
        user.id,
        "admin.renuncia",
        { type: "building", id: buildingId },
        {},
        manager,
      );
    });
  }

  async ads(user: User, buildingId: string): Promise<BuildingAd[]> {
    await this.assertAdmin(user, buildingId);
    const rows: {
      id: string;
      title: string;
      status: BuildingAd["status"];
      seller: string;
      created_at: Date;
      report_count: number;
    }[] = await this.dataSource.query(
      `SELECT a.id, a.title, a.status, u.name AS seller, a.created_at, a.report_count
         FROM ads a JOIN users u ON u.id = a.user_id
         WHERE a.building_id = $1 AND a.status IN ('ativo', 'em_moderacao', 'pausado')
         ORDER BY a.report_count DESC, a.created_at DESC LIMIT 100`,
      [buildingId],
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      sellerName: row.seller,
      createdAt: row.created_at.toISOString(),
      reportCount: row.report_count,
    }));
  }

  /** RN-094: o admin oculta anúncios do próprio prédio; vão para revisão da plataforma. */
  async hideAd(user: User, buildingId: string, adId: string): Promise<void> {
    await this.assertAdmin(user, buildingId);
    const [ad] = await this.dataSource.query(
      `SELECT id, user_id, title FROM ads WHERE id = $1 AND building_id = $2`,
      [adId, buildingId],
    );
    if (!ad) throw new NotFoundException("Anúncio não encontrado neste prédio");
    await this.dataSource.query(
      `UPDATE ads SET status = 'em_moderacao', status_reason = 'Ocultado pelo administrador do prédio. Em revisão pela equipe.', manual_review = true, updated_at = now()
       WHERE id = $1 AND status IN ('ativo', 'pausado')`,
      [adId],
    );
    await this.audit.log(
      user.id,
      "anuncio.ocultar_predio",
      { type: "ad", id: adId },
      { buildingId },
    );
  }

  /** Recalcula o estado do usuário depois de perder um vínculo (RN-005, RN-039). */
  private async reconcileUser(manager: EntityManager, userId: string): Promise<void> {
    await manager.query(
      `UPDATE users u SET
         primary_building_id = (
           SELECT m.building_id FROM building_memberships m JOIN buildings b ON b.id = m.building_id
           WHERE m.user_id = u.id AND m.status IN ('ativo', 'pendente') AND b.status NOT IN ('rejeitado', 'arquivado')
           ORDER BY (m.building_id = u.primary_building_id) DESC NULLS LAST, m.created_at LIMIT 1),
         updated_at = now()
       WHERE u.id = $1`,
      [userId],
    );
    await manager.query(
      `UPDATE users SET status = 'onboarding_pendente' WHERE id = $1 AND status = 'ativo' AND primary_building_id IS NULL`,
      [userId],
    );
  }
}
