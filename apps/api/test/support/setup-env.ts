import { resolveE2eDatabase } from "./e2e-database";

// Com NODE_ENV=test o ConfigModule ignora o .env (que pode apontar para serviços hospedados):
// tudo vem daqui ou do ambiente do processo.
// Sem `E2E_ISOLATED`, o banco é sempre o local fixo de teste (`DATABASE_URL` do ambiente é
// ignorada, mesmo com `CI`); com ele (scripts/e2e-isolated.sh), banco e Mailpit descartáveis já
// vêm no ambiente.
process.env.DATABASE_URL = resolveE2eDatabase(process.env).url;
process.env.NODE_ENV = "test";
process.env.MODERATION_WITHOUT_AI = "approve";
process.env.OPENROUTER_API_KEY = "";
// Stripe nunca é chamado nos e2e: o gateway é substituído por `fakeStripe` quando preciso.
process.env.STRIPE_SECRET_KEY = "";
process.env.STRIPE_WEBHOOK_SECRET = "";
process.env.STRIPE_PRICE_PRO = "";
process.env.BETTER_AUTH_SECRET ??= "e2e-secret-e2e-secret-e2e-secret-123456";
// Os e2e leem os links de confirmação no Mailpit; nunca enviam pelo provedor real.
process.env.MAIL_TRANSPORT = "smtp";
if (!process.env.E2E_ISOLATED) process.env.SMTP_URL = "smtp://localhost:1025";
process.env.MAIL_FROM = "Aqui no Prédio <nao-responda@aquinopredio.local>";
process.env.RESEND_API_KEY = "";
// Integrações externas desligadas mesmo que exportadas no shell: Realtime faria POST no projeto
// Supabase e o push chamaria os endpoints das inscrições.
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SECRET_KEY = "";
process.env.VAPID_PUBLIC_KEY = "";
process.env.VAPID_PRIVATE_KEY = "";
