// Regressão do isolamento de ambiente dos e2e, só com valores fictícios: um `.env` temporário
// (lido no lugar do `apps/api/.env` real via `process.cwd`) e integrações exportadas no processo.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import webpush from "web-push";
import { ChatRealtimeService } from "../../src/chat/chat-realtime.service";
import { configModuleOptions } from "../../src/config/config-module.options";
import type { Env } from "../../src/config/env";
import { MailService } from "../../src/mail/mail.service";
import { mailTemplates } from "../../src/mail/templates";
import { NotificationsService } from "../../src/notifications/notifications.service";

const sendMail = jest.fn(async () => ({}));
const createTransport = jest.fn((_url: string) => ({ sendMail }));
jest.mock("nodemailer", () => ({ createTransport: (url: string) => createTransport(url) }));

const FAKE = {
  SUPABASE_URL: "https://projeto-ficticio.supabase.example.invalid",
  SUPABASE_SECRET_KEY: "sb_secret_ficticia",
  VAPID_PUBLIC_KEY: "chave_publica_ficticia",
  VAPID_PRIVATE_KEY: "chave_privada_ficticia",
  RESEND_API_KEY: "re_ficticia",
  MAIL_TRANSPORT: "resend",
};
const original = { ...process.env };
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "e2e-dotenv-"));
  writeFileSync(
    join(dir, ".env"),
    [
      "STORAGE_BUCKET=bucket-do-dotenv",
      ...Object.entries(FAKE).map(([key, value]) => `${key}=${value}`),
    ].join("\n"),
  );
  jest.spyOn(process, "cwd").mockReturnValue(dir);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json({ id: "x" }));
  global.fetch = fetchMock as unknown as typeof fetch;
  createTransport.mockClear();
  sendMail.mockClear();
  process.env = {
    PATH: original.PATH,
    BETTER_AUTH_SECRET: "segredo-ficticio-segredo-ficticio-123",
    DATABASE_URL: "postgresql://usuario:senha@banco.example.invalid:5432/db",
  };
});

afterEach(() => {
  process.env = { ...original };
  jest.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

async function config(): Promise<ConfigService<Env, true>> {
  const moduleRef = await Test.createTestingModule({
    imports: [await ConfigModule.forRoot(configModuleOptions())],
  }).compile();
  return moduleRef.get(ConfigService);
}

describe("ambiente dos e2e", () => {
  it("o .env só é lido fora de NODE_ENV=test (controle do teste)", async () => {
    process.env.NODE_ENV = "development";

    expect((await config()).get("STORAGE_BUCKET", { infer: true })).toBe("bucket-do-dotenv");
  });

  it("com NODE_ENV=test o .env não fornece nenhuma configuração", async () => {
    process.env.NODE_ENV = "test";

    const values = await config();

    expect(values.get("STORAGE_BUCKET", { infer: true })).toBe("aquinopredio");
    expect(values.get("SUPABASE_URL", { infer: true })).toBeUndefined();
    expect(values.get("RESEND_API_KEY", { infer: true })).toBeUndefined();
    expect(values.get("MAIL_TRANSPORT", { infer: true })).toBe("smtp");
  });

  it("Supabase, push e Resend ficam desligados mesmo vindos do processo", async () => {
    Object.assign(process.env, FAKE);
    jest.isolateModules(() => {
      jest.requireActual("../support/setup-env");
    });
    const setVapidDetails = jest.spyOn(webpush, "setVapidDetails");

    const moduleRef = await Test.createTestingModule({
      imports: [await ConfigModule.forRoot(configModuleOptions())],
      providers: [
        ChatRealtimeService,
        MailService,
        NotificationsService,
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    await moduleRef.init();

    const chat = moduleRef.get(ChatRealtimeService);
    expect(chat.topicFor("usuario-1")).toBeNull();
    chat.notify(["usuario-1"], "conversa-1");
    expect(setVapidDetails).not.toHaveBeenCalled();
    await moduleRef
      .get(MailService)
      .send("pessoa@example.invalid", mailTemplates.verifyEmail("Ana", "https://x.invalid"));
    expect(createTransport).toHaveBeenCalledWith("smtp://localhost:1025");
    expect(fetchMock).not.toHaveBeenCalled();
    await moduleRef.close();
  });
});
