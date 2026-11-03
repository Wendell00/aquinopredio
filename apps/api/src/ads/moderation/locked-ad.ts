import type { AdStatus } from "@repo/shared";
import type { EntityManager } from "typeorm";
import { contentHash } from "./content-hash";

export type ModerationResult = "ativo" | "em_moderacao" | "removido";

declare const lockedBrand: unique symbol;

/**
 * Linha de `ads` lida com `FOR UPDATE` na transação corrente. Só `lockAd` cria um valor deste
 * tipo, então `writeDecision` nunca escreve status a partir de um snapshot sem lock.
 */
export interface LockedAd {
  readonly [lockedBrand]: true;
  id: string;
  userId: string;
  title: string;
  status: AdStatus;
  manualReview: boolean;
  contentVersion: number;
  moderationRunId: string | null;
  contentHash: string;
}

interface LockedRow {
  id: string;
  user_id: string;
  type: string;
  category_id: string;
  title: string;
  description: string;
  tags: string[];
  availability: string | null;
  status: AdStatus;
  manual_review: boolean;
  content_version: number;
  moderation_run_id: string | null;
}

export async function lockAd(manager: EntityManager, adId: string): Promise<LockedAd | null> {
  const [row]: LockedRow[] = await manager.query(
    `SELECT id, user_id, type, category_id, title, description, tags, availability, status,
            manual_review, content_version, moderation_run_id
     FROM ads WHERE id = $1 FOR UPDATE`,
    [adId],
  );
  if (!row) return null;
  // Todo escritor de `ad_images` segura o lock do anúncio antes, então a leitura é consistente.
  const images: { upload_id: string }[] = await manager.query(
    `SELECT upload_id FROM ad_images WHERE ad_id = $1 ORDER BY position`,
    [adId],
  );
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    manualReview: row.manual_review,
    contentVersion: row.content_version,
    moderationRunId: row.moderation_run_id,
    contentHash: contentHash({
      type: row.type,
      categoryId: row.category_id,
      title: row.title,
      description: row.description,
      tags: row.tags,
      availability: row.availability,
      uploadIds: images.map((image) => image.upload_id),
    }),
  } as LockedAd;
}

/**
 * Aplica o resultado à linha travada. Ao ativar pela primeira vez, começa a contar a validade
 * (RN-063), calculada no SQL a partir da linha atual. "Revisar" não muda o anúncio.
 */
export async function writeDecision(
  manager: EntityManager,
  ad: LockedAd,
  result: ModerationResult,
  statusReason: string | null,
  activeDays: number,
): Promise<void> {
  if (result === "em_moderacao") return;
  const affected =
    result === "ativo"
      ? await affectedRows(
          manager,
          `UPDATE ads SET status = 'ativo', status_reason = NULL,
             published_at = COALESCE(published_at, now()),
             expires_at = CASE WHEN expires_at > now() THEN expires_at
                               ELSE now() + make_interval(days => $3::int) END,
             updated_at = now()
           WHERE id = $1 AND status = $2`,
          [ad.id, ad.status, activeDays],
        )
      : await affectedRows(
          manager,
          `UPDATE ads SET status = 'removido', status_reason = $3, updated_at = now()
           WHERE id = $1 AND status = $2`,
          [ad.id, ad.status, statusReason],
        );
  if (affected !== 1) throw new Error(`Anúncio ${ad.id} mudou sob lock`);
}

/** Linhas afetadas por um UPDATE/DELETE cru: o driver do TypeORM devolve `[rows, rowCount]`. */
export async function affectedRows(
  manager: EntityManager,
  sql: string,
  params: unknown[],
): Promise<number> {
  const result: unknown = await manager.query(sql, params);
  if (Array.isArray(result) && typeof result[1] === "number") return result[1];
  throw new Error("Resultado inesperado de UPDATE");
}
