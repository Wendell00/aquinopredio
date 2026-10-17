import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";
import { MeController } from "./me.controller";

/** `UsersService` e a entidade vêm do `AuthModule` (global). */
@Module({
  imports: [BillingModule],
  controllers: [MeController, AccountController],
  providers: [AccountService],
})
export class UsersModule {}
