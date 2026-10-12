import { ConfigService } from "@nestjs/config";
import type { TypeOrmModuleAsyncOptions } from "@nestjs/typeorm";
import type { Env } from "./env";

export const databaseConfig: TypeOrmModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => ({
    type: "postgres",
    url: config.get("DATABASE_URL", { infer: true }),
    autoLoadEntities: true,
    // Só em desenvolvimento; demais ambientes usam migrations.
    synchronize: config.get("NODE_ENV", { infer: true }) === "development",
  }),
};
