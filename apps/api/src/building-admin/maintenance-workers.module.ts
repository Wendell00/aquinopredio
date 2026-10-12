import { Module } from "@nestjs/common";
import { MaintenanceScheduler } from "./maintenance.scheduler";

@Module({ providers: [MaintenanceScheduler] })
export class MaintenanceWorkersModule {}
