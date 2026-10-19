import { describe, expect, it } from "vitest";
import { createReferralInputSchema, formatPhone } from "./referrals";

const valid = {
  service: "Eletricista, troca chuveiro e tomadas",
  providerName: "Seu João",
  providerPhone: "(11) 98765-4321",
  providerConsent: true as const,
};

describe("createReferralInputSchema (RN-089)", () => {
  it("normaliza o telefone para E.164", () => {
    expect(createReferralInputSchema.parse(valid).providerPhone).toBe("+5511987654321");
  });

  it("exige que a pessoa indicada tenha autorizado a divulgação", () => {
    const result = createReferralInputSchema.safeParse({ ...valid, providerConsent: false });
    expect(result.success).toBe(false);
  });

  it("recusa telefone sem DDD", () => {
    const result = createReferralInputSchema.safeParse({ ...valid, providerPhone: "98765-4321" });
    expect(result.success).toBe(false);
  });
});

describe("formatPhone", () => {
  it("formata celular e fixo", () => {
    expect(formatPhone("+5511987654321")).toBe("(11) 98765-4321");
    expect(formatPhone("+551133334444")).toBe("(11) 3333-4444");
  });
});
