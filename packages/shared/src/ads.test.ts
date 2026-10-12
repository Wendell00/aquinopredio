import { describe, expect, it } from "vitest";
import { AD_RADII_KM, adFieldsSchema, adRadiusKmSchema, allowedRadii, formatPrice } from "./ads";

describe("allowedRadii", () => {
  it("limita a raio 0 enquanto o prédio não é verificado (RN-028)", () => {
    expect(allowedRadii({ buildingVerified: false, residentVerified: true })).toEqual([0]);
  });

  it("limita a 1 km para morador sem selo (RN-059)", () => {
    expect(allowedRadii({ buildingVerified: true, residentVerified: false })).toEqual([0, 0.5, 1]);
  });

  it("libera todos os raios para morador verificado", () => {
    expect(allowedRadii({ buildingVerified: true, residentVerified: true })).toEqual([
      ...AD_RADII_KM,
    ]);
  });
});

describe("adRadiusKmSchema", () => {
  it("aceita apenas os raios previstos (RN-057)", () => {
    expect(adRadiusKmSchema.safeParse(2).success).toBe(true);
    expect(adRadiusKmSchema.safeParse(4).success).toBe(false);
  });
});

describe("adFieldsSchema (RN-052)", () => {
  const valid = {
    buildingId: "4a0f6a8e-6f5b-4c4e-9a43-6f0f7c3f1a11",
    type: "produto",
    categoryId: "1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b",
    title: "Bolo de pote caseiro",
    description: "Bolos de pote feitos em casa, sabores chocolate e ninho.",
    priceMode: "fixo",
    priceCents: 1000,
    radiusKm: 0,
    whatsappEnabled: false,
    availability: "",
    tags: ["Bolo", "bolo", "doce"],
    imageIds: [],
  };

  it("normaliza tags e disponibilidade vazia", () => {
    const parsed = adFieldsSchema.parse(valid);
    expect(parsed.tags).toEqual(["bolo", "doce"]);
    expect(parsed.availability).toBeNull();
  });

  it("exige preço para fixo/a partir de", () => {
    expect(adFieldsSchema.safeParse({ ...valid, priceCents: null }).success).toBe(false);
  });

  it("descarta o preço quando é a combinar", () => {
    expect(adFieldsSchema.parse({ ...valid, priceMode: "a_combinar" }).priceCents).toBeNull();
  });

  it("limita título e descrição", () => {
    expect(adFieldsSchema.safeParse({ ...valid, title: "Bolo" }).success).toBe(false);
    expect(adFieldsSchema.safeParse({ ...valid, description: "curta" }).success).toBe(false);
  });
});

describe("formatPrice", () => {
  it.each([
    ["fixo", 1000, "R$ 10"],
    ["fixo", 1050, "R$ 10,50"],
    ["a_partir_de", 3500, "A partir de R$ 35"],
    ["a_combinar", null, "A combinar"],
    ["gratuito", null, "Gratuito"],
  ] as const)("%s %s → %s", (mode, cents, expected) => {
    expect(formatPrice(mode, cents).replace(/ /g, " ")).toBe(expected);
  });
});
