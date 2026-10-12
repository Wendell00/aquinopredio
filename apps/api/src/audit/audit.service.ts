import { Global, Injectable, Module } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";

/** Trilha de auditoria de moderação e administração (RNF-015). */
@Injectable()
export class AuditService {
  constructor(private readonly dataSource: DataSource) {}

  async log(
    actorId: string | null,
    action: string,
    target: { type: string; id: string | null },
    details: Record<string, unknown> = {},
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ?? this.dataSource).query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)`,
      [actorId, action, target.type, target.id, JSON.stringify(details)],
    );
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
