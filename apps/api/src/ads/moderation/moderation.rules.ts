/**
 * Filtro local (RN-091): termos que levam o anúncio para revisão humana. Palavra-chave sozinha
 * nunca remove o anúncio (há muitos falsos positivos); quem remove é a IA com alta confiança ou um admin.
 */
const FLAGGED: Record<string, RegExp> = {
  drogas:
    /\b(maconha|cocaina|crack|lsd|ecstasy|md(ma)?|skunk|haxixe|lan[cç]a[- ]perfume|ketamina)\b/,
  armas: /\b(arma de fogo|pistola|rev[oó]lver|muni[cç][aã]o|espingarda|fuzil|calibre \d+)\b/,
  medicamentos_controlados:
    /\b(rivotril|clonazepam|ritalina|venvanse|sibutramina|tarja preta|receita azul|anabolizante)\b/,
  conteudo_adulto:
    /\b(acompanhante|programa sexual|nudes?|conte[uú]do adulto|massagem t[aâ]ntrica|\+18)\b/,
  animais_silvestres: /\b(papagaio|arara|mico|sagui|jabuti|tucano|animal silvestre)\b/,
  financeiro_duvidoso:
    /\b(pir[aâ]mide|renda garantida|dinheiro f[aá]cil|empr[eé]stimo sem consulta|agiota|investimento garantido)\b/,
  apostas: /\b(aposta|bet|jogo do bicho|cassino|rifa)\b/,
  falsificacao: /\b(r[eé]plica|primeira linha|falsificad[oa]|similar original|aaa\+)\b/,
};

export interface LocalModerationResult {
  decision: "aprovado" | "revisar";
  categories: string[];
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function moderateLocally(text: string): LocalModerationResult {
  const normalized = normalize(text);
  const categories = Object.entries(FLAGGED)
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([category]) => category);
  return { decision: categories.length ? "revisar" : "aprovado", categories };
}

/** Links externos em mensagens recebem aviso de segurança (RN-085). */
export function containsExternalLink(text: string): boolean {
  return /\b(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|br|io|xyz|link|ly)(\/\S*)?\b/i.test(
    text,
  );
}
