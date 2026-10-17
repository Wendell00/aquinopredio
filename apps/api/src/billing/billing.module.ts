import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { PlansService } from "./plans.service";
import { StripeGateway } from "./stripe.gateway";

/** `NotificationsService` e `SettingsService` vêm de módulos globais. */
@Module({
  controllers: [BillingController],
  providers: [StripeGateway, BillingService, PlansService],
  exports: [PlansService, BillingService],
})
export class BillingModule {}
