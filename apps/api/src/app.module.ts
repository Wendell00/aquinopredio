import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminModule } from "./admin/admin.module";
import { AdsModule } from "./ads/ads.module";
import { AiModule } from "./ai/ai.module";
import { AuditModule } from "./audit/audit.service";
import { AuthGuard } from "./auth/auth.guard";
import { AuthModule } from "./auth/auth.module";
import { BuildingAdminModule } from "./building-admin/building-admin.module";
import { BuildingsModule } from "./buildings/buildings.module";
import { ChatModule } from "./chat/chat.module";
import { UserThrottlerGuard } from "./common/guards/user-throttler.guard";
import { databaseConfig } from "./config/database.config";
import { type Env, validateEnv } from "./config/env";
import { FeedModule } from "./feed/feed.module";
import { GeoModule } from "./geo/geo.module";
import { MailModule } from "./mail/mail.module";
import { HealthModule } from "./modules/health/health.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { RedisModule } from "./redis/redis.module";
import { SettingsModule } from "./settings/settings.module";
import { StorageModule } from "./storage/storage.module";
import { UploadsModule } from "./uploads/uploads.module";
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
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        // BullMQ exige maxRetriesPerRequest: null nas conexões dos workers.
        connection: { url: config.get("REDIS_URL", { infer: true }), maxRetriesPerRequest: null },
        prefix: "anp",
      }),
    }),
    ScheduleModule.forRoot(),
    RedisModule,
    StorageModule,
    UploadsModule,
    SettingsModule,
    AiModule,
    MailModule,
    AuthModule,
    HealthModule,
    UsersModule,
    GeoModule,
    BuildingsModule,
    AuditModule,
    NotificationsModule,
    AdsModule,
    FeedModule,
    ChatModule,
    BuildingAdminModule,
    AdminModule,
  ],
  // Ordem importa: primeiro a sessão (AuthGuard), depois o rate limit por usuário.
  providers: [
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
