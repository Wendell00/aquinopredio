import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Origens permitidas no CORS, separadas por vírgula. */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  OPENROUTER_API_KEY: optionalString,
  OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_MODEL_AD_GENERATION: optionalString,
  OPENROUTER_MODEL_BUILDING_VALIDATION: optionalString,
  OPENROUTER_MODEL_MODERATION: optionalString,
});

export type Env = z.infer<typeof envSchema>;

/** Usado pelo ConfigModule: a API não sobe com variáveis de ambiente inválidas. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
