import { Module } from "@nestjs/common";
import { ConditionalModule } from "@nestjs/config";
import { BuildingAdminController } from "./building-admin.controller";
import { BuildingAdminService } from "./building-admin.service";
import { MaintenanceWorkersModule } from "./maintenance-workers.module";

@Module({
  imports: [
    ConditionalModule.registerWhen(
      MaintenanceWorkersModule,
      (env) => env.WORKERS_ENABLED !== "false",
    ),
  ],
  controllers: [BuildingAdminController],
  providers: [BuildingAdminService],
})
export class BuildingAdminModule {}
