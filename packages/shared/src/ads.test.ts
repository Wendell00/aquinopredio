import { describe, expect, it } from "vitest";
import {
  AD_RADII_KM,
  adFieldsSchema,
  adRadiusKmSchema,
  allowedRadii,
  FREE_MAX_RADIUS_KM,
  formatPrice,
  PRO_MAX_RADIUS_KM,
} from "./ads";

describe("allowedRadii", () => {
  it("limita a raio 0 enquanto o prédio não é verificado (RN-028), mesmo no Pro", () => {
    expect(allowedRadii({ buildingVerified: false, maxRadiusKm: PRO_MAX_RADIUS_KM })).toEqual([0]);
  });

  it("limita a 1 km no plano Free (RN-141)", () => {
    expect(allowedRadii({ buildingVerified: true, maxRadiusKm: FREE_MAX_RADIUS_KM })).toEqual([
      0, 0.5, 1,
    ]);
  });

  it("libera até 10 km no plano Pro (RN-142)", () => {
    expect(allowedRadii({ buildingVerified: true, maxRadiusKm: PRO_MAX_RADIUS_KM })).toEqual([
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
    availability: null,
    tags: ["Bolo", "bolo", "doce"],
    imageIds: [],
  };

  it("normaliza tags", () => {
    const parsed = adFieldsSchema.parse(valid);
    expect(parsed.tags).toEqual(["bolo", "doce"]);
  });

  it("aceita só disponibilidades da lista", () => {
    expect(adFieldsSchema.safeParse({ ...valid, availability: "fins_de_semana" }).success).toBe(
      true,
    );
    expect(adFieldsSchema.safeParse({ ...valid, availability: "seg a sex 9h" }).success).toBe(
      false,
    );
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
