import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@repo/shared";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { ALLOW_ONBOARDING, IS_PUBLIC, ROLES } from "../common/decorators/auth.decorators";
import type { User } from "../users/user.entity";
import { UsersService } from "../users/users.service";
import type { Auth, AuthSession } from "./auth";
import { AUTH } from "./auth.constants";

export interface RequestWithAuth extends Request {
  auth?: { user: User; session: AuthSession["session"] };
}

/**
 * Guard global: toda rota exige sessão válida, exceto as marcadas com `@Public()`.
 * Também barra contas banidas/excluídas e quem não concluiu o onboarding (RN-005).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const request = context.switchToHttp().getRequest<RequestWithAuth>();

    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      if (isPublic) return true;
      throw new UnauthorizedException("Faça login para continuar");
    }

    const user = await this.users.loadForRequest(session.user.id);
    if (!user || user.status === "banido" || user.status === "excluido") {
      if (isPublic) return true;
      throw new UnauthorizedException("Sessão inválida");
    }
    request.auth = { user, session: session.session };
    if (isPublic) return true;

    const allowOnboarding = this.reflector.getAllAndOverride<boolean>(ALLOW_ONBOARDING, targets);
    if (user.status === "onboarding_pendente" && !allowOnboarding) {
      throw new ForbiddenException({
        message: "Conclua seu cadastro para continuar",
        code: "ONBOARDING_REQUIRED",
      });
    }

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException("Você não tem permissão para isso");
    }
    return true;
  }
}
