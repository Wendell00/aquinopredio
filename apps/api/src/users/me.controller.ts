import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Patch,
  Post,
} from "@nestjs/common";
import {
  type CompleteProfileInput,
  completeProfileInputSchema,
  type Me,
  type UpdateProfileInput,
  updateProfileInputSchema,
} from "@repo/shared";
import { AllowOnboarding, CurrentUser } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { StorageService } from "../storage/storage.service";
import type { User } from "./user.entity";
import { toMe } from "./users.mapper";
import { UsersService } from "./users.service";

@Controller("me")
@AllowOnboarding()
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly storage: StorageService,
  ) {}

  private allowedImage(url: string): boolean {
    return (
      url.startsWith(this.storage.url("avatar/")) ||
      new URL(url).hostname === "lh3.googleusercontent.com"
    );
  }

  @Get()
  me(@CurrentUser() user: User): Me {
    return toMe(user);
  }

  @Post("profile")
  async completeProfile(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(completeProfileInputSchema)) input: CompleteProfileInput,
  ): Promise<Me> {
    return toMe(await this.users.completeProfile(user, input));
  }

  @Patch()
  async update(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateProfileInputSchema)) input: UpdateProfileInput,
  ): Promise<Me> {
    if (input.image && !this.allowedImage(input.image)) {
      throw new BadRequestException("Use uma foto enviada pelo app");
    }
    // RN-003: um telefone só pode estar em uma conta.
    if (input.phone && (await this.users.isPhoneTaken(input.phone, user.id))) {
      throw new ConflictException("Este telefone já está em uso em outra conta");
    }
    return toMe(await this.users.updateProfile(user, input));
  }
}
