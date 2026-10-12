import "server-only";
import { cookies } from "next/headers";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

/**
 * GET na API a partir de Server Components, repassando os cookies da requisição.
 * Devolve `null` em 401 (sem sessão) para a página decidir o redirecionamento.
 */
export async function serverGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const response = await fetch(`${API_INTERNAL_URL}/api${path}`, {
    headers: { cookie: cookieStore.toString(), accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`API ${path} respondeu ${response.status}`);
  return (await response.json()) as T;
}
