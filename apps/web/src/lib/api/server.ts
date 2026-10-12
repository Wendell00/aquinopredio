import "server-only";
import { cookies } from "next/headers";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

/** A API não respondeu (fora do ar, subindo ou rede). As páginas decidem como degradar. */
export class ApiUnavailableError extends Error {
  constructor(path: string, cause: unknown) {
    super(`API indisponível ao buscar ${path}`, { cause });
    this.name = "ApiUnavailableError";
  }
}

/**
 * GET na API a partir de Server Components, repassando os cookies da requisição.
 * Devolve `null` em 401 (sem sessão) para a página decidir o redirecionamento.
 */
export async function serverGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  let response: Response;
  try {
    response = await fetch(`${API_INTERNAL_URL}/api${path}`, {
      headers: { cookie: cookieStore.toString(), accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new ApiUnavailableError(path, error);
  }
  if (response.status === 401) return null;
  if (response.status >= 502)
    throw new ApiUnavailableError(path, new Error(`HTTP ${response.status}`));
  if (!response.ok) throw new Error(`API ${path} respondeu ${response.status}`);
  return (await response.json()) as T;
}
