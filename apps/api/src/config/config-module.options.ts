import type { ConfigModuleOptions } from "@nestjs/config";
import { validateEnv } from "./env";

/**
 * Nos testes o ambiente vem só do processo (como no CI, que não tem `.env`): o `.env` local pode
 * apontar para banco e serviços hospedados. Função, e não constante, para ler `NODE_ENV` na hora.
 */
export function configModuleOptions(): ConfigModuleOptions {
  return {
    isGlobal: true,
    cache: true,
    ignoreEnvFile: process.env.NODE_ENV === "test",
    validate: validateEnv,
  };
}
