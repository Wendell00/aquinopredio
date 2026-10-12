import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import type { Env } from "./config/env";

/** Configuração HTTP compartilhada entre `main.ts` e os testes e2e. */
export function setupApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config
      .get("WEB_ORIGIN", { infer: true })
      .split(",")
      .map((origin) => origin.trim()),
    credentials: true,
  });
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
}
