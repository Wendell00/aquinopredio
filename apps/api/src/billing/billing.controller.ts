import { BadRequestException, Controller, Get, Headers, HttpCode, Post, Req } from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { BillingStatus, RedirectUrl } from "@repo/shared";
import type { Request } from "express";
import { CurrentUser, Public } from "../common/decorators/auth.decorators";
import type { User } from "../users/user.entity";
import { BillingService } from "./billing.service";
import { InvalidWebhookError } from "./stripe.gateway";

export const BILLING_WEBHOOK_PATH = "/api/billing/webhook";

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  status(@CurrentUser() user: User): Promise<BillingStatus> {
    return this.billing.status(user);
  }

  @Post("checkout")
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  async checkout(@CurrentUser() user: User): Promise<RedirectUrl> {
    return { url: await this.billing.checkout(user) };
  }

  @Post("portal")
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  async portal(@CurrentUser() user: User): Promise<RedirectUrl> {
    return { url: await this.billing.portal(user) };
  }

  /** Chamado pelo Stripe (sem sessão). A autenticidade vem da assinatura `stripe-signature`. */
  @Post("webhook")
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  async webhook(
    @Req() req: Request,
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!signature || !Buffer.isBuffer(req.body)) {
      throw new BadRequestException("Webhook inválido");
    }
    try {
      await this.billing.handleWebhook(req.body, signature);
    } catch (error) {
      if (error instanceof InvalidWebhookError) throw new BadRequestException("Webhook inválido");
      throw error;
    }
    return { received: true };
  }
}
