import sharp from "sharp";
import { InvalidImageError, processImage } from "./image-processing";

async function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#d63700" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "Celular", Model: "Teste" },
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "23/1 33/1 0/1" },
    })
    .toBuffer();
}

describe("processImage", () => {
  it("redimensiona, converte para WebP e remove EXIF/GPS (RN-132)", async () => {
    const input = await jpegWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await processImage(input);
    const meta = await sharp(result.main).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(result.width, result.height)).toBe(1600);
    expect(meta.exif).toBeUndefined();
    expect((await sharp(result.thumb).metadata()).width).toBe(480);
  });

  it("recusa arquivos que não são imagem, mesmo com extensão de imagem", async () => {
    await expect(processImage(Buffer.from("<script>alert(1)</script>"))).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });

  it("recusa formatos não aceitos (ex.: SVG)", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await expect(processImage(svg)).rejects.toBeInstanceOf(InvalidImageError);
  });
});
