import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { BillingStatus } from "@repo/shared";
import { DataSource } from "typeorm";
import type { Env } from "../config/env";
import type { User } from "../users/user.entity";
import { PlansService } from "./plans.service";
import { PRO_STATUSES, StripeGateway, type SubscriptionSnapshot } from "./stripe.gateway";

const UNAVAILABLE = "A assinatura Pro está indisponível no momento. Tente mais tarde.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
}

/** Assinatura do plano Pro pelo Stripe Checkout + portal do cliente (RN-140). */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly appUrl: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly gateway: StripeGateway,
    private readonly plans: PlansService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  async status(user: User): Promise<BillingStatus> {
    const [row] = await this.findByUser(user.id);
    const [free, pro, proPriceCents] = await Promise.all([
      this.plans.limits("free"),
      this.plans.limits("pro"),
      this.plans.proPriceCents(),
    ]);
    return {
      plan: user.plan,
      checkoutEnabled: this.gateway.enabled,
      proPriceCents,
      limits: { free, pro },
      subscription: row?.status
        ? {
            status: row.status,
            currentPeriodEnd: row.current_period_end?.toISOString() ?? null,
            cancelAtPeriodEnd: row.cancel_at_period_end,
          }
        : null,
    };
  }

  async checkout(user: User): Promise<string> {
    if (!this.gateway.enabled) throw new ServiceUnavailableException(UNAVAILABLE);
    if (user.status !== "ativo")
      throw new BadRequestException("Conclua seu cadastro para assinar.");
    if (user.plan === "pro") {
      throw new ConflictException("Você já é Pro. Gerencie a assinatura pelo portal.");
    }
    const customerId = await this.customerFor(user);
    return this.gateway.createCheckout({
      userId: user.id,
      customerId,
      successUrl: `${this.appUrl}/plano?assinatura=sucesso`,
      cancelUrl: `${this.appUrl}/plano?assinatura=cancelada`,
    });
  }

  async portal(user: User): Promise<string> {
    if (!this.gateway.enabled) throw new ServiceUnavailableException(UNAVAILABLE);
    const [row] = await this.findByUser(user.id);
    if (!row) throw new BadRequestException("Você ainda não tem assinatura.");
    return this.gateway.createPortal({
      customerId: row.stripe_customer_id,
      returnUrl: `${this.appUrl}/plano`,
    });
  }

  /** RN-008: conta excluída não continua sendo cobrada. Falha aqui impede a exclusão. */
  async cancelForDeletedAccount(userId: string): Promise<void> {
    const [row] = await this.findByUser(userId);
    if (!row?.stripe_subscription_id || !row.status) return;
    if (!(PRO_STATUSES as readonly string[]).includes(row.status)) return;
    if (!this.gateway.enabled) {
      throw new ServiceUnavailableException(
        "Não foi possível cancelar sua assinatura agora. Tente de novo em instantes.",
      );
    }
    await this.gateway.cancelSubscription(row.stripe_subscription_id);
    await this.dataSource.query(
      `UPDATE subscriptions SET status = 'canceled', updated_at = now() WHERE user_id = $1`,
      [userId],
    );
  }

  /**
   * Webhook do Stripe. Em vez de confiar no conteúdo do evento (que pode chegar fora de ordem ou
   * repetido), busca a assinatura atual no Stripe e sincroniza — processar duas vezes dá no mesmo.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.gateway.parseWebhook(rawBody, signature);
    if (!event.subscriptionId) return;
    const subscription = await this.gateway.retrieveSubscription(event.subscriptionId);
    await this.sync(subscription, event.id);
  }

  private async sync(subscription: SubscriptionSnapshot, eventId: string): Promise<void> {
    const userId = await this.userFor(subscription);
    if (!userId) {
      this.logger.warn(`Evento ${eventId}: assinatura ${subscription.id} sem usuário conhecido`);
      return;
    }
    const [current] = await this.findByUser(userId);
    // Uma assinatura antiga cancelada não derruba a assinatura nova que está valendo.
    if (
      current?.stripe_subscription_id &&
      current.stripe_subscription_id !== subscription.id &&
      current.status &&
      (PRO_STATUSES as readonly string[]).includes(current.status) &&
      !PRO_STATUSES.includes(subscription.status)
    ) {
      return;
    }
    await this.dataSource.query(
      `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status,
                                  current_period_end, cancel_at_period_end)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         stripe_customer_id = EXCLUDED.stripe_customer_id,
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         status = EXCLUDED.status,
         current_period_end = EXCLUDED.current_period_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         updated_at = now()`,
      [
        userId,
        subscription.customerId,
        subscription.id,
        subscription.status,
        subscription.currentPeriodEnd,
        subscription.cancelAtPeriodEnd,
      ],
    );
    await this.plans.setPlan(userId, PRO_STATUSES.includes(subscription.status) ? "pro" : "free");
  }

  /** O cliente salvo no banco manda; o `userId` dos metadados só vale para um cliente ainda sem dono. */
  private async userFor(subscription: SubscriptionSnapshot): Promise<string | null> {
    const [byCustomer] = await this.dataSource.query(
      `SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1`,
      [subscription.customerId],
    );
    if (byCustomer) return byCustomer.user_id;
    if (!subscription.userId || !UUID.test(subscription.userId)) return null;
    const [user] = await this.dataSource.query(
      `SELECT id FROM users WHERE id = $1 AND status <> 'excluido'`,
      [subscription.userId],
    );
    return user?.id ?? null;
  }

  private async customerFor(user: User): Promise<string> {
    const [row] = await this.findByUser(user.id);
    if (row) return row.stripe_customer_id;
    const customerId = await this.gateway.createCustomer({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    await this.dataSource.query(
      `INSERT INTO subscriptions (user_id, stripe_customer_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id, customerId],
    );
    return customerId;
  }

  private findByUser(userId: string): Promise<SubscriptionRow[]> {
    return this.dataSource.query(`SELECT * FROM subscriptions WHERE user_id = $1`, [userId]);
  }
}
