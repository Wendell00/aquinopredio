import type { MigrationInterface, QueryRunner } from "typeorm";

export class ChatNotifications1760700000000 implements MigrationInterface {
  name = "ChatNotifications1760700000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE conversation_status AS ENUM ('aberta', 'bloqueada')`);
    await q.query(`
      CREATE TABLE conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ad_id uuid NOT NULL REFERENCES ads (id) ON DELETE CASCADE,
        buyer_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        seller_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        status conversation_status NOT NULL DEFAULT 'aberta',
        last_message_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (ad_id, buyer_id),
        CHECK (buyer_id <> seller_id)
      )`);
    await q.query(
      `CREATE INDEX conversations_buyer_idx ON conversations (buyer_id, last_message_at DESC)`,
    );
    await q.query(
      `CREATE INDEX conversations_seller_idx ON conversations (seller_id, last_message_at DESC)`,
    );

    await q.query(`
      CREATE TABLE messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
        -- NULL quando a conta de quem enviou foi excluída ("Usuário removido", RN-008).
        sender_id uuid REFERENCES users (id) ON DELETE SET NULL,
        body text CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 2000),
        upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL,
        has_link boolean NOT NULL DEFAULT false,
        flagged boolean NOT NULL DEFAULT false,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (body IS NOT NULL OR upload_id IS NOT NULL)
      )`);
    await q.query(
      `CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at)`,
    );
    await q.query(
      `CREATE INDEX messages_unread_idx ON messages (conversation_id) WHERE read_at IS NULL`,
    );

    await q.query(`
      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        type text NOT NULL,
        title text NOT NULL,
        body text NOT NULL,
        url text,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC)`,
    );
    await q.query(
      `CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL`,
    );

    await q.query(`
      CREATE TABLE push_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        endpoint text NOT NULL UNIQUE,
        p256dh text NOT NULL,
        auth text NOT NULL,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz
      )`);
    await q.query(`CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE push_subscriptions`);
    await q.query(`DROP TABLE notifications`);
    await q.query(`DROP TABLE messages`);
    await q.query(`DROP TABLE conversations`);
    await q.query(`DROP TYPE conversation_status`);
  }
}
