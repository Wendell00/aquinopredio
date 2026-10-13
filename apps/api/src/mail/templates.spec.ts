import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mailTemplates, renderMail, resendTemplates } from "./templates";

const appUrl = "https://aquinopredio.com.br/qualquer/caminho";

describe("renderMail", () => {
  it("monta o e-mail de confirmação com botão, link alternativo e versão texto", () => {
    const url = "https://aquinopredio.com.br/api/auth/verify-email?token=abc&callbackURL=%2F";
    const mail = renderMail(mailTemplates.verifyEmail("Ana", url), { appUrl });

    expect(mail.subject).toBe("Confirme seu e-mail no Aqui no Prédio");
    expect(mail.html).toContain("Confirmar meu e-mail");
    expect(mail.html).toContain(url.replaceAll("&", "&amp;"));
    expect(mail.html).toContain('src="https://aquinopredio.com.br/logo-horizontal.png"');
    expect(mail.html).toContain('alt="Aqui no Prédio"');
    expect(mail.text).toContain(`Confirmar meu e-mail: ${url}`);
    expect(mail.text).toContain("Olá, Ana!");
  });

  it("escapa o nome do usuário no HTML", () => {
    const mail = renderMail(
      mailTemplates.verifyEmail('<img src=x onerror="alert(1)">', "https://x.dev"),
      {
        appUrl,
      },
    );
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("omite botão quando o e-mail não tem ação", () => {
    const mail = renderMail(mailTemplates.passwordChanged("Ana"), { appUrl });
    expect(mail.html).not.toContain("Se o botão não funcionar");
  });
});

describe("templates hospedados no Resend", () => {
  it.each(Object.entries(resendTemplates()))("%s está atualizado", (file, html) => {
    // Se falhar: pnpm --filter api build && pnpm --filter api mail:export, e republique no Resend.
    expect(readFileSync(join(__dirname, "resend", file), "utf8")).toBe(html);
  });
});
