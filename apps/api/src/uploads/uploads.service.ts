import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { UploadedImage } from "@repo/shared";
import { In, Repository } from "typeorm";
import { StorageService } from "../storage/storage.service";
import { InvalidImageError, imageForAi, processImage } from "./image-processing";
import { Upload, type UploadPurpose } from "./upload.entity";

@Injectable()
export class UploadsService {
  constructor(
    @InjectRepository(Upload) private readonly uploads: Repository<Upload>,
    private readonly storage: StorageService,
  ) {}

  async uploadImage(ownerId: string, file: Buffer, purpose: UploadPurpose): Promise<UploadedImage> {
    let processed: Awaited<ReturnType<typeof processImage>>;
    try {
      processed = await processImage(file, { maxSide: purpose === "avatar" ? 512 : 1600 });
    } catch (error) {
      if (error instanceof InvalidImageError) throw new UnprocessableEntityException(error.message);
      throw error;
    }
    const name = randomUUID();
    const key = `${purpose}/${name}.webp`;
    const thumbKey = `${purpose}/${name}-thumb.webp`;
    await Promise.all([
      this.storage.put(key, processed.main, "image/webp"),
      this.storage.put(thumbKey, processed.thumb, "image/webp"),
    ]);
    const saved = await this.uploads.save(
      this.uploads.create({
        ownerId,
        key,
        thumbKey,
        width: processed.width,
        height: processed.height,
        bytes: processed.main.length,
        purpose,
      }),
    );
    return this.toImage(saved);
  }

  /**
   * Confere que as imagens são do usuário e podem ser usadas (não estão em outro anúncio).
   * Devolve na mesma ordem dos ids recebidos.
   */
  async claim(
    ownerId: string,
    ids: string[],
    options: { allowAttachedTo?: string[] } = {},
  ): Promise<Upload[]> {
    if (!ids.length) return [];
    if (new Set(ids).size !== ids.length) throw new BadRequestException("Foto repetida no anúncio");
    const found = await this.uploads.findBy({ id: In(ids), ownerId });
    const allowed = new Set(options.allowAttachedTo ?? []);
    const byId = new Map(found.map((upload) => [upload.id, upload]));
    return ids.map((id) => {
      const upload = byId.get(id);
      if (!upload || (upload.attachedAt && !allowed.has(id))) {
        throw new BadRequestException("Uma das fotos não pode ser usada. Envie de novo.");
      }
      return upload;
    });
  }

  async markAttached(ids: string[]): Promise<void> {
    if (ids.length) await this.uploads.update({ id: In(ids) }, { attachedAt: new Date() });
  }

  /** Data URLs reduzidas para enviar à IA (as URLs locais não são acessíveis pelo provedor). */
  async forAi(uploads: Upload[]): Promise<string[]> {
    return Promise.all(
      uploads.map(async (upload) => imageForAi(await this.storage.get(upload.key))),
    );
  }

  toImage(upload: Pick<Upload, "id" | "key" | "thumbKey" | "width" | "height">): UploadedImage {
    return {
      id: upload.id,
      url: this.storage.url(upload.key),
      thumbUrl: this.storage.url(upload.thumbKey),
      width: upload.width,
      height: upload.height,
    };
  }
}
