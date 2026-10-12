import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PublicConfig } from "@repo/shared";
import { Public } from "../../common/decorators/auth.decorators";
import type { Env } from "../../config/env";

/** Configuração pública que o front precisa saber (sem segredos). */
@Controller("public-config")
@Public()
export class PublicConfigController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get()
  get(): PublicConfig {
    return {
      googleLogin: Boolean(this.config.get("GOOGLE_CLIENT_ID", { infer: true })),
      vapidPublicKey: this.config.get("VAPID_PUBLIC_KEY", { infer: true }) ?? null,
    };
  }
}
