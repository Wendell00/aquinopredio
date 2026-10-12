import { describe, expect, it } from "vitest";
import { AD_RADII_KM, adRadiusKmSchema, allowedRadii } from "./ads";

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
