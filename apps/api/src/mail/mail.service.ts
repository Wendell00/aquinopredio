import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";
import type { Env } from "../config/env";
import { type MailContent, renderMail } from "./templates";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    this.transporter = createTransport(config.get("SMTP_URL", { infer: true }));
    this.from = config.get("MAIL_FROM", { infer: true });
  }

  async send(to: string, content: MailContent): Promise<void> {
    const { subject, html, text } = renderMail(content);
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html, text });
    } catch (error) {
      // Não logamos o destinatário (dado pessoal).
      this.logger.error(`Falha ao enviar e-mail "${subject}"`, error);
      throw error;
    }
  }
}
