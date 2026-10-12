import { Body, Controller, Delete, Get, Header, HttpCode, Req } from "@nestjs/common";
import { deleteAccountInputSchema } from "@repo/shared";
import type { RequestWithAuth } from "../auth/auth.guard";
import { AllowOnboarding, CurrentUser } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AccountService } from "./account.service";
import type { User } from "./user.entity";

@Controller("me")
@AllowOnboarding()
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get("export")
  @Header("Content-Disposition", 'attachment; filename="meus-dados-aqui-no-predio.json"')
  export(@CurrentUser() user: User): Promise<Record<string, unknown>> {
    return this.account.export(user);
  }

  @Delete()
  @HttpCode(204)
  async delete(
    @CurrentUser() user: User,
    @Req() request: RequestWithAuth,
    @Body(new ZodValidationPipe(deleteAccountInputSchema)) _input: { confirm: "EXCLUIR" },
  ): Promise<void> {
    await this.account.delete(user, new Date(request.auth?.session.createdAt ?? 0));
  }
}
