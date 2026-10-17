import { Injectable, Logger } from "@nestjs/common";
import type { Plan, PlanLimits } from "@repo/shared";
import { DataSource, type EntityManager } from "typeorm";
import { NotificationsService } from "../notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";

/** Regras do plano Free/Pro (RN-140 a RN-145). O plano em si é decidido pela assinatura no Stripe. */
@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  async planOf(userId: string): Promise<Plan> {
    const [row] = await this.dataSource.query(`SELECT plan FROM users WHERE id = $1`, [userId]);
    return row?.plan === "pro" ? "pro" : "free";
  }

  async limits(plan: Plan): Promise<PlanLimits> {
    if (plan === "pro") {
      return {
        maxRadiusKm: await this.settings.get("plans.proMaxRadiusKm"),
        featuredAds: await this.settings.get("plans.proFeaturedAds"),
        adActiveDays: null,
      };
    }
    return {
      maxRadiusKm: await this.settings.get("plans.freeMaxRadiusKm"),
      featuredAds: 0,
      adActiveDays: await this.settings.get("ads.activeDays"),
    };
  }

  proPriceCents(): Promise<number> {
    return this.settings.get("plans.proPriceCents");
  }

  /** Grava o novo plano e aplica as consequências quando ele muda. */
  async setPlan(userId: string, plan: Plan): Promise<void> {
    const changed = await this.dataSource.transaction(async (manager) => {
      const [row] = await manager.query(`SELECT plan FROM users WHERE id = $1 FOR UPDATE`, [
        userId,
      ]);
      if (!row || row.plan === plan) return false;
      await manager.query(`UPDATE users SET plan = $2, updated_at = now() WHERE id = $1`, [
        userId,
        plan,
      ]);
      if (plan === "free") await this.downgrade(manager, userId);
      return true;
    });
    if (!changed) return;
    this.logger.log(`Plano de ${userId} agora é ${plan}`);
    const { maxRadiusKm } = await this.limits(plan);
    const km = maxRadiusKm.toLocaleString("pt-BR");
    await this.notifications.notify(
      userId,
      plan === "pro"
        ? {
            type: "plano_atualizado",
            title: "Plano Pro ativo",
            body: `Seus anúncios podem alcançar até ${km} km, não expiram e você pode destacar um deles.`,
            url: "/meus-anuncios",
          }
        : {
            type: "plano_atualizado",
            title: "Você voltou ao plano Free",
            body: `O alcance dos anúncios foi ajustado para até ${km} km e o destaque foi retirado.`,
            url: "/plano",
          },
    );
  }

  /**
   * RN-145: sem o Pro, os anúncios voltam às regras do Free — raio reduzido, sem destaque e
   * com prazo de validade contado a partir de agora (ninguém perde anúncio no dia da troca).
   */
  private async downgrade(manager: EntityManager, userId: string): Promise<void> {
    const freeMaxM = (await this.settings.get("plans.freeMaxRadiusKm")) * 1000;
    const days = await this.settings.get("ads.activeDays");
    await manager.query(
      `UPDATE ads SET featured_at = NULL,
              radius_m = LEAST(radius_m, $2),
              expires_at = CASE WHEN status IN ('ativo', 'pausado', 'em_moderacao')
                                THEN GREATEST(COALESCE(expires_at, now()), now() + make_interval(days => $3))
                                ELSE expires_at END,
              expiry_warned_at = NULL,
              updated_at = now()
       WHERE user_id = $1 AND status <> 'excluido'`,
      [userId, freeMaxM, days],
    );
  }
}
