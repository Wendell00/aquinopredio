import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { CompleteProfileInput, NotificationPrefs, UpdateProfileInput } from "@repo/shared";
import { Repository } from "typeorm";
import { User } from "./user.entity";

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findById(id: string): Promise<User | null> {
    return this.repo.findOneBy({ id });
  }

  /** Carrega o usuário da sessão e encerra suspensões vencidas (RN-095). */
  async loadForRequest(id: string): Promise<User | null> {
    const user = await this.findById(id);
    if (user?.status === "suspenso" && user.suspendedUntil && user.suspendedUntil <= new Date()) {
      await this.repo.update(user.id, {
        status: "ativo",
        suspendedUntil: null,
        updatedAt: new Date(),
      });
      user.status = "ativo";
      user.suspendedUntil = null;
    }
    return user;
  }

  /** Passo 1 do onboarding: nome + aceite de termos + 18+ (RN-004, RN-006). */
  async completeProfile(user: User, input: CompleteProfileInput): Promise<User> {
    user.name = input.name;
    user.termsAcceptedAt ??= new Date();
    user.updatedAt = new Date();
    return this.repo.save(user);
  }

  async updateProfile(user: User, input: UpdateProfileInput): Promise<User> {
    Object.assign(user, input, { updatedAt: new Date() });
    return this.repo.save(user);
  }

  async updateNotificationPrefs(user: User, prefs: NotificationPrefs): Promise<User> {
    user.notificationPrefs = prefs;
    user.updatedAt = new Date();
    return this.repo.save(user);
  }

  async isPhoneTaken(phone: string, exceptUserId: string): Promise<boolean> {
    const found = await this.repo.findOneBy({ phone });
    return Boolean(found && found.id !== exceptUserId);
  }

  /** Ativa a conta quando o onboarding termina (termos aceitos + vínculo com prédio). */
  async activate(userId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ status: "ativo", updatedAt: new Date() })
      .where("id = :userId AND status = 'onboarding_pendente' AND terms_accepted_at IS NOT NULL", {
        userId,
      })
      .execute();
  }

  async setPrimaryBuilding(userId: string, buildingId: string | null): Promise<void> {
    await this.repo.update(userId, { primaryBuildingId: buildingId, updatedAt: new Date() });
  }
}
