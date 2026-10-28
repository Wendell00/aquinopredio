import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const base64Url = /^[A-Za-z0-9_-]+$/;

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    /** URL pública do app (Next). A API é acessada pelo mesmo domínio via proxy `/api`. */
    APP_URL: z.url().default("http://localhost:3000"),
    /** Origens permitidas no CORS e nas verificações de origem, separadas por vírgula. */
    WEB_ORIGIN: z.string().default("http://localhost:3000"),
    /**
     * IPs/CIDRs dos proxies confiáveis na frente da API (o Next em dev; o load balancer em produção),
     * separados por vírgula. Usados para descobrir o IP real do cliente no rate limit.
     */
    TRUSTED_PROXIES: z
      .string()
      .default("127.0.0.1,::1,::ffff:127.0.0.1")
      .transform((value) =>
        value
          .split(",")
          .map((ip) => ip.trim())
          .filter(Boolean),
      ),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

    // Autenticação (Better Auth)
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET precisa de pelo menos 32 caracteres"),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    /** Consulta senhas vazadas (Have I Been Pwned, k-anonimato) no cadastro e na troca de senha. */
    AUTH_CHECK_PWNED_PASSWORDS: booleanString,

    // E-mail
    /** `smtp` em dev (Mailpit); `resend` em produção, pela API HTTP do Resend. */
    MAIL_TRANSPORT: z.enum(["smtp", "resend"]).default("smtp"),
    SMTP_URL: z.string().default("smtp://localhost:1025"),
    RESEND_API_KEY: optionalString,
    RESEND_API_URL: z.url().default("https://api.resend.com"),
    /**
     * ID ou alias de um template publicado no Resend para a confirmação de e-mail. Sem ele, o HTML
     * é gerado pelo app (`src/mail/templates.ts`).
     */
    RESEND_TEMPLATE_VERIFY_EMAIL: optionalString,
    /** Com o Resend, o domínio do remetente precisa estar verificado no painel. */
    MAIL_FROM: z.string().default("Aqui no Prédio <nao-responda@aquinopredio.local>"),
    /** Endereço que recebe as respostas (o remetente é "não responda"). */
    MAIL_REPLY_TO: optionalString.pipe(z.email().optional()),

    // Armazenamento de imagens (S3 compatível)
    STORAGE_ENDPOINT: z.url().default("http://localhost:8333"),
    STORAGE_REGION: z.string().default("us-east-1"),
    STORAGE_BUCKET: z.string().default("aquinopredio"),
    STORAGE_ACCESS_KEY_ID: z.string().default("aquinopredio"),
    STORAGE_SECRET_ACCESS_KEY: z.string().default("aquinopredio-dev"),
    /** URL pública de leitura dos objetos (CDN em produção). */
    STORAGE_PUBLIC_URL: z.url().default("http://localhost:8333/aquinopredio"),
    STORAGE_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),

    // Pagamentos (Stripe). Sem as três, a assinatura Pro fica indisponível e todos ficam no Free.
    STRIPE_SECRET_KEY: optionalString,
    /** Segredo do endpoint de webhook (`whsec_…`), usado para conferir a assinatura dos eventos. */
    STRIPE_WEBHOOK_SECRET: optionalString,
    /** Preço recorrente mensal do plano Pro (`price_…`), criado no painel do Stripe. */
    STRIPE_PRICE_PRO: optionalString,

    // Geolocalização (OpenStreetMap)
    NOMINATIM_URL: z.url().default("https://nominatim.openstreetmap.org"),
    OVERPASS_URL: z.url().default("https://overpass-api.de/api/interpreter"),
    VIACEP_URL: z.url().default("https://viacep.com.br/ws"),
    /** A política do Nominatim exige um User-Agent identificando o app e um contato. */
    GEO_USER_AGENT: z.string().default("AquiNoPredio/0.1 (dev; contato@aquinopredio.local)"),

    // IA (OpenRouter)
    OPENROUTER_API_KEY: optionalString,
    OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
    OPENROUTER_SITE_URL: z.url().default("http://localhost:3000"),
    OPENROUTER_APP_NAME: z.string().default("Aqui no Predio"),
    OPENROUTER_MODEL_AD_GENERATION: z.string().default("anthropic/claude-sonnet-5.5"),
    OPENROUTER_MODEL_BUILDING_VALIDATION: z.string().default("anthropic/claude-sonnet-5.5"),
    OPENROUTER_MODEL_MODERATION: z.string().default("anthropic/claude-haiku-5.5"),
    /**
     * O que fazer com anúncios quando a IA de moderação não está configurada (RN-113).
     * `review` segue a regra (fila manual); `approve` aprova após o filtro local — só para desenvolvimento.
     */
    MODERATION_WITHOUT_AI: z.enum(["review", "approve"]).default("review"),

    // Chat em tempo real (Supabase Realtime, Broadcast). Sem as duas, o chat segue só com polling.
    /** URL do projeto (`https://<ref>.supabase.co`). */
    SUPABASE_URL: optionalString.pipe(z.url().optional()),
    /** Chave secreta (`sb_secret_…`): publica os avisos e assina os nomes dos canais. Só no backend. */
    SUPABASE_SECRET_KEY: optionalString,

    // Web Push
    VAPID_PUBLIC_KEY: optionalString.pipe(
      z.string().regex(base64Url, "chave VAPID inválida").optional(),
    ),
    VAPID_PRIVATE_KEY: optionalString.pipe(
      z.string().regex(base64Url, "chave VAPID inválida").optional(),
    ),
    VAPID_SUBJECT: z.string().default("mailto:contato@aquinopredio.local"),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_SECRET"],
        message: "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET devem ser definidos juntos",
      });
    }
    if (env.MAIL_TRANSPORT === "resend" && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY é obrigatória com MAIL_TRANSPORT=resend",
      });
    }
    const stripe = [env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET, env.STRIPE_PRICE_PRO];
    if (stripe.some(Boolean) && !stripe.every(Boolean)) {
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_SECRET_KEY"],
        message:
          "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET e STRIPE_PRICE_PRO devem ser definidos juntos",
      });
    }
    if (Boolean(env.SUPABASE_URL) !== Boolean(env.SUPABASE_SECRET_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["SUPABASE_SECRET_KEY"],
        message: "SUPABASE_URL e SUPABASE_SECRET_KEY devem ser definidos juntos",
      });
    }
    if (env.NODE_ENV === "production" && env.MODERATION_WITHOUT_AI === "approve") {
      ctx.addIssue({
        code: "custom",
        path: ["MODERATION_WITHOUT_AI"],
        message: "`approve` não é permitido em produção",
      });
    }
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

export function webOrigins(env: Pick<Env, "WEB_ORIGIN" | "APP_URL">): string[] {
  const origins = env.WEB_ORIGIN.split(",").map((origin) => origin.trim());
  return [...new Set([new URL(env.APP_URL).origin, ...origins])];
}

/** Monta o objeto `Env` completo (já validado e transformado) a partir do ConfigService. */
export function readEnv(config: { get(key: string): unknown }): Env {
  const keys = Object.keys(envSchema.shape) as (keyof Env)[];
  return Object.fromEntries(keys.map((key) => [key, config.get(key)])) as Env;
}
