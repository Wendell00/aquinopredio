import "server-only";
import type { Me, PublicConfig } from "@repo/shared";
import { cache } from "react";
import { ApiUnavailableError, serverGet } from "@/lib/api/server";

/** Usuário da sessão atual (ou `null`), deduplicado por requisição. */
export const getMe = cache(() => serverGet<Me>("/me"));

/**
 * Para telas públicas (entrar, cadastro): se a API estiver fora, trata como visitante
 * em vez de derrubar a página. O formulário mostra o erro ao tentar enviar.
 */
export const getMeIfAvailable = cache(async (): Promise<Me | null> => {
  try {
    return await getMe();
  } catch (error) {
    if (error instanceof ApiUnavailableError) return null;
    throw error;
  }
});

const DEFAULT_CONFIG: PublicConfig = { googleLogin: false, vapidPublicKey: null };

export const getPublicConfig = cache(async (): Promise<PublicConfig> => {
  try {
    return (await serverGet<PublicConfig>("/public-config")) ?? DEFAULT_CONFIG;
  } catch (error) {
    if (error instanceof ApiUnavailableError) return DEFAULT_CONFIG;
    throw error;
  }
});

/** Para onde mandar um usuário logado conforme a etapa do cadastro. */
export function homeFor(me: Me): string {
  return me.onboardingStep === "concluido" ? "/inicio" : "/onboarding";
}
