import { Injectable, Logger } from "@nestjs/common";
import type { HealthResponse } from "@repo/shared";
import { DataSource } from "typeorm";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<HealthResponse> {
    const database = await this.pingDatabase();
    return {
      status: database === "up" ? "ok" : "degraded",
      database,
      timestamp: new Date().toISOString(),
    };
  }

  private async pingDatabase(): Promise<HealthResponse["database"]> {
    try {
      await this.dataSource.query("SELECT 1");
      return "up";
    } catch (error) {
      this.logger.error("Banco indisponível", error);
      return "down";
    }
  }
}
