# Decisões técnicas

Decisões de implementação relevantes. Regras e decisões comerciais ficam em `docs/product/`.

## D-001 — Execução de moderação por episódio, com finalização idempotente (P00-B1, 28/10/2026)

Contexto: spec 5.7 e 5.16 item 3, RN-MOD-007, aceite 6.8. A moderação automática roda em segundo plano, fora da requisição; respostas atrasadas reativavam anúncios excluídos, desfaziam decisão humana e publicavam versões não analisadas.

Decisão:

- `ads.content_version` sobe a cada edição de conteúdo; o hash do conteúdo (`content-hash.ts`) é conferido junto, para pegar escritor que mude conteúdo sem incrementar a versão.
- Cada análise automática é uma execução em `ad_moderation_runs`. O **claim** grava `ads.moderation_run_id` com `UPDATE … WHERE status = 'em_moderacao' AND NOT manual_review AND moderation_run_id IS NULL`: no máximo uma execução automática por episódio, e a IA só é chamada depois do claim.
- O **commit** abre transação curta depois da IA, trava a linha (`FOR UPDATE`) e só aplica se estado, revisão manual, versão, hash e execução continuam os mesmos. Nenhuma transação fica aberta durante IA, storage ou notificação.
- Toda finalização (`aplicado`, `descartado`, `falhou`) usa `WHERE outcome IS NULL` e confere as linhas afetadas; o run é finalizado antes de qualquer efeito. Repetição não troca resultado terminal nem duplica decisão ou notificação. Índice único em `ad_moderations.run_id` é a segunda barreira. Notificação só após o commit; falha nela é apenas registrada em log.
- Decisão do admin, denúncias e auditoria na mesma transação, sobre a linha travada; anúncio excluído nunca é aprovado.

Trigger: `BEFORE UPDATE OF status, content_version ON ads` zera `moderation_run_id` quando a versão muda ou o anúncio volta para `em_moderacao`. Assim o fim do episódio vale para qualquer escritor (edição, denúncia, reativação, scheduler, SQL manual), sem depender de enumerar caminhos no código.

Alternativas descartadas:

- `updated_at` como versão: muda em ações que não alteram conteúdo (subir, destaque, aviso de expiração), não é atualizado por todas as queries e tem precisão diferente entre PostgreSQL (µs) e JavaScript (ms).
- Comparar campo a campo no `WHERE`: acopla a escrita a cada campo moderado e quebra em silêncio quando um campo novo passar a ser moderado.
- Fila/worker dedicado: fora do escopo da P00-B1; o desenho atual funciona igual se a execução migrar para um worker.

## D-002 — Denúncia de anúncio sob o lock do anúncio (P00-B1-F8, 29/10/2026)

Contexto: RN-MOD-008 (aprovada em 29/10/2026). A denúncia era admitida com o anúncio ativo, mas o efeito (inserção e ocultação) rodava depois, em autocommit e sem lock. Edição, pausa, expiração ou decisão do admin nesse intervalo deixavam o anúncio publicável com denúncias no limite, e a subquery de contagem, com o snapshot do início do statement, re-ocultava anúncio já aprovado.

Decisão:

- Admissão (visibilidade) e leitura do limite continuam fora de lock. O efeito é uma transação: `SELECT … FOR UPDATE` em `ads` → `INSERT reports` → contagem e escrita num statement posterior ao lock. Em READ COMMITTED esse statement tira snapshot novo e enxerga tudo que o dono anterior do lock gravou.
- Ordem de lock única para quem escreve `ads` e `reports`: `ads` → `reports` → execuções/decisões/auditoria (denúncia, decisão do admin, banimento, moderação, edição).
- No limite, `manual_review` vale para `ativo`, `em_moderacao`, `pausado` e `expirado`. Assim claim, commit, reativação e renovação já existentes (D-001) bloqueiam a publicação sem nenhuma mudança neles. `excluido`/`removido` só têm a contagem atualizada.

Escopo da garantia: `ads.report_count` = denunciantes distintos com denúncia aberta, entre os escritores acima. `resolveReport`, sanção com `reportId` e denúncia de indicação ficam fora (limitações registradas no STATUS).

Alternativas descartadas:

- Checar denúncias no commit da moderação e em `resume`/`renew`: espalha a regra por vários caminhos e ainda deixa a contagem obsoleta; o lock na denúncia resolve na origem.
- `SERIALIZABLE` ou advisory lock por anúncio: o lock da linha `ads` já é o ponto de serialização de todos os outros escritores.

## D-003 — Pausa decidida sob lock, idempotente (P00-B2.1, 29/10/2026)

Contexto: `pause` lia o anúncio sem lock e gravava `pausado` por ID; exclusão, remoção (admin, IA, banimento), edição em moderação ou ocultação por denúncia posteriores à leitura eram sobrescritas, e a reativação seguinte publicava o anúncio.

Decisão:

- Mesmo padrão de `resume`/`renew` (D-001): pré-checagem sem lock só filtra (`ativo` ou `pausado`); a decisão é tomada sobre a linha travada por `lockOwned` (propriedade + estado): excluído → 404; `pausado` → sucesso sem escrita (RN-ADS-005, só pausa); `ativo` → `transition` condicionada a status e `content_version`; demais → 400.
- Só a linha `ads` é travada, na mesma ordem dos demais escritores (D-002). Só o status muda; campos de moderação intactos. O trigger de D-001 roda no UPDATE de status, mas `ativo → pausado` não redefine `moderation_run_id`; a limpeza ocorre quando a reativação entra em `em_moderacao`.

Alternativa descartada: `UPDATE … WHERE status = 'ativo'` sem lock. Resolve a sobrescrita, mas não distingue "já pausado" (sucesso) de "mudou para outro estado" (400/404) sem uma segunda leitura sujeita à mesma corrida.

## D-004 — Cota de anúncios ativos por lock consultivo de transação (P00-B3, 29/10/2026)

Contexto: RN-065 (regra implementada) e princípio de RN-PLAN-005. A ocupação é uma contagem de linhas (`ativo` + `em_moderacao` do usuário), não uma linha; o lock da linha do anúncio não serializa anúncios distintos e a contagem rodava fora da transação.

Decisão:

- `pg_advisory_xact_lock(hashtextextended('ads.active_quota:' || user_id, 0))` como **primeiro** lock da transação de `create`, `resume` e `renew`; contagem na mesma conexão, num statement posterior ao lock (READ COMMITTED: snapshot novo, enxerga o que o dono anterior gravou). Ordem: cota → linha de `ads` → demais.
- Vale entre processos da API (o lock vive no PostgreSQL) e atrás de pooler em modo transação; é liberado no commit/rollback. Colisão de hash só serializa titulares a mais.
- Nenhuma outra conexão é pedida com o lock seguro: o limite (vínculo verificado + settings) é lido antes da transação; mudança concorrente do limite fica fora da garantia.
- O lock de cota não entra em ciclo: só é pedido por transação que ainda não segura nada, e nenhum outro fluxo o pede. Deadlocks preexistentes entre outros locks não são cobertos por esta decisão.

Alternativas descartadas:

- `users ... FOR UPDATE`: conflita com o `KEY SHARE` das FKs de qualquer INSERT que referencie o usuário e com a exclusão de conta (`ads` → `users`).
- `SERIALIZABLE`: retentativas espalhadas pelos três caminhos para uma única contagem.
- Tabela de reservas de vaga: só faria sentido com as cotas definitivas (C1), fora desta fatia.

## D-005 — Uploads validados, associados e marcados numa só transação (P00-B4.1, 29/10/2026)

Contexto: `create` validava fora da transação; `update` lia uploads sem lock; ambos marcavam `attached_at` depois do commit. A `UNIQUE (upload_id)` de `ad_images` já impedia dupla associação, mas corridas viravam 500, e falha após o commit deixava upload associado sem marca.

Decisão:

- `lockClaimable`: `SELECT … FROM uploads WHERE id IN (…) AND owner_id = … ORDER BY id FOR UPDATE`, depois a mesma regra (`pickClaimable`). Ordem por id: conjuntos sobrepostos travam na mesma sequência.
- Validação, `ad_images` e `attached_at` na mesma transação; nada de marcação depois do commit em anúncios.
- Ordem: criação — cota → `uploads` → `ads` → `ad_images`; edição — `ads` → `uploads` → `ad_images`.
- Semântica de `attached_at` inalterada (uso histórico). Sem migration: a `UNIQUE (upload_id)` existente segue como proteção adicional.
- Complemento: como `attached_at` pode faltar em dados antigos, `lockClaimable` confere também a associação atual em `ad_images` (para uploads que não são do próprio anúncio), já com os uploads travados — a FK de qualquer INSERT concorrente espera esse lock. Recusa com 400; nenhum 23505 é convertido genericamente.
- A garantia cobre validação, associação e marcação dentro da transação; etapas posteriores ao commit (vínculo do rascunho, disparo da moderação) ficam fora.

Alternativas descartadas:

- Só converter o 23505 em 400: mantém a marcação fora da transação (associado sem marca).
- Limpar `attached_at` ao remover a foto: muda a política de reutilização (L1), decisão de produto.

## D-006 — Submissão de prédio e aplicação condicional da validação (P00-B5.2, 29/10/2026)

Contexto: especificação §5.16 item 2. A validação automática gravava o status por ID depois de chamar mapa e IA; decisão do admin, reenvio ou arquivamento no meio do caminho eram desfeitos. Conferir só `status = 'pendente_validacao'` não bastava: o reenvio volta a esse estado.

Decisão:

- `buildings.submission_id` (uuid gerado pelo banco) identifica a submissão em validação; um trigger gera nova submissão quando o prédio volta a `pendente_validacao` vindo de outro estado ou quando um dado analisado muda de fato. Vale para qualquer escritor.
- A execução captura a submissão antes das chamadas externas; a aplicação começa por `UPDATE … WHERE status = 'pendente_validacao' AND submission_id = capturada`. Zero linhas = descarte, sem registro, efeito ou notificação. Isso dá no máximo uma aplicação automática por submissão, sem tabela de execuções.
- `building_verifications.submission_id` guarda a submissão julgada; decisões do admin posteriores seguem permitidas (sem unicidade).
- Admin decide sob `FOR NO KEY UPDATE`; reenvio é uma transação única (prédio condicional, vínculo, prédio principal, ativação) e só dispara a validação depois do commit. Ordem: `buildings` → registros/vínculo → `users`.

Alternativas descartadas:

- Reaproveitar `resubmissions` como versão: acopla a identidade a um limite comercial configurável e pode repetir valor se o contador for ajustado.
- Hash dos dados: só o reenvio muda os dados analisados, e o trigger já cobre outros escritores; o hash confundiria um reenvio igual ao anterior com a mesma submissão.
- Tabela de execuções como em `ad_moderation_runs`: no fluxo real há uma execução por submissão; a transição condicional basta para evitar efeito duplicado.

Limite: instâncias antigas da aplicação durante o deploy, e execuções iniciadas por elas, gravam sem a condição.


## D-007 — Ambiente dos e2e só pelo processo; variáveis declaradas no turbo (P00-C1, 30/10/2026)

Parcialmente substituída pela D-008 (abaixo): `CI`/`GITHUB_ACTIONS` saíram do `passThroughEnv` e deixaram de liberar banco ou specs de corrida; o CI passou a verificar o relatório do Jest.

Contexto: Fase 0 (testes e build passando; comandos reais documentados). O CI roda `pnpm turbo test:e2e`, e o turbo em modo estrito (padrão) não repassava `DATABASE_URL` à tarefa: reproduzido localmente pelo mesmo comando, o app recusava subir. Em execução local, o `ConfigModule` completava o ambiente com o `apps/api/.env`, que pode apontar para banco e serviços hospedados; o Supabase Realtime do chat não era desligado nos e2e.

Decisão:

- Com `NODE_ENV=test` o app ignora o `.env` (`ignoreEnvFile`); o ambiente dos testes vem do processo e de `test/support/setup-env.ts`, igual ao CI, que não tem `.env`.
- `setup-env.ts` zera Supabase Realtime, VAPID e Resend, além de IA e Stripe.
- `turbo.json`: a tarefa `test:e2e` declara em `passThroughEnv` as variáveis lidas pelos e2e (`CI`, `GITHUB_ACTIONS`, `NODE_ENV`, `DATABASE_URL`, `SMTP_URL`, `MAILPIT_URL`, `BETTER_AUTH_SECRET`, `E2E_*`). Passthrough, não `env`: a tarefa não usa cache.
- O job e2e define `E2E_REQUIRE_RACE=1`; sem `E2E_ISOLATED`/`GITHUB_ACTIONS`, `support/isolation.ts` lança erro em vez de pular os specs de corrida.

Alternativas descartadas:

- `--env-mode=loose` no CI: repassaria qualquer variável e esconderia dependências não declaradas.
- Zerar no `setup-env` cada chave do `.env`: depende de manter a lista em dia; ignorar o arquivo fecha a classe inteira.
- Contar testes pulados no relatório do Jest: exige passo extra no CI; a flag falha no próprio spec.

## D-008 — Banco dos e2e só por identidade provisionada; relatório verificado fora do turbo (P00-C1 complemento, 03/11/2026)

Contexto: depois da D-007, `CI` definido fazia o `global-setup` dar `TRUNCATE` na `DATABASE_URL` do ambiente, sem conferir o banco, e `GITHUB_ACTIONS` liberava os specs de corrida; qualquer um dos dois, num shell com `DATABASE_URL` de outro banco, bastava. O `E2E_REQUIRE_RACE` só pegava pulo de suíte inteira, não teste pulado/todo, spec ausente nem filtro de caminho.

Decisão:

- `test/support/e2e-database.ts` decide o banco sem conexão: com `E2E_ISOLATED` exige `127.0.0.1`, token e cluster (do `scripts/e2e-isolated.sh`); sem ele, sempre o banco local fixo `localhost:5433/aquinopredio_test` (fluxo local documentado), ignorando `DATABASE_URL`. `CI` e `GITHUB_ACTIONS` não entram.
- O `global-setup` confere token e `system_identifier` pela conexão antes do `TRUNCATE`; como roda antes de qualquer spec, também precede as migrations do boot. `createTestApp` repete a conferência pela conexão do app.
- O job e2e do CI deixa de usar `services:` e roda o mesmo provisionador (`pnpm test:e2e:ci` → `e2e-isolated.sh --turbo`): `pnpm turbo test:e2e` com relatório JSON do Jest, verificado depois por `scripts/verify-e2e-report.mjs` num processo separado, pela identidade dos 8 arquivos protegidos e pelo status de cada teste.
- Testes de guarda sem banco (`test/guards/`) no `pnpm check`: recusas antes da conexão, casos negativos do verificador e isolamento de ambiente com valores fictícios.

Alternativas descartadas:

- Manter os `services:` do GitHub e gravar o token com `psql` no job: dois provisionadores para manter em sincronia; o local deixaria de reproduzir o CI.
- Verificar o relatório dentro da tarefa do turbo (reporter do Jest): uma falha no próprio Jest ou no repasse de argumentos poderia passar sem verificação.
- Contar só o total de testes: não detecta troca de um spec protegido por outro.

Limite: comprovado só em execução local; a execução no GitHub Actions (Docker no runner `ubuntu-latest`) exige push autorizado.
