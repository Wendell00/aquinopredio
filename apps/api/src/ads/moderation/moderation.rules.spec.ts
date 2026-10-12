import { containsExternalLink, moderateLocally } from "./moderation.rules";

describe("moderateLocally (RN-091)", () => {
  it("aprova anúncios comuns de vizinhança", () => {
    expect(moderateLocally("Bolo de pote caseiro, chocolate e ninho, R$ 10").decision).toBe(
      "aprovado",
    );
    expect(moderateLocally("Aulas de reforço de matemática para o ensino médio").decision).toBe(
      "aprovado",
    );
  });

  it("manda para revisão termos proibidos, ignorando acentos e maiúsculas", () => {
    expect(moderateLocally("Vendo RIVOTRIL sem receita")).toEqual({
      decision: "revisar",
      categories: ["medicamentos_controlados"],
    });
    expect(moderateLocally("Tênis réplica primeira linha").categories).toContain("falsificacao");
    expect(moderateLocally("Filhote de papagaio").categories).toContain("animais_silvestres");
  });

  it("não confunde palavras parecidas", () => {
    expect(moderateLocally("Betoneira para alugar").decision).toBe("aprovado");
    expect(moderateLocally("Armário de cozinha").decision).toBe("aprovado");
  });
});

describe("containsExternalLink (RN-085)", () => {
  it.each(["veja em https://exemplo.com", "acesse www.golpe.net", "promo em golpe.xyz/pix"])(
    "detecta %s",
    (text) => {
      expect(containsExternalLink(text)).toBe(true);
    },
  );

  it("não marca texto comum", () => {
    expect(containsExternalLink("Posso passar aí às 18h? Moro no bloco B.")).toBe(false);
  });
});
