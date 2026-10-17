import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  type Recommendation,
  type Review,
  type UpsertReviewInput,
  type UserReviews,
  upsertReviewInputSchema,
} from "@repo/shared";
import { DataSource } from "typeorm";
import { containsExternalLink, moderateLocally } from "../ads/moderation/moderation.rules";
import { FeedService } from "../feed/feed.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { User } from "../users/user.entity";

const PAGE_SIZE = 20;

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_username: string | null;
  ad_title: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Reputação do anunciante: indicações de anúncios (RN-086) e avaliações (RN-087). */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly feed: FeedService,
    private readonly notifications: NotificationsService,
  ) {}

  // —— Indicações ——

  /** RN-086: indica um anúncio que consegue ver; o dono não indica o próprio. */
  async recommend(user: User, adId: string): Promise<Recommendation> {
    const ad = await this.feed.detail(user, adId);
    if (ad.isOwner) throw new BadRequestException("Você não pode indicar o próprio anúncio");
    if (ad.status !== "ativo") throw new BadRequestException("Este anúncio não está no ar");
    await this.dataSource.query(
      `INSERT INTO ad_recommendations (ad_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [adId, user.id],
    );
    return this.recommendation(user.id, adId);
  }

  async unrecommend(user: User, adId: string): Promise<Recommendation> {
    await this.dataSource.query(
      `DELETE FROM ad_recommendations WHERE ad_id = $1 AND user_id = $2`,
      [adId, user.id],
    );
    return this.recommendation(user.id, adId);
  }

  private async recommendation(userId: string, adId: string): Promise<Recommendation> {
    const [row] = await this.dataSource.query(
      `SELECT count(*)::int AS count, bool_or(user_id = $2) AS mine
       FROM ad_recommendations WHERE ad_id = $1`,
      [adId, userId],
    );
    return { count: row?.count ?? 0, recommendedByMe: Boolean(row?.mine) };
  }

  // —— Avaliações ——

  /**
   * Quem vê as avaliações: a própria pessoa, quem enxerga algum anúncio dela ou quem já conversou
   * com ela. Assim a reputação acompanha os anúncios sem virar um diretório aberto de moradores.
   */
  async list(user: User, reviewedId: string, offset = 0): Promise<UserReviews> {
    await this.assertCanSee(user, reviewedId);
    const [summary] = await this.dataSource.query(
      `SELECT round(avg(rating), 1)::float AS average, count(*)::int AS count
       FROM user_reviews WHERE reviewed_id = $1`,
      [reviewedId],
    );
    const rows: ReviewRow[] = await this.dataSource.query(
      `${REVIEW_SELECT} WHERE r.reviewed_id = $1
       ORDER BY r.created_at DESC LIMIT ${PAGE_SIZE} OFFSET $2`,
      [reviewedId, Math.max(0, Math.min(offset, 10_000))],
    );
    const [mine] = await this.dataSource.query(
      `${REVIEW_SELECT} WHERE r.reviewed_id = $1 AND r.reviewer_id = $2`,
      [reviewedId, user.id],
    );
    return {
      summary: { average: summary?.average ?? null, count: summary?.count ?? 0 },
      items: rows.map((row) => toReview(row, user.id)),
      canReview: await this.canReview(user.id, reviewedId),
      myReview: mine ? toReview(mine, user.id) : null,
    };
  }

  /** RN-087: uma avaliação por pessoa avaliada; enviar de novo edita a anterior. */
  async upsert(user: User, reviewedId: string, rawInput: UpsertReviewInput): Promise<Review> {
    const input = upsertReviewInputSchema.parse(rawInput);
    if (reviewedId === user.id) throw new BadRequestException("Você não pode se avaliar");
    if (user.status !== "ativo") throw new ForbiddenException("Sua conta não pode avaliar agora.");
    const conversation = await this.reviewableConversation(user.id, reviewedId);
    if (!conversation) {
      throw new ForbiddenException(
        "Você pode avaliar depois de conversar com a pessoa pelo chat e ela responder.",
      );
    }
    if (input.comment) assertCleanComment(input.comment);

    const [saved] = await this.dataSource.query(
      `INSERT INTO user_reviews (reviewer_id, reviewed_id, ad_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (reviewer_id, reviewed_id) DO UPDATE SET
         rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()
       RETURNING id, (xmax = 0) AS created`,
      [user.id, reviewedId, conversation.ad_id, input.rating, input.comment],
    );
    if (saved.created) {
      await this.notifications.notify(reviewedId, {
        type: "nova_avaliacao",
        title: "Você recebeu uma avaliação",
        body: `${user.name} deu ${input.rating} estrela${input.rating === 1 ? "" : "s"} para você.`,
        url: "/perfil#avaliacoes",
      });
    }
    const [row] = await this.dataSource.query(`${REVIEW_SELECT} WHERE r.id = $1`, [saved.id]);
    return toReview(row, user.id);
  }

  async remove(user: User, reviewedId: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM user_reviews WHERE reviewer_id = $1 AND reviewed_id = $2`,
      [user.id, reviewedId],
    );
  }

  private async assertCanSee(user: User, reviewedId: string): Promise<void> {
    if (reviewedId === user.id) return;
    const [row] = await this.dataSource.query(
      `SELECT
         EXISTS (SELECT 1 FROM users WHERE id = $2 AND status IN ('ativo', 'suspenso')) AS exists,
         EXISTS (SELECT 1 FROM user_blocks
                 WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)) AS blocked,
         EXISTS (SELECT 1 FROM conversations
                 WHERE (buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1)) AS talked`,
      [user.id, reviewedId],
    );
    const visible =
      row?.exists &&
      !row.blocked &&
      (row.talked || (await this.feed.canSeeAnyAdOf(user, reviewedId)));
    if (!visible) throw new NotFoundException("Pessoa não encontrada");
  }

  private async canReview(userId: string, reviewedId: string): Promise<boolean> {
    if (userId === reviewedId) return false;
    return (await this.reviewableConversation(userId, reviewedId)) !== null;
  }

  /**
   * Conversa em que quem avalia foi o interessado e o anunciante respondeu ao menos uma vez:
   * evita avaliação de quem só abriu o chat para deixar nota. Bloqueio entre os dois impede.
   */
  private async reviewableConversation(
    reviewerId: string,
    reviewedId: string,
  ): Promise<{ ad_id: string } | null> {
    const [row] = await this.dataSource.query(
      `SELECT c.ad_id FROM conversations c
       WHERE c.buyer_id = $1 AND c.seller_id = $2
         AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.sender_id = $2)
         AND NOT EXISTS (SELECT 1 FROM user_blocks ub
                         WHERE (ub.blocker_id = $1 AND ub.blocked_id = $2) OR (ub.blocker_id = $2 AND ub.blocked_id = $1))
         AND EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.status IN ('ativo', 'suspenso'))
       ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1`,
      [reviewerId, reviewedId],
    );
    return row ?? null;
  }
}

const REVIEW_SELECT = `
  SELECT r.id, r.rating, r.comment, r.reviewer_id, r.created_at, r.updated_at,
         u.name AS reviewer_name, u.username AS reviewer_username, a.title AS ad_title
  FROM user_reviews r
  JOIN users u ON u.id = r.reviewer_id
  LEFT JOIN ads a ON a.id = r.ad_id AND a.status <> 'excluido'`;

function toReview(row: ReviewRow, viewerId: string): Review {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    reviewer: { name: row.reviewer_name, username: row.reviewer_username },
    adTitle: row.ad_title,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    isMine: row.reviewer_id === viewerId,
  };
}

/** Comentário fica visível para vizinhos: sem links nem termos que a moderação barra (RN-091). */
function assertCleanComment(comment: string): void {
  if (containsExternalLink(comment)) {
    throw new BadRequestException("Comentários não podem ter links.");
  }
  if (moderateLocally(comment).decision !== "aprovado") {
    throw new BadRequestException("O comentário tem termos que não são permitidos no app.");
  }
}
