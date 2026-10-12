import { describe, expect, it } from "vitest";
import { formatCep, formatDistance, plural } from "./format";

describe("formatDistance", () => {
  it.each([
    [null, null],
    [20, "no mesmo local"],
    [349, "a 350 m"],
    [1240, "a 1,2 km"],
  ])("%s → %s", (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected);
  });
});

describe("formatCep / plural", () => {
  it("formata CEP e plural", () => {
    expect(formatCep("01310100")).toBe("01310-100");
    expect(plural(1, "morador", "moradores")).toBe("1 morador");
    expect(plural(3, "morador", "moradores")).toBe("3 moradores");
  });
});
