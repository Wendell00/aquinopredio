// Fora do CI, os e2e usam um banco separado para não sujar o de desenvolvimento.
// Variáveis do processo têm prioridade sobre o .env no ConfigModule.
if (!process.env.CI) {
  process.env.DATABASE_URL =
    "postgresql://aquinopredio:aquinopredio@localhost:5433/aquinopredio_test";
}
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
process.env.SMTP_URL = "smtp://localhost:1025";
process.env.MAIL_FROM = "Aqui no Prédio <nao-responda@aquinopredio.local>";
