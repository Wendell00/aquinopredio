import { createHash } from "node:crypto";

/** Tudo que a moderação lê de um anúncio (RN-064). */
export interface ModeratedContent {
  type: string;
  categoryId: string;
  title: string;
  description: string;
  tags: string[];
  availability: string | null;
  /** Na ordem de exibição: trocar a capa muda o que a IA vê. */
  uploadIds: string[];
}

/**
 * Hash do conteúdo moderado (spec 5.7). Complementa `content_version`: pega um escritor que mude
 * o conteúdo sem incrementar a versão. A forma canônica é uma lista posicional, então a ordem das
 * chaves do objeto recebido não importa.
 */
export function contentHash(content: ModeratedContent): string {
  const canonical = JSON.stringify([
    content.type,
    content.categoryId,
    content.title,
    content.description,
    content.tags,
    content.availability ?? null,
    content.uploadIds,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}
