import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Pool } from "pg";
import { type Env, readEnv } from "../config/env";
import { MailService } from "../mail/mail.service";
import { User } from "../users/user.entity";
import { UsersService } from "../users/users.service";
import { createAuth } from "./auth";
import { AUTH, AUTH_POOL } from "./auth.constants";
import { AuthGuard } from "./auth.guard";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [
    {
      provide: AUTH_POOL,
      inject: [ConfigService],
      // Pool próprio e pequeno: o Better Auth não usa o TypeORM.
      useFactory: (config: ConfigService<Env, true>) =>
        new Pool({ connectionString: config.get("DATABASE_URL", { infer: true }), max: 5 }),
    },
    {
      provide: AUTH,
      inject: [ConfigService, AUTH_POOL, MailService],
      useFactory: (config: ConfigService<Env, true>, pool: Pool, mail: MailService) =>
        createAuth({ env: readEnv(config), pool, mail }),
    },
    UsersService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AUTH, UsersService],
})
export class AuthModule implements OnApplicationShutdown {
  constructor(@Inject(AUTH_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
