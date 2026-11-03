import type { ConfigService } from "@nestjs/config";
import type { DataSource } from "typeorm";
import { z } from "zod";
import type { Env } from "../config/env";
import { AiService } from "./ai.service";

const create = jest.fn();
// Borda: sem chamada de rede ao provedor.
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ chat: { completions: { create } } })),
}));

describe("AiService — rastreio da chamada (P00-B1, spec 5.7)", () => {
  it("grava em ai_calls o correlation_id de quem originou a chamada", async () => {
    create.mockResolvedValue({
      model: "fake/model",
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    });
    const query = jest.fn().mockResolvedValue([]);
    const config = { get: (key: string) => (key === "OPENROUTER_API_KEY" ? "chave" : "x") };
    const service = new AiService(
      config as unknown as ConfigService<Env, true>,
      { query } as unknown as DataSource,
    );

    await service.structured({
      task: "moderation",
      promptVersion: "v1",
      schemaName: "teste",
      schema: z.strictObject({ ok: z.boolean() }),
      system: "sistema",
      userText: "texto",
      correlationId: "run-123",
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("correlation_id");
    expect(params.at(-1)).toBe("run-123");
  });
});
