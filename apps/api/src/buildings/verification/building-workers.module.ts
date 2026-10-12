import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GeoModule } from "../../geo/geo.module";
import { Building, BuildingVerification } from "../building.entity";
import { BuildingVerificationProcessor } from "./building-verification.processor";
import { BuildingVerificationService } from "./building-verification.service";
import { BUILDING_VERIFICATION_QUEUE } from "./verification.queue";

@Module({
  imports: [
    TypeOrmModule.forFeature([Building, BuildingVerification]),
    BullModule.registerQueue({ name: BUILDING_VERIFICATION_QUEUE }),
    GeoModule,
  ],
  providers: [BuildingVerificationService, BuildingVerificationProcessor],
})
export class BuildingWorkersModule {}
