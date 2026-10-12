import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Defesa contra CSRF nas rotas do app (o Better Auth já faz a própria checagem em /api/auth).
 * Navegadores sempre enviam `Origin` em requisições que alteram estado; se vier e não for uma
 * origem do app, a requisição é recusada. Sem `Origin` (curl, apps nativos) não há cookie de
 * vítima envolvido, então passa — a sessão continua sendo exigida pelo AuthGuard.
 */
export function originCheck(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || !origin || allowed.has(origin)) {
      next();
      return;
    }
    res.status(403).json({ statusCode: 403, message: "Origem não permitida" });
  };
}
