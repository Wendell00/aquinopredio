import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  database: z.enum(["up", "down"]),
  timestamp: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const publicConfigSchema = z.object({
  googleLogin: z.boolean(),
  vapidPublicKey: z.string().nullable(),
});
export type PublicConfig = z.infer<typeof publicConfigSchema>;
