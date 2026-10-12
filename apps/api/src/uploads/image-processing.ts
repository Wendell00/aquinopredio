import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif"]);

export class InvalidImageError extends Error {}

export interface ProcessedImage {
  main: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

/**
 * Reprocessa a imagem no servidor: valida o formato real (não confia no content-type),
 * corrige a orientação, redimensiona e converte para WebP. O sharp não copia metadados
 * para a saída, então EXIF (inclusive GPS) é descartado (RN-132, RNF-013).
 */
export async function processImage(
  input: Buffer,
  options: { maxSide?: number } = {},
): Promise<ProcessedImage> {
  const maxSide = options.maxSide ?? 1600;
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new InvalidImageError("Arquivo não é uma imagem válida");
  }
  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new InvalidImageError("Envie fotos em JPG, PNG, WebP ou HEIC");
  }

  const base = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
  const main = await base
    .clone()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize({ width: 480, height: 480, fit: "cover", position: "attention" })
    .webp({ quality: 72 })
    .toBuffer();

  return { main: main.data, thumb, width: main.info.width, height: main.info.height };
}

/** Versão para a IA (RN-111): maior lado com até 1568 px. */
export async function imageForAi(input: Buffer): Promise<string> {
  const resized = await sharp(input)
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${resized.toString("base64")}`;
}
