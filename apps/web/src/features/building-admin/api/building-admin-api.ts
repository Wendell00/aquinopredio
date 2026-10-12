import {
  type BuildingAd,
  type BuildingAdminView,
  buildingAdminViewSchema,
  buildingAdSchema,
  type JoinPolicy,
  type MemberAction,
} from "@repo/shared";
import { z } from "zod";
import { api } from "@/lib/api/client";

export async function getBuildingAdmin(buildingId: string): Promise<BuildingAdminView> {
  return buildingAdminViewSchema.parse(await api.get(`buildings/${buildingId}/admin`).json());
}

export async function setJoinPolicy(buildingId: string, joinPolicy: JoinPolicy): Promise<void> {
  await api.patch(`buildings/${buildingId}/admin`, { json: { joinPolicy } });
}

export async function memberAction(
  buildingId: string,
  membershipId: string,
  action: MemberAction,
): Promise<void> {
  await api.post(`buildings/${buildingId}/admin/members/${membershipId}`, { json: { action } });
}

export async function resign(buildingId: string): Promise<void> {
  await api.post(`buildings/${buildingId}/admin/resign`);
}

export async function getBuildingAds(buildingId: string): Promise<BuildingAd[]> {
  return z.array(buildingAdSchema).parse(await api.get(`buildings/${buildingId}/admin/ads`).json());
}

export async function hideBuildingAd(buildingId: string, adId: string): Promise<void> {
  await api.post(`buildings/${buildingId}/admin/ads/${adId}/hide`);
}
