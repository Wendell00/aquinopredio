import { ConflictException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  type CompleteProfileInput,
  type NotificationPrefs,
  type UpdateProfileInput,
  type UsernameAvailability,
  usernameSchema,
} from "@repo/shared";
import { QueryFailedError, Repository } from "typeorm";

const USERNAME_TAKEN = "Este nome de usuário já está em uso";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === "23505"
  );
}

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

  /** Passo 1 do onboarding: nome, nome de usuário, aceite de termos e 18+ (RN-004, RN-006). */
  async completeProfile(user: User, input: CompleteProfileInput): Promise<User> {
    await this.assertUsernameFree(input.username, user.id);
    user.name = input.name;
    user.username = input.username;
    user.termsAcceptedAt ??= new Date();
    user.updatedAt = new Date();
    return this.saveProfile(user);
  }

  async updateProfile(user: User, input: UpdateProfileInput): Promise<User> {
    if (input.username) await this.assertUsernameFree(input.username, user.id);
    Object.assign(user, input, { updatedAt: new Date() });
    return this.saveProfile(user);
  }

  /** Consulta para o formulário avisar antes de enviar; a garantia é o índice único. */
  async usernameAvailability(raw: string, exceptUserId: string): Promise<UsernameAvailability> {
    const parsed = usernameSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        username: raw,
        available: false,
        reason: parsed.error.issues[0]?.message ?? "Nome inválido",
      };
    }
    const taken = await this.isUsernameTaken(parsed.data, exceptUserId);
    return {
      username: parsed.data,
      available: !taken,
      reason: taken ? USERNAME_TAKEN : null,
    };
  }

  private async isUsernameTaken(username: string, exceptUserId: string): Promise<boolean> {
    const found = await this.repo.findOneBy({ username });
    return Boolean(found && found.id !== exceptUserId);
  }

  private async assertUsernameFree(username: string, exceptUserId: string): Promise<void> {
    if (await this.isUsernameTaken(username, exceptUserId)) {
      throw new ConflictException(USERNAME_TAKEN);
    }
  }

  // Duas pessoas podem pedir o mesmo nome ao mesmo tempo: o índice único decide.
  private async saveProfile(user: User): Promise<User> {
    try {
      return await this.repo.save(user);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(USERNAME_TAKEN);
      throw error;
    }
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
