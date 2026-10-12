import { ConfigService } from "@nestjs/config";
import type { TypeOrmModuleAsyncOptions } from "@nestjs/typeorm";
import { migrations } from "../database/migrations";
import { SnakeNamingStrategy } from "../database/snake-naming.strategy";
import type { Env } from "./env";

export const databaseConfig: TypeOrmModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => ({
    type: "postgres",
    url: config.get("DATABASE_URL", { infer: true }),
    autoLoadEntities: true,
    namingStrategy: new SnakeNamingStrategy(),
    // Schema só por migrations (PostGIS, enums, índices GIST/GIN não saem bem do synchronize).
    synchronize: false,
    migrations,
    migrationsRun: true,
    migrationsTransactionMode: "each",
  }),
};
