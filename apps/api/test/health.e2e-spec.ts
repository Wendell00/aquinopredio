import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/app";

describe("Health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/health responde ok com o banco no ar", async () => {
    const response = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(response.body).toMatchObject({ status: "ok", database: "up" });
  });

  it("envia cabeçalhos de segurança (helmet)", async () => {
    const response = await request(app.getHttpServer()).get("/api/health");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
