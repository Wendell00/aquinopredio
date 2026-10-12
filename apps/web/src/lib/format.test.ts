import { describe, expect, it } from "vitest";
import { formatCep, formatDistance, plural, timeAgo } from "./format";

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

describe("timeAgo", () => {
  const now = new Date("2026-10-12T12:00:00Z").getTime();
  it.each([
    ["2026-10-12T11:59:30Z", "agora"],
    ["2026-10-12T11:55:00Z", "há 5 min"],
    ["2026-10-12T09:00:00Z", "há 3 h"],
    ["2026-10-11T12:00:00Z", "há 1 dia"],
    ["2026-10-09T12:00:00Z", "há 3 dias"],
  ])("%s → %s", (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected);
  });
});
