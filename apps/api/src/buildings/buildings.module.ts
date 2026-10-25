import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GeoModule } from "../geo/geo.module";
import { Building, BuildingMembership, BuildingVerification } from "./building.entity";
import { BuildingsController, MyBuildingsController } from "./buildings.controller";
import { BuildingsService } from "./buildings.service";
import { MaintenanceWorkersModule } from "./maintenance/maintenance-workers.module";
import { BuildingVerificationService } from "./verification/building-verification.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Building, BuildingMembership, BuildingVerification]),
    GeoModule,
    MaintenanceWorkersModule,
  ],
  controllers: [BuildingsController, MyBuildingsController],
  providers: [BuildingsService, BuildingVerificationService],
  exports: [BuildingsService, BuildingVerificationService, TypeOrmModule],
})
export class BuildingsModule {}
