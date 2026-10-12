import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { databaseConfig } from "./config/database.config";
import { type Env, validateEnv } from "./config/env";
import { MailModule } from "./mail/mail.module";
import { HealthModule } from "./modules/health/health.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            ttl: config.get("THROTTLE_TTL_MS", { infer: true }),
            limit: config.get("THROTTLE_LIMIT", { infer: true }),
          },
        ],
      }),
    }),
    TypeOrmModule.forRootAsync(databaseConfig),
    MailModule,
    AuthModule,
    HealthModule,
    UsersModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
