import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { healthResponseSchema } from "@repo/shared";
import { DataSource } from "typeorm";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  const query = jest.fn();
  let service: HealthService;

  beforeEach(async () => {
    query.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: DataSource, useValue: { query } }],
    }).compile();
    service = moduleRef.get(HealthService);
  });

  it("retorna ok quando o banco responde", async () => {
    query.mockResolvedValue([{ "?column?": 1 }]);
    const result = await service.check();
    expect(result).toMatchObject({ status: "ok", database: "up" });
    expect(healthResponseSchema.safeParse(result).success).toBe(true);
  });

  it("retorna degraded quando o banco falha", async () => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    query.mockRejectedValue(new Error("connection refused"));
    await expect(service.check()).resolves.toMatchObject({
      status: "degraded",
      database: "down",
    });
  });
});
