import { type NextRequest, NextResponse } from "next/server";

/** Cookie de sessão do Better Auth (`cookiePrefix: "anp"`); em produção ganha o prefixo `__Secure-`. */
const SESSION_COOKIES = ["anp.session_token", "__Secure-anp.session_token"];

/**
 * Checagem otimista: sem cookie de sessão, nem renderiza a página protegida — vai direto para o
 * login. A validação real (sessão válida, onboarding, papel) acontece no layout e na API.
 */
export function proxy(request: NextRequest): NextResponse {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = "";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/onboarding/:path*",
    "/inicio/:path*",
    "/anuncios/:path*",
    "/anunciar/:path*",
    "/indicar/:path*",
    "/meus-anuncios/:path*",
    "/conversas/:path*",
    "/favoritos/:path*",
    "/notificacoes/:path*",
    "/perfil/:path*",
    "/meu-predio/:path*",
    "/admin/:path*",
  ],
};
