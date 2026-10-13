export interface MailContent {
  subject: string;
  /** Resumo que o cliente de e-mail mostra ao lado do assunto, antes de abrir a mensagem. */
  preheader: string;
  /** Identifica o tipo de e-mail nos relatórios do provedor (letras, números, `_` e `-`). */
  tag: string;
  /** Saudação + parágrafos, em texto puro (escapado na renderização). */
  greeting: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footnote?: string;
  /** Valores das variáveis quando o e-mail é enviado por um template hospedado no Resend. */
  variables?: Record<string, string>;
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// Mesmos tokens do `@theme` do web; clientes de e-mail não leem CSS externo nem variáveis.
const color = {
  brand: "#d63700",
  ink: "#1f2421",
  inkSoft: "#545b57",
  cream: "#fff9f3",
  line: "#efe4da",
  // `muted` do web (#8a908c) não passa 4.5:1 sobre branco em texto pequeno.
  muted: "#6b716d",
} as const;

const font = "Arial,Helvetica,sans-serif";

/**
 * HTML em tabelas com estilos inline: é o que Outlook, Gmail e Apple Mail renderizam de forma
 * consistente. Sempre acompanha uma versão texto (melhora a entrega e serve leitores de tela).
 */
export function renderMail(content: MailContent, { appUrl }: { appUrl: string }): RenderedMail {
  const origin = new URL(appUrl).origin;
  const logoUrl = `${origin}/logo-horizontal.png`;

  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${font};font-size:16px;line-height:24px;color:${color.ink}">${escapeHtml(p)}</p>`,
    )
    .join("\n");

  const action = content.action
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 24px">
<tr><td align="center" bgcolor="${color.brand}" style="border-radius:999px">
<a href="${escapeHtml(content.action.url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(content.action.label)}</a>
</td></tr>
</table>
<p style="margin:0 0 8px;font-family:${font};font-size:13px;line-height:20px;color:${color.muted}">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
<p style="margin:0 0 16px;font-family:${font};font-size:13px;line-height:20px;word-break:break-all"><a href="${escapeHtml(content.action.url)}" target="_blank" style="color:${color.brand}">${escapeHtml(content.action.url)}</a></p>`
    : "";

  const footnote = content.footnote
    ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${color.line};font-family:${font};font-size:13px;line-height:20px;color:${color.inkSoft}">${escapeHtml(content.footnote)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${color.cream}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(content.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${color.cream}" style="background:${color.cream}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 8px 24px">
<a href="${escapeHtml(origin)}" target="_blank"><img src="${escapeHtml(logoUrl)}" width="152" height="60" alt="Aqui no Prédio" style="display:block;border:0;outline:none;font-family:${font};font-size:20px;font-weight:800;color:${color.brand}"></a>
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${color.line};border-radius:18px;padding:32px 28px">
<h1 style="margin:0 0 16px;font-family:${font};font-size:22px;line-height:28px;font-weight:800;color:${color.ink}">${escapeHtml(content.greeting)}</h1>
${paragraphs}
${action}
${footnote}
</td></tr>
<tr><td style="padding:24px 8px 0;font-family:${font};font-size:12px;line-height:18px;color:${color.muted}">
Você recebeu este e-mail porque há uma conta no Aqui no Prédio com este endereço. Esta é uma mensagem automática.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    content.greeting,
    ...content.paragraphs,
    content.action ? `${content.action.label}: ${content.action.url}` : "",
    content.footnote ?? "",
    "— Aqui no Prédio",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject: content.subject, html, text };
}

export const mailTemplates = {
  verifyEmail: (name: string, url: string): MailContent => ({
    subject: "Confirme seu e-mail no Aqui no Prédio",
    preheader: "Falta um passo: confirme seu e-mail para começar a usar o Aqui no Prédio.",
    tag: "verify-email",
    greeting: `Olá, ${name}!`,
    paragraphs: [
      "Que bom ter você por aqui. Falta só um passo para encontrar e divulgar serviços entre os vizinhos do seu prédio.",
      "Confirme seu e-mail tocando no botão abaixo:",
    ],
    action: { label: "Confirmar meu e-mail", url },
    footnote:
      "O link vale por 1 hora e só pode ser usado uma vez. Se você não criou uma conta, é só ignorar este e-mail — nenhuma conta será ativada.",
    variables: { NAME: name, VERIFICATION_URL: url },
  }),
  resetPassword: (name: string, url: string): MailContent => ({
    subject: "Redefina sua senha",
    preheader: "Use o link para criar uma nova senha. Ele vale por 1 hora.",
    tag: "reset-password",
    greeting: `Olá, ${name}!`,
    paragraphs: ["Recebemos um pedido para redefinir a senha da sua conta."],
    action: { label: "Criar nova senha", url },
    footnote:
      "O link vale por 1 hora. Se não foi você, ignore este e-mail — sua senha continua a mesma.",
  }),
  passwordChanged: (name: string): MailContent => ({
    subject: "Sua senha foi alterada",
    preheader: "Se não foi você, redefina sua senha agora.",
    tag: "password-changed",
    greeting: `Olá, ${name}!`,
    paragraphs: [
      "A senha da sua conta acabou de ser alterada e as outras sessões foram encerradas.",
      "Se não foi você, redefina sua senha agora e fale com o suporte.",
    ],
  }),
};

/**
 * HTML dos templates publicados no Resend: o mesmo layout do app, com as variáveis do Resend
 * (`{{{NOME}}}`) no lugar dos dados do usuário. Arquivos em `src/mail/resend/`.
 */
export function resendTemplates(): Record<string, string> {
  const origin = "https://dominio.invalid";
  const html = (content: MailContent) =>
    renderMail(content, { appUrl: origin }).html.replaceAll(origin, "{{{APP_URL}}}");
  return {
    "verify-email.html": html(mailTemplates.verifyEmail("{{{NAME}}}", "{{{VERIFICATION_URL}}}")),
  };
}
