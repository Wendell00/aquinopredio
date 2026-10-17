import { z } from "zod";

export const userStatusSchema = z.enum([
  "onboarding_pendente",
  "ativo",
  "suspenso",
  "banido",
  "excluido",
]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userRoleSchema = z.enum(["user", "platform_admin"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Senha: mínimo 10 caracteres (o servidor também aplica, no Better Auth). */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Informe pelo menos 2 caracteres")
  .max(60, "Use no máximo 60 caracteres");

/** Nomes que confundem o vizinho (parecem oficiais) ou colidem com rotas do app. */
const RESERVED_USERNAMES = new Set([
  "admin",
  "administrador",
  "aquinopredio",
  "aqui_no_predio",
  "suporte",
  "ajuda",
  "moderacao",
  "sindico",
  "oficial",
  "sistema",
  "root",
  "me",
]);

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/** Nome de usuário único (@fulano): minúsculas, números, "_" e "."; começa com letra. */
export const usernameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, "").toLowerCase())
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH, `Use pelo menos ${USERNAME_MIN_LENGTH} caracteres`)
      .max(USERNAME_MAX_LENGTH, `Use no máximo ${USERNAME_MAX_LENGTH} caracteres`)
      .regex(/^[a-z]/, "Comece com uma letra")
      .regex(/^[a-z0-9_.]+$/, "Use só letras sem acento, números, _ e .")
      .refine(
        (value) => !value.includes("..") && !value.endsWith("."),
        "Ponto não pode repetir nem ficar no fim",
      )
      .refine(
        (value) => !RESERVED_USERNAMES.has(value),
        "Este nome de usuário não está disponível",
      ),
  );

export const usernameAvailabilitySchema = z.object({
  username: z.string(),
  available: z.boolean(),
  /** Motivo quando indisponível (formato inválido ou já em uso). */
  reason: z.string().nullable(),
});
export type UsernameAvailability = z.infer<typeof usernameAvailabilitySchema>;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres`);

export const emailSchema = z.email("Informe um e-mail válido").trim().toLowerCase();

export const signUpInputSchema = z.object({
  name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SignUpInput = z.infer<typeof signUpInputSchema>;

export const signInInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha"),
});
export type SignInInput = z.infer<typeof signInInputSchema>;

/** Telefone brasileiro em E.164 (+55 DDD número). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[^\d+]/g, ""))
  .transform((value) => (value.startsWith("+") ? value : `+55${value}`))
  .pipe(z.string().regex(/^\+55\d{10,11}$/, "Informe um celular com DDD"));

/** Passo 1 do onboarding: nome de exibição, nome de usuário, aceite de termos e 18+ (RN-004, RN-006). */
export const completeProfileInputSchema = z.object({
  name: displayNameSchema,
  username: usernameSchema,
  acceptTerms: z.literal(true, {
    error: "É preciso aceitar os Termos e a Política de Privacidade",
  }),
  isAdult: z.literal(true, { error: "O app é só para maiores de 18 anos" }),
});
export type CompleteProfileInput = z.infer<typeof completeProfileInputSchema>;

export const updateProfileInputSchema = z
  .object({
    name: displayNameSchema,
    username: usernameSchema,
    phone: phoneSchema.nullable(),
    image: z.url().nullable(),
  })
  .partial();
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export const notificationTypeSchema = z.enum([
  "nova_mensagem",
  "anuncio_aprovado",
  "anuncio_removido",
  "anuncio_expirando",
  "vinculo_atualizado",
  "predio_atualizado",
  "novidades_predio",
  "favorito_alterado",
  "denuncia_resolvida",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/** Preferências por tipo de notificação (RN-122). Ausente = ligado, exceto o resumo diário (opt-in). */
export const notificationPrefsSchema = z.object({
  disabled: z.array(notificationTypeSchema).default([]),
  /** Tipos opt-in ligados pelo usuário (ex.: resumo diário do prédio). */
  enabled: z.array(notificationTypeSchema).default([]),
  quietHours: z.boolean().default(true),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const onboardingStepSchema = z.enum(["perfil", "predio", "concluido"]);
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

/** Dados do próprio usuário (inclui dados privados: e-mail, telefone). */
export const meSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Nulo só até o passo de perfil do onboarding. */
  username: z.string().nullable(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  role: userRoleSchema,
  primaryBuildingId: z.uuid().nullable(),
  termsAcceptedAt: z.iso.datetime().nullable(),
  suspendedUntil: z.iso.datetime().nullable(),
  notificationPrefs: notificationPrefsSchema,
  onboardingStep: onboardingStepSchema,
  createdAt: z.iso.datetime(),
});
export type Me = z.infer<typeof meSchema>;
