// Fora do CI, os e2e usam um banco separado para não sujar o de desenvolvimento.
// Variáveis do processo têm prioridade sobre o .env no ConfigModule.
if (!process.env.CI) {
  process.env.DATABASE_URL =
    "postgresql://aquinopredio:aquinopredio@localhost:5433/aquinopredio_test";
}
process.env.NODE_ENV = "test";
process.env.WORKERS_ENABLED = "false";
process.env.MODERATION_WITHOUT_AI = "approve";
process.env.OPENROUTER_API_KEY = "";
process.env.BETTER_AUTH_SECRET ??= "e2e-secret-e2e-secret-e2e-secret-123456";
