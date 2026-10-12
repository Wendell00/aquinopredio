import { Module } from "@nestjs/common";
import { AdsModule } from "../ads/ads.module";
import { BuildingsModule } from "../buildings/buildings.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [AdsModule, BuildingsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
