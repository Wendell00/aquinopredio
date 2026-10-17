import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";
import { json, raw } from "express";
import helmet from "helmet";
import type { Auth } from "./auth/auth";
import { AUTH_BASE_PATH } from "./auth/auth";
import { AUTH } from "./auth/auth.constants";
import { BILLING_WEBHOOK_PATH } from "./billing/billing.controller";
import { originCheck } from "./common/middleware/origin-check";
import { type Env, webOrigins } from "./config/env";

/**
 * Configuração HTTP compartilhada entre `main.ts` e os testes e2e.
 * A aplicação deve ser criada com `{ bodyParser: false }`: o Better Auth lê o corpo bruto,
 * então ele é montado antes do parser de JSON.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const origins = webOrigins({
    APP_URL: config.get("APP_URL", { infer: true }),
    WEB_ORIGIN: config.get("WEB_ORIGIN", { infer: true }),
  });
  const expressApp = (app as NestExpressApplication).getHttpAdapter().getInstance();

  // IP real do cliente (rate limit) só a partir de proxies conhecidos.
  expressApp.set("trust proxy", config.get("TRUSTED_PROXIES", { infer: true }));
  app.use(helmet());
  app.enableCors({ origin: origins, credentials: true });

  // A checagem de origem vem antes do Better Auth: ele só valida a origem quando há cookie,
  // e assim também bloqueamos login CSRF.
  app.use(originCheck(origins));
  expressApp.all(`${AUTH_BASE_PATH}/*splat`, toNodeHandler(app.get<Auth>(AUTH)));

  // O Stripe assina o corpo exato: o webhook recebe os bytes crus (o parser de JSON pula esta rota).
  app.use(BILLING_WEBHOOK_PATH, raw({ type: "application/json", limit: "1mb" }));
  app.use(json({ limit: "100kb" }));
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
}
