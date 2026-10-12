import { Module } from "@nestjs/common";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";
import { MeController } from "./me.controller";

/** `UsersService` e a entidade vêm do `AuthModule` (global). */
@Module({
  controllers: [MeController, AccountController],
  providers: [AccountService],
})
export class UsersModule {}
