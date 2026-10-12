export interface MailContent {
  subject: string;
  /** Saudação + parágrafos, em texto puro (escapado na renderização). */
  greeting: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footnote?: string;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** HTML simples com estilos inline (clientes de e-mail ignoram CSS externo) + versão texto. */
export function renderMail(content: MailContent): { subject: string; html: string; text: string } {
  const button = content.action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(content.action.url)}" style="background:#d63700;color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px;display:inline-block">${escapeHtml(content.action.label)}</a></p>
<p style="font-size:13px;color:#8a908c">Se o botão não funcionar, copie e cole este endereço no navegador:<br>${escapeHtml(content.action.url)}</p>`
    : "";
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#fff9f3;font-family:Arial,Helvetica,sans-serif;color:#1f2421">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-size:20px;font-weight:800;color:#d63700;margin:0 0 24px">Aqui no Prédio</p>
<p style="font-size:16px;margin:0 0 16px">${escapeHtml(content.greeting)}</p>
${content.paragraphs.map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${escapeHtml(p)}</p>`).join("\n")}
${button}
${content.footnote ? `<p style="font-size:13px;color:#8a908c;margin-top:28px">${escapeHtml(content.footnote)}</p>` : ""}
</div></body></html>`;
  const text = [
    content.greeting,
    ...content.paragraphs,
    content.action ? `${content.action.label}: ${content.action.url}` : "",
    content.footnote ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject: content.subject, html, text };
}

export const mailTemplates = {
  verifyEmail: (name: string, url: string): MailContent => ({
    subject: "Confirme seu e-mail",
    greeting: `Olá, ${name}!`,
    paragraphs: [
      "Falta pouco para você encontrar e divulgar serviços no seu prédio.",
      "Confirme seu e-mail para entrar:",
    ],
    action: { label: "Confirmar e-mail", url },
    footnote: "O link vale por 1 hora. Se você não criou uma conta, ignore este e-mail.",
  }),
  resetPassword: (name: string, url: string): MailContent => ({
    subject: "Redefina sua senha",
    greeting: `Olá, ${name}!`,
    paragraphs: ["Recebemos um pedido para redefinir a senha da sua conta."],
    action: { label: "Criar nova senha", url },
    footnote:
      "O link vale por 1 hora. Se não foi você, ignore este e-mail — sua senha continua a mesma.",
  }),
  passwordChanged: (name: string): MailContent => ({
    subject: "Sua senha foi alterada",
    greeting: `Olá, ${name}!`,
    paragraphs: [
      "A senha da sua conta acabou de ser alterada e as outras sessões foram encerradas.",
      "Se não foi você, redefina sua senha agora e fale com o suporte.",
    ],
  }),
};
