import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { PublicConfigController } from "./public-config.controller";

@Module({
  controllers: [HealthController, PublicConfigController],
  providers: [HealthService],
})
export class HealthModule {}
