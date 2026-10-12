/**
 * O navegador acessa a API pelo proxy `/api` do Next (mesma origem): cookies de sessão
 * `httpOnly` + `SameSite=Lax` funcionam sem CORS. No servidor, use `@/lib/api/server`.
 */
export const API_BASE_PATH = "/api";
