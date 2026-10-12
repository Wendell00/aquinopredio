export const BUILDING_VERIFICATION_QUEUE = "building-verification";

export interface BuildingVerificationJob {
  buildingId: string;
  reason: "criacao" | "reenvio" | "edicao";
}
