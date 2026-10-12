import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";

/** `UsersService` e a entidade vêm do `AuthModule` (global). */
@Module({
  controllers: [MeController],
})
export class UsersModule {}
