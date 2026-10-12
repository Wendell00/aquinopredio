import { decide, evaluateRules, nameSimilarity, type RulesInput } from "./verification.rules";

const base: RulesInput = {
  name: "Edifício Solar das Flores",
  cep: "01310100",
  number: "1500",
  geocodePrecision: "exato",
  reverse: null,
  nearby: [],
};

describe("evaluateRules", () => {
  it("rejeita nomes de teste sem chamar a IA", () => {
    const result = evaluateRules({ ...base, name: "Prédio Teste" });
    expect(result.forcedRejectionReason).toMatch(/teste/);
  });

  it("limita o score quando o CEP do mapa não confere (RN da validação)", () => {
    const result = evaluateRules({
      ...base,
      reverse: {
        category: "building",
        type: "apartments",
        addressType: "building",
        houseNumber: null,
        road: "Rua X",
        postcode: "22000000",
        displayName: "",
      },
    });
    expect(result.scoreCap).toBe(0.49);
    expect(result.risks.join()).toMatch(/CEP/);
  });

  it("tolera CEP genérico do mapa com o mesmo prefixo", () => {
    const result = evaluateRules({
      ...base,
      reverse: {
        category: "",
        type: "",
        addressType: null,
        houseNumber: "1500",
        road: null,
        postcode: "01310000",
        displayName: "",
      },
    });
    expect(result.scoreCap).toBe(1);
    expect(result.evidence.join()).toMatch(/número 1500/);
  });

  it("registra evidências de construção residencial e nome parecido", () => {
    const result = evaluateRules({
      ...base,
      nearby: [{ name: "Condomínio Solar das Flores", kind: "building=apartments", distanceM: 12 }],
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/residencial/),
        expect.stringMatching(/Solar das Flores/),
      ]),
    );
  });
});

describe("decide (RN-027)", () => {
  const thresholds = { verify: 0.8, review: 0.5 };
  it.each([
    [0.8, "verificado"],
    [0.79, "pendente_revisao"],
    [0.5, "pendente_revisao"],
    [0.49, "rejeitado"],
  ] as const)("score %s → %s", (score, expected) => {
    expect(decide(score, thresholds)).toBe(expected);
  });
});

describe("nameSimilarity", () => {
  it("ignora prefixos como Edifício/Condomínio e acentos", () => {
    expect(nameSimilarity("Ed. Solar das Flores", "Condomínio Solar das Flores")).toBe(1);
  });
});
