import { contentHash, type ModeratedContent } from "./content-hash";

const base: ModeratedContent = {
  type: "produto",
  categoryId: "c1",
  title: "Bolo de pote",
  description: "Bolos caseiros",
  tags: ["bolo", "doce"],
  availability: null,
  uploadIds: ["u1", "u2"],
};

describe("contentHash (spec 5.7)", () => {
  it("é estável para o mesmo conteúdo, independente da ordem das chaves", () => {
    const reordered: ModeratedContent = {
      uploadIds: ["u1", "u2"],
      availability: null,
      tags: ["bolo", "doce"],
      description: "Bolos caseiros",
      title: "Bolo de pote",
      categoryId: "c1",
      type: "produto",
    };
    expect(contentHash(reordered)).toBe(contentHash(base));
  });

  it("muda quando qualquer campo moderado muda", () => {
    const variants: Partial<ModeratedContent>[] = [
      { type: "servico" },
      { categoryId: "c2" },
      { title: "Bolo de pote gourmet" },
      { description: "Outra descrição" },
      { tags: ["bolo"] },
      { availability: "noites" },
      { uploadIds: ["u1"] },
    ];
    for (const change of variants) {
      expect(contentHash({ ...base, ...change })).not.toBe(contentHash(base));
    }
  });

  it("a ordem das imagens conta (a capa muda o que a IA vê)", () => {
    expect(contentHash({ ...base, uploadIds: ["u2", "u1"] })).not.toBe(contentHash(base));
  });

  it("não confunde campos vizinhos (título + descrição concatenados)", () => {
    expect(contentHash({ ...base, title: "Bolo de", description: "pote Bolos caseiros" })).not.toBe(
      contentHash(base),
    );
  });
});
