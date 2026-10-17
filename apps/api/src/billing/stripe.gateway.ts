import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import type { Env } from "../config/env";

/** Estado da assinatura que o app guarda (o Stripe é a fonte da verdade). */
export interface SubscriptionSnapshot {
  id: string;
  customerId: string;
  status: Stripe.Subscription.Status;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** Gravado no checkout; usado se o cliente ainda não estiver associado no banco. */
  userId: string | null;
}

/** Evento de webhook já verificado, reduzido ao que importa: qual assinatura mudou. */
export interface BillingEvent {
  id: string;
  type: string;
  subscriptionId: string | null;
}

export class InvalidWebhookError extends Error {}

/** Estados em que o Pro vale. `past_due`: o Stripe ainda está tentando cobrar (carência). */
export const PRO_STATUSES: readonly Stripe.Subscription.Status[] = [
  "active",
  "trialing",
  "past_due",
];

/**
 * Única porta de saída para o Stripe. Nos e2e é substituída por um fake (sem rede).
 * Sem STRIPE_SECRET_KEY, `enabled` é falso e o app segue só com o plano Free.
 */
@Injectable()
export class StripeGateway {
  private readonly logger = new Logger(StripeGateway.name);
  private readonly client: Stripe | null;
  private readonly webhookSecret: string | undefined;
  private readonly proPrice: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    const key = config.get("STRIPE_SECRET_KEY", { infer: true });
    this.client = key
      ? new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "Aqui no Prédio" } })
      : null;
    this.webhookSecret = config.get("STRIPE_WEBHOOK_SECRET", { infer: true });
    this.proPrice = config.get("STRIPE_PRICE_PRO", { infer: true });
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  private stripe(): Stripe {
    if (!this.client) throw new Error("Stripe não configurado");
    return this.client;
  }

  async createCustomer(input: { userId: string; email: string; name: string }): Promise<string> {
    const customer = await this.stripe().customers.create(
      { email: input.email, name: input.name, metadata: { userId: input.userId } },
      // Dois cliques seguidos em "Assinar" não criam dois clientes.
      { idempotencyKey: `customer-${input.userId}` },
    );
    return customer.id;
  }

  async createCheckout(input: {
    userId: string;
    customerId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    if (!this.proPrice) throw new Error("STRIPE_PRICE_PRO não configurado");
    const session = await this.stripe().checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      client_reference_id: input.userId,
      line_items: [{ price: this.proPrice, quantity: 1 }],
      subscription_data: { metadata: { userId: input.userId } },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      locale: "pt-BR",
    });
    if (!session.url) throw new Error("Checkout sem URL");
    return session.url;
  }

  async createPortal(input: { customerId: string; returnUrl: string }): Promise<string> {
    const session = await this.stripe().billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
      locale: "pt-BR",
    });
    return session.url;
  }

  /** Confere a assinatura do Stripe no corpo bruto; evento falso ou adulterado é recusado. */
  parseWebhook(rawBody: Buffer, signature: string): BillingEvent {
    if (!this.webhookSecret) throw new InvalidWebhookError("Webhook não configurado");
    let event: Stripe.Event;
    try {
      event = this.stripe().webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      this.logger.warn(`Webhook recusado: ${error instanceof Error ? error.message : "inválido"}`);
      throw new InvalidWebhookError("Assinatura do webhook inválida");
    }
    return { id: event.id, type: event.type, subscriptionId: subscriptionIdOf(event) };
  }

  /** Cancela na hora (sem esperar o fim do período): usado quando a conta é excluída. */
  async cancelSubscription(id: string): Promise<void> {
    await this.stripe().subscriptions.cancel(id);
  }

  async retrieveSubscription(id: string): Promise<SubscriptionSnapshot> {
    const subscription = await this.stripe().subscriptions.retrieve(id);
    const periodEnd = subscription.items.data[0]?.current_period_end;
    return {
      id: subscription.id,
      customerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      status: subscription.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      userId: subscription.metadata.userId ?? null,
    };
  }
}

function subscriptionIdOf(event: Stripe.Event): string | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const { subscription } = event.data.object;
      if (!subscription) return null;
      return typeof subscription === "string" ? subscription : subscription.id;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return event.data.object.id;
    default:
      return null;
  }
}
