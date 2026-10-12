import { type HealthResponse, healthResponseSchema } from "@repo/shared";
import { api } from "@/lib/api/client";

export async function getHealth(): Promise<HealthResponse> {
  const data = await api.get("health").json();
  return healthResponseSchema.parse(data);
}
