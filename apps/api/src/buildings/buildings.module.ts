import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConditionalModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GeoModule } from "../geo/geo.module";
import { Building, BuildingMembership, BuildingVerification } from "./building.entity";
import { BuildingsController, MyBuildingsController } from "./buildings.controller";
import { BuildingsService } from "./buildings.service";
import { BuildingVerificationService } from "./verification/building-verification.service";
import { BuildingWorkersModule } from "./verification/building-workers.module";
import { BUILDING_VERIFICATION_QUEUE } from "./verification/verification.queue";

@Module({
  imports: [
    TypeOrmModule.forFeature([Building, BuildingMembership, BuildingVerification]),
    BullModule.registerQueue({ name: BUILDING_VERIFICATION_QUEUE }),
    GeoModule,
    // O worker só sobe onde WORKERS_ENABLED=true (desligado nos testes e em réplicas só de HTTP).
    ConditionalModule.registerWhen(BuildingWorkersModule, (env) => env.WORKERS_ENABLED !== "false"),
  ],
  controllers: [BuildingsController, MyBuildingsController],
  providers: [BuildingsService, BuildingVerificationService],
  exports: [BuildingsService, BuildingVerificationService, TypeOrmModule],
})
export class BuildingsModule {}
