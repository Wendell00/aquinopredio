/** Mensagens em português para os códigos de erro do Better Auth. */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  EMAIL_NOT_VERIFIED:
    "Confirme seu e-mail antes de entrar. Enviamos um novo link para a sua caixa de entrada.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail. Entre ou recupere a senha.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Já existe uma conta com este e-mail. Entre ou recupere a senha.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 10 caracteres.",
  PASSWORD_TOO_LONG: "A senha pode ter no máximo 128 caracteres.",
  PASSWORD_COMPROMISED: "Esta senha apareceu em vazamentos de dados. Escolha outra, por segurança.",
  INVALID_TOKEN: "Este link expirou ou já foi usado. Peça um novo.",
  INVALID_EMAIL: "Informe um e-mail válido.",
  FAILED_TO_CREATE_USER: "Não foi possível criar a conta agora. Tente de novo em instantes.",
  TOO_MANY_REQUESTS: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.",
};

export function authErrorMessage(
  error: { code?: string; status?: number; message?: string } | null,
): string {
  if (!error) return "";
  if (error.status === 429) return MESSAGES.TOO_MANY_REQUESTS ?? "";
  if (error.status === 403 && !error.code) return error.message ?? "Acesso negado.";
  return (error.code && MESSAGES[error.code]) || error.message || "Algo deu errado. Tente de novo.";
}
