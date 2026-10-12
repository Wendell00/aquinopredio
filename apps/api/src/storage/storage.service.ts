import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";

/** Armazenamento de imagens em S3 compatível (SeaweedFS em dev; S3/R2 em produção). */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.client = new S3Client({
      endpoint: config.get("STORAGE_ENDPOINT", { infer: true }),
      region: config.get("STORAGE_REGION", { infer: true }),
      forcePathStyle: config.get("STORAGE_FORCE_PATH_STYLE", { infer: true }),
      credentials: {
        accessKeyId: config.get("STORAGE_ACCESS_KEY_ID", { infer: true }),
        secretAccessKey: config.get("STORAGE_SECRET_ACCESS_KEY", { infer: true }),
      },
    });
    this.bucket = config.get("STORAGE_BUCKET", { infer: true });
    this.publicUrl = config.get("STORAGE_PUBLIC_URL", { infer: true }).replace(/\/$/, "");
  }

  /** Em desenvolvimento, cria o bucket com leitura pública se ainda não existir. */
  async onModuleInit(): Promise<void> {
    if (this.config.get("NODE_ENV", { infer: true }) === "production") return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        await this.client
          .send(
            new PutBucketPolicyCommand({
              Bucket: this.bucket,
              Policy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Principal: "*",
                    Action: ["s3:GetObject"],
                    Resource: [`arn:aws:s3:::${this.bucket}/*`],
                  },
                ],
              }),
            }),
          )
          .catch(() => undefined);
        this.logger.log(`Bucket ${this.bucket} criado`);
      } catch (error) {
        this.logger.warn(`Storage indisponível: ${(error as Error).message}`);
      }
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Nome aleatório e imutável: pode ficar em cache por muito tempo.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Objeto vazio: ${key}`);
    return Buffer.from(bytes);
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (!keys.length) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }

  url(key: string): string {
    return `${this.publicUrl}/${key}`;
  }
}
