import dataSource from "../database/data-source";

/**
 * Promove uma conta existente a admin da plataforma (não há tela para isso, de propósito).
 * Uso: pnpm --filter api build && pnpm --filter api admin:promote pessoa@exemplo.com
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Informe o e-mail: pnpm --filter api admin:promote pessoa@exemplo.com");
    process.exitCode = 1;
    return;
  }
  await dataSource.initialize();
  try {
    const [rows] = await dataSource.query(
      `UPDATE users SET role = 'platform_admin', updated_at = now() WHERE lower(email) = $1 AND status <> 'excluido' RETURNING id`,
      [email],
    );
    if (!rows.length) {
      console.error(`Nenhuma conta ativa com o e-mail ${email}. Crie a conta pelo app primeiro.`);
      process.exitCode = 1;
      return;
    }
    await dataSource.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, details) VALUES (NULL, 'admin.promover_cli', 'user', $1, '{}')`,
      [rows[0].id],
    );
    console.warn(`${email} agora é admin da plataforma.`);
  } finally {
    await dataSource.destroy();
  }
}

void main();
