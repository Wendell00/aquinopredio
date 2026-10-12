/** Só aceita caminhos internos em `?next=` (evita open redirect para outro site). */
export function safeNextPath(next: string | null | undefined, fallback = "/inicio"): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
