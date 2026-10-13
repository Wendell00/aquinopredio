import type { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { MailService } from "./mail.service";
import { mailTemplates } from "./templates";

function configWith(values: Partial<Env>): ConfigService<Env, true> {
  const env: Partial<Env> = {
    APP_URL: "https://aquinopredio.com.br",
    MAIL_FROM: "Aqui no Prédio <nao-responda@aquinopredio.com.br>",
    MAIL_TRANSPORT: "resend",
    RESEND_API_URL: "https://api.resend.com",
    RESEND_API_KEY: "re_teste",
    SMTP_URL: "smtp://localhost:1025",
    ...values,
  };
  return { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>;
}

describe("MailService com Resend", () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("envia o e-mail de confirmação pela API do Resend", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "email_123" }));
    const service = new MailService(configWith({ MAIL_REPLY_TO: "contato@aquinopredio.com.br" }));

    await service.send("ana@example.com", mailTemplates.verifyEmail("Ana", "https://x.dev/v?t=1"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_teste");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      from: "Aqui no Prédio <nao-responda@aquinopredio.com.br>",
      to: ["ana@example.com"],
      reply_to: "contato@aquinopredio.com.br",
      subject: "Confirme seu e-mail no Aqui no Prédio",
      tags: [{ name: "category", value: "verify-email" }],
    });
    expect(body.html).toContain("https://x.dev/v?t=1");
    expect(body.text).toContain("https://x.dev/v?t=1");
  });

  it("usa o template publicado no Resend quando configurado", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "email_123" }));
    const service = new MailService(configWith({ RESEND_TEMPLATE_VERIFY_EMAIL: "verify-email" }));

    await service.send("ana@example.com", mailTemplates.verifyEmail("Ana", "https://x.dev/v?t=1"));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.template).toEqual({
      id: "verify-email",
      variables: {
        NAME: "Ana",
        VERIFICATION_URL: "https://x.dev/v?t=1",
        APP_URL: "https://aquinopredio.com.br",
      },
    });
    expect(body).not.toHaveProperty("html");
    expect(body).not.toHaveProperty("text");
    expect(body).not.toHaveProperty("subject");
  });

  it("gera o HTML no app para e-mails sem template configurado", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "email_123" }));
    const service = new MailService(configWith({ RESEND_TEMPLATE_VERIFY_EMAIL: "verify-email" }));

    await service.send("ana@example.com", mailTemplates.resetPassword("Ana", "https://x.dev/r"));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).not.toHaveProperty("template");
    expect(body.subject).toBe("Redefina sua senha");
  });

  it("falha quando o Resend recusa o envio", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { name: "validation_error", message: "domínio não verificado" },
        { status: 403 },
      ),
    );
    const service = new MailService(configWith({}));
    jest
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, "error")
      .mockImplementation();

    await expect(
      service.send("ana@example.com", mailTemplates.verifyEmail("Ana", "https://x.dev")),
    ).rejects.toThrow(/HTTP 403/);
  });
});
