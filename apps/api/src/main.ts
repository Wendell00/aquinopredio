import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { setupApp } from "./app.setup";
import type { Env } from "./config/env";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get("PORT", { infer: true }));
}

void bootstrap();
