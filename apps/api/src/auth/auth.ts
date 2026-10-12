import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import type { Pool } from "pg";
import type { Env } from "../config/env";
import { webOrigins } from "../config/env";
import type { MailService } from "../mail/mail.service";
import { mailTemplates } from "../mail/templates";

export const AUTH_BASE_PATH = "/api/auth";

/** Hash usado para lembrar identidades banidas sem guardar o dado em claro (RN-009). */
export function identityHash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

interface CreateAuthDeps {
  env: Env;
  pool: Pool;
  mail: MailService;
}

/**
 * Configuração do Better Auth. Ele é dono das tabelas de identidade (`users`, `sessions`,
 * `accounts`, `verifications`); os dados do app (status, papel, prédio principal) ficam em
 * colunas extras de `users`, lidas via TypeORM pelo `UsersService`.
 */
export function createAuth({ env, pool, mail }: CreateAuthDeps) {
  const isProduction = env.NODE_ENV === "production";
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account" as const,
          },
        }
      : {};

  return betterAuth({
    appName: "Aqui no Prédio",
    baseURL: env.APP_URL,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    database: pool,
    trustedOrigins: webOrigins(env),
    telemetry: { enabled: false },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await mail.send(user.email, mailTemplates.resetPassword(user.name, url));
      },
      onPasswordReset: async ({ user }) => {
        await mail.send(user.email, mailTemplates.passwordChanged(user.name));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await mail.send(user.email, mailTemplates.verifyEmail(user.name, url));
      },
    },
    socialProviders: google,

    user: {
      modelName: "users",
      fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
      validateUserInfo: async ({ user }) => {
        if (!user.email) return;
        const banned = await pool.query(
          "SELECT 1 FROM banned_identities WHERE kind = 'email' AND hash = $1",
          [identityHash(user.email)],
        );
        if (banned.rowCount) return { error: "Não é possível criar uma conta com este e-mail." };
      },
    },
    session: {
      modelName: "sessions",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        userId: "user_id",
      },
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Ações sensíveis (trocar senha, excluir conta) exigem login recente.
      freshAge: 60 * 15,
    },
    account: {
      modelName: "accounts",
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // O Google confirma o e-mail; outros provedores precisariam de verificação local.
        trustedProviders: ["google"],
      },
    },
    verification: {
      modelName: "verifications",
      fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rate_limits",
      fields: { lastRequest: "last_request" },
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60 * 60, max: 5 },
        "/request-password-reset": { window: 60 * 60, max: 5 },
        "/send-verification-email": { window: 60 * 60, max: 5 },
        "/reset-password": { window: 60 * 60, max: 10 },
        "/change-password": { window: 60 * 60, max: 10 },
      },
    },

    databaseHooks: {
      session: {
        create: {
          // Contas banidas, suspensas para login ou excluídas não abrem sessão.
          before: async (session) => {
            const result = await pool.query<{ status: string }>(
              "SELECT status FROM users WHERE id = $1",
              [session.userId],
            );
            const status = result.rows[0]?.status;
            if (status === "banido" || status === "excluido") {
              throw new APIError("FORBIDDEN", { message: "Esta conta não pode mais entrar." });
            }
          },
        },
      },
    },

    advanced: {
      cookiePrefix: "anp",
      useSecureCookies: isProduction,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProduction },
      database: { generateId: "uuid" },
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
        trustedProxies: env.TRUSTED_PROXIES,
      },
    },

    plugins: env.AUTH_CHECK_PWNED_PASSWORDS
      ? [
          haveIBeenPwned({
            customPasswordCompromisedMessage:
              "Esta senha apareceu em vazamentos de dados. Escolha outra, por segurança.",
          }),
        ]
      : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
