import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { UserRole } from "@repo/shared";
import type { RequestWithAuth } from "../../auth/auth.guard";
import type { User } from "../../users/user.entity";

export const IS_PUBLIC = "auth:isPublic";
export const ALLOW_ONBOARDING = "auth:allowOnboarding";
export const ROLES = "auth:roles";

/** Rota sem login (landing, health, busca de CEP no cadastro…). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Rota liberada para quem ainda não concluiu o onboarding (RN-005). */
export const AllowOnboarding = () => SetMetadata(ALLOW_ONBOARDING, true);

/** Restringe a rota a papéis da plataforma. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

/** Usuário autenticado da requisição (sempre presente em rotas não públicas). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  const request = ctx.switchToHttp().getRequest<RequestWithAuth>();
  if (!request.auth) throw new Error("CurrentUser usado em rota pública");
  return request.auth.user;
});
