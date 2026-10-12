import {
  type BuildingSearchQuery,
  type BuildingSummary,
  buildingSummarySchema,
  type CepLookup,
  type CreateBuildingInput,
  type CreateBuildingResponse,
  cepLookupSchema,
  createBuildingResponseSchema,
  type DuplicateCheckInput,
  type GeocodeInput,
  type GeocodeResult,
  geocodeResultSchema,
  type MyBuilding,
  myBuildingSchema,
  type ResubmitBuildingInput,
} from "@repo/shared";
import { z } from "zod";
import { api } from "@/lib/api/client";

const summaries = z.array(buildingSummarySchema);

export async function searchBuildings(query: BuildingSearchQuery): Promise<BuildingSummary[]> {
  const searchParams = Object.fromEntries(
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return summaries.parse(await api.get("buildings/search", { searchParams }).json());
}

export async function lookupCep(cep: string): Promise<CepLookup> {
  return cepLookupSchema.parse(await api.get(`geo/cep/${cep}`).json());
}

export async function geocode(input: GeocodeInput): Promise<GeocodeResult> {
  return geocodeResultSchema.parse(await api.post("geo/geocode", { json: input }).json());
}

export async function checkDuplicates(input: DuplicateCheckInput): Promise<BuildingSummary[]> {
  return summaries.parse(await api.post("buildings/duplicates", { json: input }).json());
}

export async function createBuilding(input: CreateBuildingInput): Promise<CreateBuildingResponse> {
  return createBuildingResponseSchema.parse(await api.post("buildings", { json: input }).json());
}

export async function joinBuilding(buildingId: string, unit: string): Promise<MyBuilding> {
  return myBuildingSchema.parse(
    await api.post(`buildings/${buildingId}/join`, { json: { unit } }).json(),
  );
}

export async function resubmitBuilding(
  buildingId: string,
  input: ResubmitBuildingInput,
): Promise<MyBuilding> {
  return myBuildingSchema.parse(
    await api.post(`buildings/${buildingId}/resubmit`, { json: input }).json(),
  );
}

export async function getMyBuildings(): Promise<MyBuilding[]> {
  return z.array(myBuildingSchema).parse(await api.get("me/buildings").json());
}

export async function setPrimaryBuilding(buildingId: string): Promise<void> {
  await api.put("me/buildings/primary", { json: { buildingId } });
}
