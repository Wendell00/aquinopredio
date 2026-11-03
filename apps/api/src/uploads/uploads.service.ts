import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { UploadedImage } from "@repo/shared";
import { type EntityManager, In, Repository } from "typeorm";
import { StorageService } from "../storage/storage.service";
import { InvalidImageError, imageForAi, processImage } from "./image-processing";
import { Upload, type UploadPurpose } from "./upload.entity";

const UNAVAILABLE = "Uma das fotos não pode ser usada. Envie de novo.";

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
    const found = await this.uploads.findBy({ id: In(ids), ownerId });
    return pickClaimable(ids, found, options.allowAttachedTo ?? []);
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

/**
 * Regra de `claim` sem acesso ao banco, para quem já leu os uploads (ex.: a edição de anúncio,
 * que lê as imagens atuais sob o lock da linha). `found` são os uploads do dono entre os `ids`.
 */
export function pickClaimable(ids: string[], found: Upload[], allowAttachedTo: string[]): Upload[] {
  if (new Set(ids).size !== ids.length) throw new BadRequestException("Foto repetida no anúncio");
  const allowed = new Set(allowAttachedTo);
  const byId = new Map(found.map((upload) => [upload.id, upload]));
  return ids.map((id) => {
    const upload = byId.get(id);
    if (!upload || (upload.attachedAt && !allowed.has(id))) {
      throw new BadRequestException(UNAVAILABLE);
    }
    return upload;
  });
}

/**
 * Validação de `claim` sob lock, na transação de quem vai associar (P00-B4.1): trava os uploads
 * pedidos do dono em ordem de id — conjuntos sobrepostos travam na mesma ordem e não fecham
 * ciclo entre si — e aplica `pickClaimable` às linhas travadas. Devolve na ordem dos ids.
 */
export async function lockClaimable(
  manager: EntityManager,
  ownerId: string,
  ids: string[],
  allowAttachedTo: string[],
): Promise<Upload[]> {
  if (!ids.length) return [];
  const found = await manager
    .getRepository(Upload)
    .createQueryBuilder("upload")
    .where("upload.id IN (:...ids)", { ids })
    .andWhere("upload.ownerId = :ownerId", { ownerId })
    .orderBy("upload.id")
    .setLock("pessimistic_write")
    .getMany();
  const picked = pickClaimable(ids, found, allowAttachedTo);
  // `attached_at` é marca de uso e pode faltar (marcação perdida antes da P00-B4.1): a associação
  // atual é conferida em `ad_images`. Com os uploads travados, nenhum INSERT que os referencie
  // está pendente (a FK espera o lock), então esta leitura vê a associação efetiva.
  const allowed = new Set(allowAttachedTo);
  const others = ids.filter((id) => !allowed.has(id));
  if (others.length) {
    const associated: { upload_id: string }[] = await manager.query(
      `SELECT upload_id FROM ad_images WHERE upload_id = ANY($1::uuid[])`,
      [others],
    );
    if (associated.length) throw new BadRequestException(UNAVAILABLE);
  }
  return picked;
}

/** `markAttached` na mesma transação da associação: falha em qualquer etapa desfaz as duas. */
export async function markAttachedWith(manager: EntityManager, ids: string[]): Promise<void> {
  if (ids.length)
    await manager.getRepository(Upload).update({ id: In(ids) }, { attachedAt: new Date() });
}
