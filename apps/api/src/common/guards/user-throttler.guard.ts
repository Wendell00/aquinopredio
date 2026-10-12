import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { RequestWithAuth } from "../../auth/auth.guard";

/**
 * Rate limit por usuário quando há sessão (RNF-011) e por IP para visitantes.
 * Precisa rodar depois do AuthGuard (ordem definida no AppModule).
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as RequestWithAuth;
    return request.auth ? `user:${request.auth.user.id}` : `ip:${request.ip ?? "desconhecido"}`;
  }
}
