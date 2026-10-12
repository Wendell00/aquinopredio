import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("aceita caminhos internos", () => {
    expect(safeNextPath("/anuncios/123?x=1")).toBe("/anuncios/123?x=1");
  });

  it.each([
    "https://malicioso.com",
    "//malicioso.com",
    "/\\malicioso.com",
    "javascript:alert(1)",
    "",
    null,
  ])("recusa %s", (value) => {
    expect(safeNextPath(value)).toBe("/inicio");
  });
});
