import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport } from "nodemailer";
import { z } from "zod";
import type { Env } from "../config/env";
import { type MailContent, type RenderedMail, renderMail } from "./templates";

interface OutgoingMail extends RenderedMail {
  from: string;
  to: string;
  replyTo?: string;
  tag: string;
  variables?: Record<string, string>;
}

type SendFn = (mail: OutgoingMail) => Promise<void>;

const resendResponseSchema = z.object({ id: z.string() });

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly sendFn: SendFn;
  private readonly from: string;
  private readonly replyTo: string | undefined;
  private readonly appUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get("MAIL_FROM", { infer: true });
    this.replyTo = config.get("MAIL_REPLY_TO", { infer: true });
    this.appUrl = config.get("APP_URL", { infer: true });
    this.sendFn =
      config.get("MAIL_TRANSPORT", { infer: true }) === "resend"
        ? resendTransport(
            config.get("RESEND_API_URL", { infer: true }),
            // O env exige a chave quando o transporte é `resend`.
            config.get("RESEND_API_KEY", { infer: true }) ?? "",
            { "verify-email": config.get("RESEND_TEMPLATE_VERIFY_EMAIL", { infer: true }) },
            this.appUrl,
          )
        : smtpTransport(config.get("SMTP_URL", { infer: true }));
  }

  async send(to: string, content: MailContent): Promise<void> {
    const rendered = renderMail(content, { appUrl: this.appUrl });
    try {
      await this.sendFn({
        ...rendered,
        from: this.from,
        to,
        replyTo: this.replyTo,
        tag: content.tag,
        variables: content.variables,
      });
    } catch (error) {
      // Não logamos o destinatário (dado pessoal).
      this.logger.error(`Falha ao enviar e-mail "${content.tag}"`, error);
      throw error;
    }
  }
}

function smtpTransport(url: string): SendFn {
  const transporter = createTransport(url);
  return async ({ from, to, replyTo, subject, html, text }) => {
    await transporter.sendMail({ from, to, replyTo, subject, html, text });
  };
}

/**
 * API HTTP do Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Se houver template publicado para a categoria, o conteúdo vem dele e o app só manda as variáveis.
 */
function resendTransport(
  baseUrl: string,
  apiKey: string,
  templates: Record<string, string | undefined>,
  appUrl: string,
): SendFn {
  const appOrigin = new URL(appUrl).origin;
  return async ({ from, to, replyTo, subject, html, text, tag, variables }) => {
    const templateId = templates[tag];
    // Com template, o Resend recusa `html`/`text`; o assunto fica o definido no painel.
    const content =
      templateId && variables
        ? { template: { id: templateId, variables: { ...variables, APP_URL: appOrigin } } }
        : { subject, html, text };
    const response = await fetch(new URL("/emails", baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        ...content,
        ...(replyTo ? { reply_to: replyTo } : {}),
        tags: [{ name: "category", value: tag }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // O corpo de erro do Resend traz só `name`/`message` — sem destinatário nem conteúdo.
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend respondeu HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
    resendResponseSchema.parse(await response.json());
  };
}
