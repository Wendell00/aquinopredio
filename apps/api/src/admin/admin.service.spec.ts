import { nextSanction } from "./admin.service";

describe("nextSanction (RN-095)", () => {
  it("segue a escada aviso → suspensão → banimento", () => {
    expect(nextSanction(0, false)).toBe("aviso");
    expect(nextSanction(1, false)).toBe("suspensao");
    expect(nextSanction(2, false)).toBe("banimento");
    expect(nextSanction(5, false)).toBe("banimento");
  });

  it("bane direto em infração grave", () => {
    expect(nextSanction(0, true)).toBe("banimento");
  });
});
