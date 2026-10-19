import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type CreateReferralInput,
  createReferralInputSchema,
  type Referral,
  type ReferralPage,
  type ReferralQuery,
  referralQuerySchema,
} from "@repo/shared";
import { CurrentUser } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { User } from "../users/user.entity";
import { ReferralsService } from "./referrals.service";

@Controller("referrals")
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(referralQuerySchema)) query: ReferralQuery,
  ): Promise<ReferralPage> {
    return this.referrals.list(user, query);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createReferralInputSchema)) input: CreateReferralInput,
  ): Promise<Referral> {
    return this.referrals.create(user, input);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.referrals.remove(user, id);
  }
}
