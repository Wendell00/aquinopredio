import type { NearbyPlace, ReverseResult } from "../../geo/geo.service";

export type VerificationDecision = "verificado" | "pendente_revisao" | "rejeitado";

export interface RulesInput {
  name: string;
  cep: string;
  number: string;
  geocodePrecision: "exato" | "rua" | "cep" | "manual" | null;
  reverse: ReverseResult | null;
  nearby: NearbyPlace[];
}

export interface RulesResult {
  /** Teto do score (ex.: endereço inconsistente → 0,49). */
  scoreCap: number;
  /** Rejeição determinística, sem precisar de IA. */
  forcedRejectionReason: string | null;
  evidence: string[];
  risks: string[];
}

const TEST_NAME = /\b(teste|test|asdf|qwert|lorem|fake|xxx+|aaa+|abc)\b|(.)\2{3,}/i;
const RESIDENTIAL_BUILDINGS = new Set([
  "building=apartments",
  "building=residential",
  "building=house",
  "landuse=residential",
]);
const COMMERCIAL = new Set([
  "building=commercial",
  "building=retail",
  "building=office",
  "building=industrial",
  "building=warehouse",
]);

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(edificio|ed|condominio|cond|residencial|res|predio)\b\.?/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Semelhança por palavras em comum (0–1), suficiente para comparar nomes de prédios. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(
    normalizeName(a)
      .split(" ")
      .filter((t) => t.length > 1),
  );
  const tb = new Set(
    normalizeName(b)
      .split(" ")
      .filter((t) => t.length > 1),
  );
  if (!ta.size || !tb.size) return 0;
  const common = [...ta].filter((t) => tb.has(t)).length;
  return common / Math.max(ta.size, tb.size);
}

/** Regras determinísticas que complementam (ou substituem, sem IA) a análise da validação. */
export function evaluateRules(input: RulesInput): RulesResult {
  const evidence: string[] = [];
  const risks: string[] = [];
  let scoreCap = 1;

  if (TEST_NAME.test(input.name)) {
    return {
      scoreCap: 0,
      forcedRejectionReason:
        "O nome informado parece ser de teste. Use o nome real do prédio ou condomínio.",
      evidence,
      risks: ["nome de teste"],
    };
  }

  if (input.geocodePrecision === "exato")
    evidence.push("Geocodificação encontrou o número informado");
  if (input.geocodePrecision === "cep") risks.push("Endereço localizado só pelo CEP");

  const reverse = input.reverse;
  if (reverse) {
    // Comparação tolerante: o CEP no OSM costuma ser genérico; só os 5 primeiros dígitos contam.
    if (
      reverse.postcode &&
      reverse.postcode.length === 8 &&
      reverse.postcode.slice(0, 5) !== input.cep.slice(0, 5)
    ) {
      risks.push(`CEP do mapa (${reverse.postcode}) difere do informado`);
      scoreCap = Math.min(scoreCap, 0.49);
    }
    if (reverse.houseNumber && reverse.houseNumber === input.number) {
      evidence.push(`Mapa confirma o número ${input.number}`);
    }
  }

  const residential = input.nearby.filter(
    (place) => RESIDENTIAL_BUILDINGS.has(place.kind) && place.distanceM <= 60,
  );
  const commercial = input.nearby.filter(
    (place) => COMMERCIAL.has(place.kind) && place.distanceM <= 25,
  );
  if (residential.length)
    evidence.push(`${residential.length} construção(ões) residencial(is) a até 60 m`);
  if (commercial.length && !residential.length) risks.push("Construções próximas são comerciais");

  const similar = input.nearby
    .filter((place) => place.name && nameSimilarity(place.name, input.name) >= 0.5)
    .sort((a, b) => a.distanceM - b.distanceM)[0];
  if (similar?.name)
    evidence.push(`Nome parecido no mapa: "${similar.name}" a ${similar.distanceM} m`);

  return { scoreCap, forcedRejectionReason: null, evidence, risks };
}

export function decide(
  score: number,
  thresholds: { verify: number; review: number },
): VerificationDecision {
  if (score >= thresholds.verify) return "verificado";
  if (score >= thresholds.review) return "pendente_revisao";
  return "rejeitado";
}
