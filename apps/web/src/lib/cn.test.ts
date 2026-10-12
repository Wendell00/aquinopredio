import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("resolve conflitos de utilitários do Tailwind", () => {
    expect(cn("px-2 text-ink", "px-4")).toBe("text-ink px-4");
  });

  it("ignora valores falsos", () => {
    expect(cn("font-bold", false && "hidden", undefined)).toBe("font-bold");
  });
});
