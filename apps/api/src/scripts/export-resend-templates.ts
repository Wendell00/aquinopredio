import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { resendTemplates } from "../mail/templates";

/**
 * Regrava o HTML dos templates do Resend a partir de `src/mail/templates.ts`.
 * Uso: pnpm --filter api build && pnpm --filter api mail:export — depois republique no painel.
 */
const dir = join(__dirname, "../../src/mail/resend");
for (const [file, html] of Object.entries(resendTemplates())) {
  writeFileSync(join(dir, file), html);
  console.warn(`src/mail/resend/${file}`);
}
