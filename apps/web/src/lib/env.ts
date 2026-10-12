import { z } from "zod";

/**
 * Variáveis públicas do front. O Next só injeta `NEXT_PUBLIC_*` quando acessadas
 * de forma literal, por isso cada uma é lida explicitamente aqui.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default("http://localhost:3001/api"),
});

export const env = publicEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
