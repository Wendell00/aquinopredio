import "server-only";
import type { Me, PublicConfig } from "@repo/shared";
import { cache } from "react";
import { serverGet } from "@/lib/api/server";

/** Usuário da sessão atual (ou `null`), deduplicado por requisição. */
export const getMe = cache(() => serverGet<Me>("/me"));

export const getPublicConfig = cache(async (): Promise<PublicConfig> => {
  return (
    (await serverGet<PublicConfig>("/public-config")) ?? {
      googleLogin: false,
      vapidPublicKey: null,
    }
  );
});

/** Para onde mandar um usuário logado conforme a etapa do cadastro. */
export function homeFor(me: Me): string {
  return me.onboardingStep === "concluido" ? "/inicio" : "/onboarding";
}
