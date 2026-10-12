import {
  type AdDecision,
  type AdminAd,
  type AdminBuilding,
  type AdminMetrics,
  type AdminReport,
  type AdminSetting,
  type AdminUser,
  adminAdSchema,
  adminBuildingSchema,
  adminMetricsSchema,
  adminReportSchema,
  adminSettingSchema,
  adminUserSchema,
  type BuildingDecision,
  type ResolveReport,
  type SanctionInput,
  sanctionTypeSchema,
} from "@repo/shared";
import { z } from "zod";
import { api } from "@/lib/api/client";

export const getMetrics = async (): Promise<AdminMetrics> =>
  adminMetricsSchema.parse(await api.get("admin/metrics").json());

export const getAdminBuildings = async (status = "pendente_revisao"): Promise<AdminBuilding[]> =>
  z
    .array(adminBuildingSchema)
    .parse(await api.get("admin/buildings", { searchParams: { status } }).json());

export const decideBuilding = async (id: string, input: BuildingDecision): Promise<void> => {
  await api.post(`admin/buildings/${id}/decision`, { json: input });
};

export const getAdminAds = async (status = "em_moderacao"): Promise<AdminAd[]> =>
  z.array(adminAdSchema).parse(await api.get("admin/ads", { searchParams: { status } }).json());

export const decideAd = async (id: string, input: AdDecision): Promise<void> => {
  await api.post(`admin/ads/${id}/decision`, { json: input });
};

export const getAdminReports = async (): Promise<AdminReport[]> =>
  z.array(adminReportSchema).parse(await api.get("admin/reports").json());

export const resolveReport = async (id: string, input: ResolveReport): Promise<void> => {
  await api.post(`admin/reports/${id}/resolve`, { json: input });
};

export const getAdminUsers = async (q?: string): Promise<AdminUser[]> =>
  z
    .array(adminUserSchema)
    .parse(await api.get("admin/users", { searchParams: q ? { q } : {} }).json());

export const sanctionUser = async (id: string, input: SanctionInput) =>
  z
    .object({ type: sanctionTypeSchema })
    .parse(await api.post(`admin/users/${id}/sanctions`, { json: input }).json());

export const getAdminSettings = async (): Promise<AdminSetting[]> =>
  z.array(adminSettingSchema).parse(await api.get("admin/settings").json());

export const updateAdminSetting = async (key: string, value: unknown): Promise<void> => {
  await api.put(`admin/settings/${key}`, { json: { value } });
};
