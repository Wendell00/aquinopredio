import { z } from "zod";
import { adStatusSchema } from "./ads";
import {
  buildingStatusSchema,
  buildingTypeSchema,
  joinPolicySchema,
  membershipRoleSchema,
  membershipStatusSchema,
} from "./buildings";
import { reportReasonSchema } from "./feed";
import { userRoleSchema, userStatusSchema } from "./users";

// —— Administração do prédio (RN-037 a RN-041, RN-094) ——

/** Morador visto pelo administrador do prédio (inclui a unidade, RN-007). */
export const buildingMemberSchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  image: z.string().nullable(),
  unit: z.string(),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  verified: z.boolean(),
  requestedAt: z.iso.datetime(),
  isMe: z.boolean(),
});
export type BuildingMember = z.infer<typeof buildingMemberSchema>;

export const buildingAdminViewSchema = z.object({
  building: z.object({
    id: z.uuid(),
    name: z.string(),
    type: buildingTypeSchema,
    status: buildingStatusSchema,
    joinPolicy: joinPolicySchema,
    district: z.string(),
    city: z.string(),
  }),
  members: z.array(buildingMemberSchema),
  admins: z.number().int(),
  maxAdmins: z.number().int(),
  autoApproveDays: z.number().int(),
});
export type BuildingAdminView = z.infer<typeof buildingAdminViewSchema>;

export const updateBuildingSettingsSchema = z.object({ joinPolicy: joinPolicySchema });

export const memberActionSchema = z.enum([
  "aprovar",
  "recusar",
  "verificar",
  "remover_selo",
  "remover",
  "promover",
]);
export type MemberAction = z.infer<typeof memberActionSchema>;

export const buildingAdSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: adStatusSchema,
  sellerName: z.string(),
  createdAt: z.iso.datetime(),
  reportCount: z.number().int(),
});
export type BuildingAd = z.infer<typeof buildingAdSchema>;

// —— Painel da plataforma ——

export const adminMetricsSchema = z.object({
  users: z.object({
    total: z.number(),
    active: z.number(),
    onboarding: z.number(),
    suspended: z.number(),
    banned: z.number(),
  }),
  buildings: z.object({ verified: z.number(), review: z.number(), rejected: z.number() }),
  ads: z.object({ active: z.number(), moderation: z.number(), aiGeneratedShare: z.number() }),
  conversations30d: z.number(),
  reportsOpen: z.number(),
  ai30d: z.object({
    calls: z.number(),
    failures: z.number(),
    tokensIn: z.number(),
    tokensOut: z.number(),
  }),
  adsByCategory: z.array(z.object({ category: z.string(), total: z.number() })),
});
export type AdminMetrics = z.infer<typeof adminMetricsSchema>;

export const adminBuildingSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: buildingTypeSchema,
  status: buildingStatusSchema,
  address: z.string(),
  cep: z.string(),
  lat: z.number(),
  lng: z.number(),
  createdAt: z.iso.datetime(),
  creatorName: z.string().nullable(),
  residents: z.number().int(),
  verification: z
    .object({
      score: z.number().nullable(),
      decision: z.string(),
      decidedBy: z.string(),
      evidence: z.array(z.string()),
      risks: z.array(z.string()),
      aiSummary: z.record(z.string(), z.unknown()).nullable(),
      createdAt: z.iso.datetime(),
    })
    .nullable(),
});
export type AdminBuilding = z.infer<typeof adminBuildingSchema>;

export const buildingDecisionSchema = z
  .object({
    decision: z.enum(["verificado", "rejeitado"]),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((input) => input.decision === "verificado" || (input.reason?.length ?? 0) >= 5, {
    path: ["reason"],
    message: "Explique o motivo para o morador",
  });
export type BuildingDecision = z.input<typeof buildingDecisionSchema>;

export const adminAdSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  status: adStatusSchema,
  statusReason: z.string().nullable(),
  thumbUrls: z.array(z.url()),
  sellerId: z.uuid(),
  sellerName: z.string(),
  buildingName: z.string(),
  reportCount: z.number().int(),
  lastModeration: z
    .object({
      decision: z.string(),
      decidedBy: z.string(),
      reason: z.string().nullable(),
      categories: z.array(z.string()),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminAd = z.infer<typeof adminAdSchema>;

export const adDecisionSchema = z
  .object({
    decision: z.enum(["aprovar", "remover"]),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((input) => input.decision === "aprovar" || (input.reason?.length ?? 0) >= 5, {
    path: ["reason"],
    message: "Explique o motivo para o anunciante",
  });
export type AdDecision = z.input<typeof adDecisionSchema>;

export const adminReportSchema = z.object({
  id: z.uuid(),
  targetType: z.string(),
  targetId: z.uuid(),
  targetLabel: z.string(),
  targetUserId: z.uuid().nullable(),
  reason: reportReasonSchema,
  details: z.string().nullable(),
  reporterName: z.string().nullable(),
  sameTargetOpen: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type AdminReport = z.infer<typeof adminReportSchema>;

export const resolveReportSchema = z.object({
  status: z.enum(["procedente", "improcedente"]),
  note: z.string().trim().max(500).optional(),
});
export type ResolveReport = z.infer<typeof resolveReportSchema>;

export const sanctionTypeSchema = z.enum(["aviso", "suspensao", "banimento"]);
export type SanctionType = z.infer<typeof sanctionTypeSchema>;

export const adminUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  status: userStatusSchema,
  role: userRoleSchema,
  createdAt: z.iso.datetime(),
  suspendedUntil: z.iso.datetime().nullable(),
  sanctions: z.array(
    z.object({ type: sanctionTypeSchema, reason: z.string(), createdAt: z.iso.datetime() }),
  ),
  activeAds: z.number().int(),
  openReports: z.number().int(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** Sem `type`, aplica a próxima sanção da escada (RN-095); `grave` bane direto. */
export const sanctionInputSchema = z.object({
  type: sanctionTypeSchema.optional(),
  grave: z.boolean().default(false),
  reason: z.string().trim().min(5, "Explique o motivo").max(500),
  reportId: z.uuid().optional(),
});
export type SanctionInput = z.input<typeof sanctionInputSchema>;

export const adminSettingSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  defaultValue: z.unknown(),
});
export type AdminSetting = z.infer<typeof adminSettingSchema>;

// —— Conta (RN-008, RN-133) ——

export const deleteAccountInputSchema = z.object({
  confirm: z.literal("EXCLUIR", { error: "Digite EXCLUIR para confirmar" }),
});
