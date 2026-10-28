import type { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { ChatRealtimeService } from "./chat-realtime.service";

function configWith(values: Partial<Env>): ConfigService<Env, true> {
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
}

const configured = configWith({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_teste",
});

describe("ChatRealtimeService", () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(Response.json({}, { status: 202 }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("não expõe canal nem publica quando o Supabase não está configurado", () => {
    const service = new ChatRealtimeService(configWith({}));

    expect(service.topicFor("user-1")).toBeNull();
    service.notify(["user-1"], "conversa-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gera um canal estável por usuário que não revela o id", () => {
    const service = new ChatRealtimeService(configured);
    const topic = service.topicFor("user-1");

    expect(topic).toBe(service.topicFor("user-1"));
    expect(topic).not.toBe(service.topicFor("user-2"));
    expect(topic).not.toContain("user-1");
  });

  it("publica só o id da conversa no canal de cada participante", () => {
    const service = new ChatRealtimeService(configured);

    service.notify(["user-1", "user-2", "user-1"], "conversa-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://abc.supabase.co/realtime/v1/api/broadcast");
    expect(new Headers(init?.headers).get("apikey")).toBe("sb_secret_teste");
    const body = JSON.parse(String(init?.body));
    expect(body.messages).toEqual([
      {
        topic: service.topicFor("user-1"),
        event: "conversation",
        payload: { conversationId: "conversa-1" },
        private: false,
      },
      {
        topic: service.topicFor("user-2"),
        event: "conversation",
        payload: { conversationId: "conversa-1" },
        private: false,
      },
    ]);
  });

  it("não derruba o envio da mensagem se o Supabase falhar", async () => {
    fetchMock.mockRejectedValue(new Error("rede fora"));
    const service = new ChatRealtimeService(configured);

    expect(() => service.notify(["user-1"], "conversa-1")).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });
});
