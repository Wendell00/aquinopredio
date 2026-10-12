import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { DataSource } from "typeorm";
import { z } from "zod";
import type { Env } from "../config/env";

export type AiTask = "ad_generation" | "building_validation" | "moderation";

const MODEL_ENV: Record<AiTask, keyof Env> = {
  ad_generation: "OPENROUTER_MODEL_AD_GENERATION",
  building_validation: "OPENROUTER_MODEL_BUILDING_VALIDATION",
  moderation: "OPENROUTER_MODEL_MODERATION",
};

const TIMEOUT_MS: Record<AiTask, number> = {
  ad_generation: 30_000,
  building_validation: 45_000,
  moderation: 20_000,
};

/** IA indisponível (sem chave, fora do ar ou resposta inválida) — quem chama aplica a RN-113. */
export class AiUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiUnavailableError";
  }
}

export interface StructuredRequest<TSchema extends z.ZodType> {
  task: AiTask;
  promptVersion: string;
  schemaName: string;
  schema: TSchema;
  system: string;
  /** Conteúdo do usuário: texto (sempre delimitado) e imagens por URL. */
  userText: string;
  imageUrls?: string[];
  userId?: string | null;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

/**
 * Cliente de IA via OpenRouter (API compatível com OpenAI). Toda resposta é JSON estruturado
 * validado com zod; resposta inválida → 1 nova tentativa → `AiUnavailableError`.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI | null;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly dataSource: DataSource,
  ) {
    const apiKey = config.get("OPENROUTER_API_KEY", { infer: true });
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          baseURL: config.get("OPENROUTER_BASE_URL", { infer: true }),
          maxRetries: 1,
          defaultHeaders: {
            "HTTP-Referer": config.get("OPENROUTER_SITE_URL", { infer: true }),
            "X-Title": config.get("OPENROUTER_APP_NAME", { infer: true }),
          },
        })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async structured<TSchema extends z.ZodType>(
    request: StructuredRequest<TSchema>,
  ): Promise<StructuredResult<z.infer<TSchema>>> {
    if (!this.client) throw new AiUnavailableError("IA não configurada");
    const model = String(this.config.get(MODEL_ENV[request.task]));
    const content: ChatCompletionContentPart[] = [
      { type: "text", text: request.userText },
      ...(request.imageUrls ?? []).map(
        (url): ChatCompletionContentPart => ({ type: "image_url", image_url: { url } }),
      ),
    ];
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: request.system },
      { role: "user", content },
    ];
    const jsonSchema = z.toJSONSchema(request.schema, { target: "draft-7" }) as Record<
      string,
      unknown
    >;

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      try {
        const completion = await this.client.chat.completions.create(
          {
            model,
            messages,
            temperature: request.task === "ad_generation" ? 0.6 : 0,
            response_format: {
              type: "json_schema",
              json_schema: { name: request.schemaName, schema: jsonSchema, strict: true },
            },
          },
          { timeout: TIMEOUT_MS[request.task] },
        );
        const raw = completion.choices[0]?.message?.content ?? "";
        const data = request.schema.parse(JSON.parse(raw));
        await this.record(request, model, Date.now() - started, true, completion.usage);
        return {
          data,
          model: completion.model ?? model,
          tokensIn: completion.usage?.prompt_tokens ?? null,
          tokensOut: completion.usage?.completion_tokens ?? null,
        };
      } catch (error) {
        lastError = error;
        await this.record(request, model, Date.now() - started, false, undefined, error);
        this.logger.warn(
          `IA (${request.task}) falhou na tentativa ${attempt + 1}: ${(error as Error).message}`,
        );
      }
    }
    throw new AiUnavailableError("IA indisponível no momento", { cause: lastError });
  }

  /** Quantas chamadas bem-sucedidas o usuário fez hoje para a tarefa (limite diário, RN-110). */
  async countToday(userId: string, task: AiTask): Promise<number> {
    const [row] = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM ai_calls
       WHERE user_id = $1 AND task = $2 AND success AND created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`,
      [userId, task],
    );
    return row?.total ?? 0;
  }

  private async record(
    request: StructuredRequest<z.ZodType>,
    model: string,
    latencyMs: number,
    success: boolean,
    usage?: { prompt_tokens?: number; completion_tokens?: number },
    error?: unknown,
  ): Promise<void> {
    await this.dataSource
      .query(
        `INSERT INTO ai_calls (task, user_id, model, prompt_version, tokens_in, tokens_out, latency_ms, success, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          request.task,
          request.userId ?? null,
          model,
          request.promptVersion,
          usage?.prompt_tokens ?? null,
          usage?.completion_tokens ?? null,
          latencyMs,
          success,
          error ? String((error as Error).message).slice(0, 500) : null,
        ],
      )
      .catch((cause) => this.logger.error("Falha ao registrar chamada de IA", cause));
  }
}

/** Delimita conteúdo do usuário no prompt (proteção contra prompt injection, RNF-014). */
export function delimit(label: string, content: string): string {
  const safe = content.replaceAll("</", "<\\/");
  return `<${label}>\n${safe}\n</${label}>`;
}
