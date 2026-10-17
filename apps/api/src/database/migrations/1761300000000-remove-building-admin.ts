import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Prédios deixam de ter administrador: o vínculo é imediato e não há papéis entre moradores.
 * Pedidos que esperavam aprovação são aprovados e quem estava parado no onboarding por eles é liberado.
 */
export class RemoveBuildingAdmin1761300000000 implements MigrationInterface {
  name = "RemoveBuildingAdmin1761300000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE building_memberships SET status = 'ativo', decided_at = now(), updated_at = now()
       WHERE status = 'pendente'`,
    );
    await q.query(
      `UPDATE users u SET primary_building_id = (
         SELECT m.building_id FROM building_memberships m
         WHERE m.user_id = u.id AND m.status = 'ativo' ORDER BY m.created_at LIMIT 1
       ), updated_at = now()
       WHERE u.primary_building_id IS NULL
         AND EXISTS (SELECT 1 FROM building_memberships m WHERE m.user_id = u.id AND m.status = 'ativo')`,
    );
    await q.query(
      `UPDATE users u SET status = 'ativo', updated_at = now()
       WHERE u.status = 'onboarding_pendente' AND u.terms_accepted_at IS NOT NULL
         AND EXISTS (SELECT 1 FROM building_memberships m WHERE m.user_id = u.id AND m.status = 'ativo')`,
    );

    await q.query(`ALTER TABLE building_memberships DROP COLUMN IF EXISTS role`);
    await q.query(`DROP TYPE IF EXISTS membership_role`);
    await q.query(`ALTER TABLE buildings DROP COLUMN IF EXISTS join_policy`);
    await q.query(`DROP TYPE IF EXISTS join_policy`);
    await q.query(
      `DELETE FROM settings WHERE key IN ('buildings.autoApproveJoinDays', 'buildings.maxAdmins')`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE join_policy AS ENUM ('automatica', 'aprovacao_admin')`);
    await q.query(
      `ALTER TABLE buildings ADD COLUMN join_policy join_policy NOT NULL DEFAULT 'automatica'`,
    );
    await q.query(`CREATE TYPE membership_role AS ENUM ('morador', 'admin')`);
    await q.query(
      `ALTER TABLE building_memberships ADD COLUMN role membership_role NOT NULL DEFAULT 'morador'`,
    );
    // Sem como saber quem era admin: o criador do prédio volta a ser.
    await q.query(
      `UPDATE building_memberships m SET role = 'admin'
       FROM buildings b WHERE b.id = m.building_id AND b.created_by = m.user_id`,
    );
  }
}
