import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminAd,
  AdminBuilding,
  AdminMetrics,
  AdminReport,
  AdminSetting,
  AdminUser,
  ResolveReport,
  SanctionInput,
  SanctionType,
} from "@repo/shared";
import { sanctionInputSchema } from "@repo/shared";
import { DataSource } from "typeorm";
import { AdModerationService } from "../ads/moderation/ad-moderation.service";
import { AuditService } from "../audit/audit.service";
import { identityHash } from "../auth/auth";
import { BuildingVerificationService } from "../buildings/verification/building-verification.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SETTINGS_DEFAULTS, type SettingKey } from "../settings/settings.defaults";
import { SettingsService } from "../settings/settings.service";
import { StorageService } from "../storage/storage.service";
import type { User } from "../users/user.entity";

const SUSPENSION_DAYS = 7;

interface BuildingRow {
  id: string;
  name: string;
  type: AdminBuilding["type"];
  status: AdminBuilding["status"];
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  cep: string;
  lat: number;
  lng: number;
  created_at: Date;
  creator_name: string | null;
  residents: number;
  score: string | null;
  decision: string | null;
  decided_by: string;
  input: { regras?: { evidence?: string[]; risks?: string[] } } | null;
  output: ({ evidencias?: string[]; sinais_de_risco?: string[] } & Record<string, unknown>) | null;
  verified_at: Date;
}

interface AdRow {
  id: string;
  title: string;
  description: string;
  status: AdminAd["status"];
  status_reason: string | null;
  user_id: string;
  report_count: number;
  created_at: Date;
  seller_name: string;
  building_name: string;
  thumbs: string[];
  mod_decision: string | null;
  mod_by: string;
  mod_reason: string | null;
  mod_categories: string[];
}

interface ReportRow {
  id: string;
  target_type: string;
  target_id: string;
  reason: AdminReport["reason"];
  details: string | null;
  created_at: Date;
  reporter_name: string | null;
  same_target: number;
  target_label: string | null;
  target_user_id: string | null;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  status: AdminUser["status"];
  role: AdminUser["role"];
  created_at: Date;
  suspended_until: Date | null;
  active_ads: number;
  open_reports: number;
  sanctions: { type: SanctionType; reason: string; createdAt: string }[];
}

/** Próxima sanção da escada (RN-095): aviso → suspensão de 7 dias → banimento. */
export function nextSanction(previous: number, grave: boolean): SanctionType {
  if (grave || previous >= 2) return "banimento";
  return previous === 1 ? "suspensao" : "aviso";
}

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly verification: BuildingVerificationService,
    private readonly moderation: AdModerationService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async metrics(): Promise<AdminMetrics> {
    const [row] = await this.dataSource.query(`
      SELECT
        (SELECT count(*)::int FROM users WHERE status <> 'excluido') AS users_total,
        (SELECT count(*)::int FROM users WHERE status = 'ativo') AS users_active,
        (SELECT count(*)::int FROM users WHERE status = 'onboarding_pendente') AS users_onboarding,
        (SELECT count(*)::int FROM users WHERE status = 'suspenso') AS users_suspended,
        (SELECT count(*)::int FROM users WHERE status = 'banido') AS users_banned,
        (SELECT count(*)::int FROM buildings WHERE status = 'verificado') AS b_verified,
        (SELECT count(*)::int FROM buildings WHERE status = 'pendente_revisao') AS b_review,
        (SELECT count(*)::int FROM buildings WHERE status = 'rejeitado') AS b_rejected,
        (SELECT count(*)::int FROM ads WHERE status = 'ativo') AS ads_active,
        (SELECT count(*)::int FROM ads WHERE status = 'em_moderacao') AS ads_moderation,
        (SELECT coalesce(avg(ai_generated::int), 0)::float FROM ads WHERE status NOT IN ('excluido', 'rascunho')) AS ai_share,
        (SELECT count(*)::int FROM conversations WHERE created_at > now() - interval '30 days') AS conversations30d,
        (SELECT count(*)::int FROM reports WHERE status = 'aberta') AS reports_open,
        (SELECT count(*)::int FROM ai_calls WHERE created_at > now() - interval '30 days') AS ai_calls,
        (SELECT count(*)::int FROM ai_calls WHERE created_at > now() - interval '30 days' AND NOT success) AS ai_failures,
        (SELECT coalesce(sum(tokens_in), 0)::int FROM ai_calls WHERE created_at > now() - interval '30 days') AS ai_in,
        (SELECT coalesce(sum(tokens_out), 0)::int FROM ai_calls WHERE created_at > now() - interval '30 days') AS ai_out`);
    const byCategory: { category: string; total: number }[] = await this.dataSource.query(
      `SELECT c.name AS category, count(a.id)::int AS total FROM categories c
       LEFT JOIN ads a ON a.category_id = c.id AND a.status = 'ativo'
       GROUP BY c.name, c.sort_order ORDER BY total DESC, c.sort_order`,
    );
    return {
      users: {
        total: row.users_total,
        active: row.users_active,
        onboarding: row.users_onboarding,
        suspended: row.users_suspended,
        banned: row.users_banned,
      },
      buildings: { verified: row.b_verified, review: row.b_review, rejected: row.b_rejected },
      ads: {
        active: row.ads_active,
        moderation: row.ads_moderation,
        aiGeneratedShare: Number(row.ai_share),
      },
      conversations30d: row.conversations30d,
      reportsOpen: row.reports_open,
      ai30d: {
        calls: row.ai_calls,
        failures: row.ai_failures,
        tokensIn: row.ai_in,
        tokensOut: row.ai_out,
      },
      adsByCategory: byCategory,
    };
  }

  /** Fila de prédios para revisão manual, com o relatório da IA (docs §3.6). */
  async buildings(status: string): Promise<AdminBuilding[]> {
    const rows: BuildingRow[] = await this.dataSource.query(
      `SELECT b.id, b.name, b.type, b.status, b.street, b.number, b.district, b.city, b.state, b.cep,
              ST_Y(b.location::geometry) AS lat, ST_X(b.location::geometry) AS lng, b.created_at,
              u.name AS creator_name,
              (SELECT count(*)::int FROM building_memberships m WHERE m.building_id = b.id AND m.status = 'ativo') AS residents,
              v.score, v.decision, v.decided_by, v.input, v.output, v.created_at AS verified_at
       FROM buildings b
       LEFT JOIN users u ON u.id = b.created_by
       LEFT JOIN LATERAL (
         SELECT * FROM building_verifications bv WHERE bv.building_id = b.id ORDER BY bv.created_at DESC LIMIT 1
       ) v ON true
       WHERE b.status = $1
       ORDER BY b.created_at
       LIMIT 100`,
      [status],
    );
    return rows.map((row) => {
      const rules = row.input?.regras;
      const output = row.output;
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        status: row.status,
        address: `${row.street}, ${row.number}, ${row.district}, ${row.city}/${row.state}`,
        cep: row.cep,
        lat: Number(row.lat),
        lng: Number(row.lng),
        createdAt: new Date(row.created_at).toISOString(),
        creatorName: row.creator_name,
        residents: row.residents,
        verification: row.decision
          ? {
              score: row.score === null ? null : Number(row.score),
              decision: row.decision,
              decidedBy: row.decided_by,
              evidence: [...(rules?.evidence ?? []), ...(output?.evidencias ?? [])],
              risks: [...(rules?.risks ?? []), ...(output?.sinais_de_risco ?? [])],
              aiSummary: output,
              createdAt: new Date(row.verified_at).toISOString(),
            }
          : null,
      };
    });
  }

  async decideBuilding(
    admin: User,
    buildingId: string,
    decision: "verificado" | "rejeitado",
    reason?: string,
  ): Promise<void> {
    await this.verification.decideByAdmin(buildingId, decision, reason ?? null, admin.id);
    await this.audit.log(
      admin.id,
      `predio.${decision}`,
      { type: "building", id: buildingId },
      { reason },
    );
  }

  async ads(status: string): Promise<AdminAd[]> {
    const rows: AdRow[] = await this.dataSource.query(
      `SELECT a.id, a.title, a.description, a.status, a.status_reason, a.user_id, a.report_count, a.created_at,
              u.name AS seller_name, b.name AS building_name,
              (SELECT coalesce(array_agg(up.thumb_key ORDER BY i.position), '{}') FROM ad_images i JOIN uploads up ON up.id = i.upload_id WHERE i.ad_id = a.id) AS thumbs,
              mo.decision AS mod_decision, mo.decided_by AS mod_by, mo.reason AS mod_reason, mo.violated_categories AS mod_categories
       FROM ads a JOIN users u ON u.id = a.user_id JOIN buildings b ON b.id = a.building_id
       LEFT JOIN LATERAL (SELECT * FROM ad_moderations m WHERE m.ad_id = a.id ORDER BY m.created_at DESC LIMIT 1) mo ON true
       WHERE a.status = $1
       ORDER BY a.report_count DESC, a.created_at
       LIMIT 100`,
      [status],
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      statusReason: row.status_reason,
      thumbUrls: row.thumbs.map((key) => this.storage.url(key)),
      sellerId: row.user_id,
      sellerName: row.seller_name,
      buildingName: row.building_name,
      reportCount: row.report_count,
      lastModeration: row.mod_decision
        ? {
            decision: row.mod_decision,
            decidedBy: row.mod_by,
            reason: row.mod_reason,
            categories: row.mod_categories,
          }
        : null,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async decideAd(
    admin: User,
    adId: string,
    decision: "aprovar" | "remover",
    reason?: string,
  ): Promise<void> {
    await this.moderation.decideByAdmin(adId, decision, reason ?? null, admin.id);
    if (decision === "aprovar") {
      // Denúncias abertas sobre o anúncio aprovado deixam de valer.
      await this.dataSource.query(
        `UPDATE reports SET status = 'improcedente', resolved_by = $2, resolved_at = now(), resolution_note = 'Anúncio aprovado na revisão'
         WHERE target_type = 'ad' AND target_id = $1 AND status = 'aberta'`,
        [adId, admin.id],
      );
    }
    await this.audit.log(admin.id, `anuncio.${decision}`, { type: "ad", id: adId }, { reason });
  }

  async reports(): Promise<AdminReport[]> {
    const rows: ReportRow[] = await this.dataSource.query(
      `SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.created_at, rep.name AS reporter_name,
              (SELECT count(*)::int FROM reports o WHERE o.target_type = r.target_type AND o.target_id = r.target_id AND o.status = 'aberta') AS same_target,
              CASE r.target_type
                WHEN 'ad' THEN (SELECT title FROM ads WHERE id = r.target_id)
                WHEN 'user' THEN (SELECT name FROM users WHERE id = r.target_id)
                WHEN 'building' THEN (SELECT name FROM buildings WHERE id = r.target_id)
                WHEN 'message' THEN (SELECT left(coalesce(body, '[foto]'), 120) FROM messages WHERE id = r.target_id)
                WHEN 'referral' THEN (SELECT provider_name || ' — ' || left(service, 100) FROM service_referrals WHERE id = r.target_id)
              END AS target_label,
              CASE r.target_type
                WHEN 'ad' THEN (SELECT user_id FROM ads WHERE id = r.target_id)
                WHEN 'user' THEN r.target_id
                WHEN 'message' THEN (SELECT sender_id FROM messages WHERE id = r.target_id)
                WHEN 'referral' THEN (SELECT author_id FROM service_referrals WHERE id = r.target_id)
              END AS target_user_id
       FROM reports r LEFT JOIN users rep ON rep.id = r.reporter_id
       WHERE r.status = 'aberta'
       ORDER BY same_target DESC, r.created_at
       LIMIT 200`,
    );
    return rows.map((row) => ({
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      targetLabel: row.target_label ?? "(removido)",
      targetUserId: row.target_user_id,
      reason: row.reason,
      details: row.details,
      reporterName: row.reporter_name,
      sameTargetOpen: row.same_target,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async resolveReport(admin: User, reportId: string, input: ResolveReport): Promise<void> {
    const [report] = await this.dataSource.query(
      `UPDATE reports SET status = $2, resolved_by = $3, resolved_at = now(), resolution_note = $4
       WHERE id = $1 AND status = 'aberta' RETURNING reporter_id`,
      [reportId, input.status, admin.id, input.note ?? null],
    );
    if (!report) throw new NotFoundException("Denúncia não encontrada ou já resolvida");
    // Indicação de prestador (RN-089): procedente tira do ar; improcedente devolve a ocultada
    // quando não restam denúncias abertas.
    await this.dataSource.query(
      `UPDATE service_referrals s SET status = CASE WHEN $2::text = 'procedente' THEN 'removida'::referral_status ELSE 'ativa' END
       FROM reports r
       WHERE r.id = $1 AND r.target_type = 'referral' AND s.id = r.target_id
         AND ($2::text = 'procedente' OR (s.status = 'oculta' AND NOT EXISTS (
           SELECT 1 FROM reports o WHERE o.target_type = 'referral' AND o.target_id = s.id AND o.status = 'aberta')))`,
      [reportId, input.status],
    );
    if (report.reporter_id) {
      void this.notifications.notify(report.reporter_id, {
        type: "denuncia_resolvida",
        title: "Sua denúncia foi analisada",
        body:
          input.status === "procedente"
            ? "Obrigado! Tomamos as medidas necessárias."
            : "Analisamos e não encontramos violação das regras desta vez.",
      });
    }
    await this.audit.log(
      admin.id,
      `denuncia.${input.status}`,
      { type: "report", id: reportId },
      { note: input.note },
    );
  }

  async users(query: string | undefined): Promise<AdminUser[]> {
    const rows: UserRow[] = await this.dataSource.query(
      `SELECT u.id, u.name, u.email, u.status, u.role, u.created_at, u.suspended_until,
              (SELECT count(*)::int FROM ads a WHERE a.user_id = u.id AND a.status = 'ativo') AS active_ads,
              (SELECT count(*)::int FROM reports r WHERE r.status = 'aberta' AND (
                 (r.target_type = 'user' AND r.target_id = u.id) OR
                 (r.target_type = 'ad' AND r.target_id IN (SELECT id FROM ads WHERE user_id = u.id)))) AS open_reports,
              (SELECT coalesce(json_agg(json_build_object('type', s.type, 'reason', s.reason, 'createdAt', s.created_at) ORDER BY s.created_at DESC), '[]')
               FROM sanctions s WHERE s.user_id = u.id) AS sanctions
       FROM users u
       WHERE u.status <> 'excluido'
         AND ($1::text IS NULL OR f_unaccent(lower(u.name)) LIKE '%' || f_unaccent(lower($1)) || '%' OR lower(u.email) LIKE '%' || lower($1) || '%')
       ORDER BY open_reports DESC, u.created_at DESC
       LIMIT 50`,
      [query?.trim() || null],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      status: row.status,
      role: row.role,
      createdAt: new Date(row.created_at).toISOString(),
      suspendedUntil: row.suspended_until ? new Date(row.suspended_until).toISOString() : null,
      sanctions: row.sanctions.map((s) => ({
        ...s,
        createdAt: new Date(s.createdAt).toISOString(),
      })),
      activeAds: row.active_ads,
      openReports: row.open_reports,
    }));
  }

  /** Sanções progressivas (RN-095). Banimento revoga sessões e lembra e-mail/telefone (RN-009). */
  async sanction(admin: User, userId: string, rawInput: SanctionInput): Promise<SanctionType> {
    const input = sanctionInputSchema.parse(rawInput);
    if (userId === admin.id) throw new BadRequestException("Você não pode sancionar a si mesmo");
    const [target] = await this.dataSource.query(
      `SELECT id, email, phone, role, status FROM users WHERE id = $1`,
      [userId],
    );
    if (!target || target.status === "excluido")
      throw new NotFoundException("Usuário não encontrado");
    if (target.role === "platform_admin")
      throw new BadRequestException("Não é possível sancionar um admin da plataforma");
    const [{ total }] = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM sanctions WHERE user_id = $1`,
      [userId],
    );
    const type = input.type ?? nextSanction(total, input.grave);
    const endsAt =
      type === "suspensao" ? new Date(Date.now() + SUSPENSION_DAYS * 86_400_000) : null;

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO sanctions (user_id, type, reason, ends_at, decided_by, report_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, type, input.reason, endsAt, admin.id, input.reportId ?? null],
      );
      if (type === "suspensao") {
        await manager.query(
          `UPDATE users SET status = 'suspenso', suspended_until = $2, updated_at = now() WHERE id = $1`,
          [userId, endsAt],
        );
      }
      if (type === "banimento") {
        await manager.query(
          `UPDATE users SET status = 'banido', updated_at = now() WHERE id = $1`,
          [userId],
        );
        await manager.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
        await manager.query(`DELETE FROM push_subscriptions WHERE user_id = $1`, [userId]);
        await manager.query(
          `UPDATE ads SET status = 'removido', status_reason = 'Conta banida', updated_at = now()
           WHERE user_id = $1 AND status NOT IN ('excluido', 'removido')`,
          [userId],
        );
        await manager.query(
          `UPDATE conversations SET status = 'bloqueada' WHERE $1 IN (buyer_id, seller_id)`,
          [userId],
        );
        const identities = [
          ["email", target.email],
          ...(target.phone ? [["phone", target.phone]] : []),
        ];
        for (const [kind, value] of identities) {
          await manager.query(
            `INSERT INTO banned_identities (kind, hash) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [kind, identityHash(String(value))],
          );
        }
      }
      if (input.reportId) {
        await manager.query(
          `UPDATE reports SET status = 'procedente', resolved_by = $2, resolved_at = now() WHERE id = $1 AND status = 'aberta'`,
          [input.reportId, admin.id],
        );
      }
      await this.audit.log(
        admin.id,
        `sancao.${type}`,
        { type: "user", id: userId },
        { reason: input.reason },
        manager,
      );
    });

    if (type !== "banimento") {
      void this.notifications.notify(userId, {
        type: "denuncia_resolvida",
        title:
          type === "aviso"
            ? "Aviso da moderação"
            : `Publicação suspensa por ${SUSPENSION_DAYS} dias`,
        body: `${input.reason}. Se não concordar, responda pelo suporte (você pode contestar uma vez).`,
        url: "/perfil",
      });
    }
    return type;
  }

  async listSettings(): Promise<AdminSetting[]> {
    const current = await this.settings.all();
    return (Object.keys(SETTINGS_DEFAULTS) as SettingKey[]).map((key) => ({
      key,
      value: current[key],
      defaultValue: SETTINGS_DEFAULTS[key],
    }));
  }

  /** Valida o tipo pelo valor padrão (número ou lista de números). */
  async updateSetting(admin: User, key: string, value: unknown): Promise<void> {
    if (!(key in SETTINGS_DEFAULTS)) throw new NotFoundException("Configuração desconhecida");
    const defaultValue = SETTINGS_DEFAULTS[key as SettingKey];
    const valid = Array.isArray(defaultValue)
      ? Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === "number" && item >= 0)
      : typeof value === "number" && Number.isFinite(value) && value >= 0;
    if (!valid) throw new BadRequestException("Valor inválido para esta configuração");
    await this.settings.set(key as SettingKey, value, admin.id);
    await this.audit.log(admin.id, "config.alterar", { type: "setting", id: null }, { key, value });
  }
}
