# Estado da implementação

Atualizado em: 03/11/2026.

## Fase atual

Preparação documental concluída. P00 — estabilização em andamento: fatias P00-A (ordem entre migrations e autenticação), P00-B1 (moderação de anúncios consistente sob concorrência), P00-B1-F8 (denúncias concorrentes com moderação), P00-B2.1 (pausa sob lock), P00-B3 (limite de anúncios ativos sob concorrência), P00-B4.1 (associação de uploads sob concorrência), P00-B5.1 (sincronização dos testes da validação de prédio), P00-B5.2 (resultado atrasado da validação de prédio) e P00-C1 (build, caminho e2e do CI e registro da Fase 0, com o complemento de proteção do banco e verificação externa do relatório) implementadas e validadas em PostgreSQL descartável. P00-B5.1, P00-B5.2 e P00-C1 (com o complemento) aprovadas pelo proprietário em 03/11/2026, dentro dos respectivos escopos e da validação local registrada. P00 não encerrada: ver "Pendências para encerrar P00" na seção P00-C1. Esta etapa não implementa regras comerciais nem certifica a plataforma para produção.

## P00-A — Migrations antes da autenticação

Referências: P00; especificação técnica §5.1 (migrations versionadas como única forma de alterar schema) e §5.16 item 1; aceite §6.12, primeiro critério ("Migrações executam antes da inicialização do módulo de autenticação"). Ajuste técnico, sem código RN.

### Diagnóstico

- Factory `AUTH` (`apps/api/src/auth/auth.module.ts`) dependia de `ConfigService`, `AUTH_POOL` e `MailService`, sem depender do `DataSource`.
- O `DataSource` do `TypeOrmModule.forRootAsync` só resolve após `initialize()`, que roda as migrations (`migrationsRun: true`, `config/database.config.ts`). Token do provider: classe `DataSource` do `typeorm` (conexão padrão, `getDataSourceToken()` do `@nestjs/typeorm` 12.0.2).
- Better Auth 1.7.7 dispara `checkSchema()` assíncrono ao ser construído (`better-auth/dist/auth/base.mjs`). Um `SchemaMismatchError` fica em cache e é relançado sem nova consulta até o próprio Better Auth migrar (`@better-auth/core/dist/db/schema-check.mjs`), o que nunca ocorre aqui (schema só por migrations do repo).
- O Nest resolve providers de módulos diferentes em paralelo; `app.listen` espera o TypeORM, mas a construção de `AUTH` podia ocorrer antes.
- Evidência anterior: só inspeção estática, sem PostgreSQL; `pnpm check` verde com 91 testes e quatro avisos preexistentes do Biome. Era baseline, não validação desta alteração.

### Alteração implementada

- `apps/api/src/auth/auth.module.ts`: factory `AUTH` passa a injetar `DataSource` (parâmetro não usado, só para ordenar). Pool próprio do Better Auth, demais dependências e `createAuth()` inalterados. Sem consulta extra, espera por tempo, nova conexão, migration duplicada ou desativação da validação de schema.
- `apps/api/src/auth/auth.module.spec.ts` (novo): usa o `AuthModule` real com resolução de dependências do Nest; substitui só as bordas (`createAuth`, `pg.Pool`, `ConfigService`, `MailService`) e fornece um `DataSource` controlado por promessa. Sincronização por promessas explícitas e por drenagem das microtasks com `setImmediate` (sem espera por tempo); `afterEach` libera a barreira e fecha o módulo mesmo se uma asserção falhar.

### Testes e comandos executados (28/10/2026)

| Comando | Resultado |
|---------|-----------|
| `jest src/auth/auth.module.spec.ts` com `auth.module.ts` do `HEAD` (troca temporária, restaurada) | 2 de 2 falham: `createAuth` chamado 1 vez com `DataSource` pendente e com `DataSource` rejeitado |
| `jest src/auth/auth.module.spec.ts --detectOpenHandles` com a correção | 2 de 2 passam, sem handles abertos nem rejeições não tratadas |
| `pnpm check` | verde: Biome com os mesmos 4 avisos preexistentes de complexidade (`interactions.service.ts`, `admin-panel.tsx`, `ad-detail-view.tsx`, `referral-list.tsx`), typecheck, testes shared 18, web 25, api 50 (93 no total = 91 + 2 novos) |
| `git diff --check` | sem erros |
| Reprodução em PostgreSQL descartável (abaixo) | correção aprovada nos 3 cenários; `HEAD` falha nos 3 |

Reprodução isolada: container próprio `postgis/postgis:16-3.4` (`--rm`, dados em `tmpfs`, porta efêmera em `127.0.0.1`), um banco novo por cenário, com trava no script que recusa qualquer URL fora desse container. Removido ao final. Script e config Jest temporários ficaram fora do repositório (scratchpad da sessão), não versionados. Sobe o `AppModule` real via `Test.createTestingModule` + `app.init()` (sem `listen`), registrando a ordem entre o fim de `DataSource.initialize()` e a chamada de `createAuth()`, e consultando `checkSchema()` do Better Auth após o boot.

| Cenário | Com a correção | `HEAD` (antes) |
|---------|----------------|----------------|
| Schema vazio (0 → 14 migrations) | `migrations:ok` → `createAuth`; schema válido | `createAuth` → `migrations:ok`; log `Database schema mismatch` e `checkSchema()` continua falhando após as 14 migrations aplicadas (autenticação quebrada até reiniciar) |
| Migrations pendentes (11 aplicadas, 3 pendentes) | `migrations:ok` → `createAuth`; 14 aplicadas; schema válido | `createAuth` antes das migrations; schema válido só porque as 3 pendentes não tocam tabelas do Better Auth |
| Falha de migration (`users` pré-existente conflitante) | boot falha com `relation "users" already exists` após as tentativas do TypeORM; `createAuth` nunca chamado | `createAuth` chamado antes da falha; log `Database schema mismatch` |

`pnpm test:e2e` não executado: o banco de e2e configurado não teve isolamento comprovado nesta sessão.

### Critérios

- Comprovado: aceite §6.12, primeiro critério — `createAuth()` só ocorre após `initialize()` (migrations) bem-sucedido; falha de migration aborta o boot sem construir o Better Auth (unitário + reprodução isolada).
- Não comprovado nesta fatia: boot via `main.ts` com `listen` (mesma resolução de DI, não exercitada diretamente); e2e existentes; demais critérios de §6.12.

### Riscos separados (fora desta fatia)

- Concorrência entre processos: cada instância da API roda `migrationsRun` no boot, sem trava entre processos. Duas instâncias subindo juntas podem disputar as mesmas migrations. Tratar em fatia própria (ex.: migrations como passo de deploy ou advisory lock).
- O `AUTH_POOL` continua criado antes das migrations; o `Pool` do `pg` só conecta na primeira consulta, e nenhuma ocorre antes de `createAuth()`.

## P00-B1 — Moderação de anúncios consistente sob concorrência

Referências: P00; especificação técnica §5.7 e §5.16 item 3; RN-MOD-003, RN-MOD-007; aceite §6.8 ("Resposta atrasada não reativa item excluído nem desfaz decisão humana", "Edição durante análise invalida o resultado da versão antiga"). Decisão técnica em [DECISIONS.md](DECISIONS.md) (D-001). Sem regra comercial nova, sem mudança em `@repo/shared`, front ou dependências.

### Diagnóstico (resumo)

- `AdModerationService.apply()` gravava status por ID depois da IA: aprovação atrasada reativava anúncio excluído (dono ou conta) e removido por banimento, desfazia decisão do admin, publicava versão editada não analisada e anúncio pausado; registro e notificação saíam mesmo quando o resultado deveria ser descartado.
- `AdsService.update`, `resume` e `renew` decidiam a partir de leitura sem lock: edição atrasada ressuscitava anúncio excluído/removido e apagava o aviso de ocultação por denúncia; reativação/renovação com leitura antiga publicava conteúdo editado sem moderação; clique duplo gerava duas análises.
- `decideByAdmin` + denúncias + auditoria rodavam fora de transação e aceitavam anúncio excluído.
- e2e chamavam `moderate()` uma segunda vez após a moderação automática (F9).

### Alteração implementada

- Migration `1761700000000-ad-moderation-runs.ts`: `ads.content_version`, `ads.moderation_run_id`, tabela `ad_moderation_runs` (sem conteúdo do usuário), `ad_moderations.content_version`/`run_id` com índice único, `ai_calls.correlation_id`, trigger `ads_reset_moderation_run`.
- `moderation/ad-moderation-runs.service.ts` (novo): `claim` (execução única por episódio, antes da IA), `commit` (transação curta com `FOR UPDATE`, descarte com motivo `estado_<status>`/`revisao_manual`/`versao_alterada`/`execucao_substituida`), `fail`. Toda finalização com `outcome IS NULL` e conferência de linhas afetadas.
- `moderation/locked-ad.ts` (novo): leitura com lock e escrita de status condicionada ao status travado; `content-hash.ts` (novo).
- `ad-moderation.service.ts`: `moderate` = claim → IA (sem transação) → commit; notificação só após commit e em `try/catch` próprio; `decideByAdmin` atômico com callback transacional; `apply()` público removido.
- `admin.service.ts`: denúncias e auditoria no callback transacional da decisão.
- `ads.service.ts`: `update` compara e grava sob lock (versão +1 quando o conteúdo muda; preserva `status_reason` sob revisão manual); `resume`/`renew` decidem o ramo sob lock, com `UPDATE … WHERE status = <travado> AND content_version = <travada>`; só enfileiram análise sem revisão manual.
- `uploads.service.ts`: regra de `claim` extraída para `pickClaimable` (reusada sob lock na edição). `ai.service.ts`: `correlationId` opcional gravado em `ai_calls`.
- Testes: `scripts/e2e-isolated.sh` + `test:e2e:isolated`; `test/support/{isolation,sync,moderation}.ts` (novos), `fakes.ts` (IA com barreira), `app.ts` (rastreio da moderação em segundo plano, `moderationSettled`), `setup-env.ts`/`global-setup.ts` (modo isolado com verificação de token e `system_identifier`); `test/README.md`. Specs `admin`, `ads`, `billing`, `chat`, `feed`, `reviews` passam a esperar a moderação disparada pelo fluxo (F9).

### Testes novos

- `test/moderation-race.e2e-spec.ts` (27): R1–R3c (edição × snapshot/exclusão/banimento/denúncia), R4–R5b (admin × exclusão, atomicidade), R6–R6b (execução única), R7 (I1–I5, resposta atrasada), R8 (fallback sem IA), R9–R9c (reativação/renovação × edição; revisão manual). Asserções decisivas só com schema anterior à B1.
- `test/moderation-runs.e2e-spec.ts` (13): rastro e motivo de descarte, `correlation_id`, trigger, hash, repetição de commit após aplicado/“revisar”/descartado preservando resultado e motivo originais, `fail` após terminal, falha de notificação após aplicar, índice único, decisão do admin com versão.
- Unitários: `ad-moderation.service.spec.ts` (7), `content-hash.spec.ts` (4), `ads.service.spec.ts` (9), `ai.service.spec.ts` (1).
- Sincronização: barreiras em `Repository<Category>.existsBy` (edição), `PlansService.planOf` (reativação) e `SettingsService.get('ads.activeDays')` (renovação), todas antes de qualquer lock e presentes no código antigo e no novo; filas de lock observadas por `pg_blocking_pids` (transitivo); timeout de diagnóstico de 10 s; barreiras, locks, triggers de teste e análises pendentes liberados no `afterEach`. Cenários com fila de lock (R2, R4c, R6b) deduzem o vencedor das respostas e do estado final.

### Comandos e resultados (28/10/2026)

Banco: `apps/api/scripts/e2e-isolated.sh` (containers `--rm`, `tmpfs`, `127.0.0.1`, credenciais aleatórias, token + `system_identifier` conferidos). A imagem `postgis/postgis:16-3.4` é amd64 e roda emulada no host arm64 (aviso do Docker).

| Comando | Antes (`HEAD` + P00-A, worktree descartável) | Depois (P00-B1) |
|---------|------|------|
| `e2e-isolated.sh test/moderation-race.e2e-spec.ts` | 24 falham, 3 passam (R2, R4b, R5). 23 falhas por asserção de comportamento (ex.: I1 `ativo` em vez de `excluido`; R3 edição 200 em vez de 404; R9 `ativo` em vez de `em_moderacao`). R6b falhou por tempo esgotado: no código antigo só 1 das 2 reativações apareceu bloqueada, então as asserções de comportamento não foram alcançadas (repetido 3×, igual) | 27/27 em todas as 15 execuções: 11 antes do último ajuste de código (7 focadas + 4 na suíte completa) e 4 depois (3 focadas + 1 na suíte completa) |
| `e2e-isolated.sh test/moderation-runs.e2e-spec.ts` | não aplicável (schema novo) | 13/13 em todas as 9 execuções (1 isolada, 3 focadas, 5 na suíte completa) |
| `pnpm --filter api test:e2e:isolated` (suíte completa) | specs originais: 77 testes, 5 falham (`ads` proibido e raio, `billing` RN-145, `buildings` ×2) | 117 testes: 3 falham (`ads` raio, `buildings` ×2) nas 4 execuções finais; numa delas também falhou `signUpAndLogin` (verificação de e-mail 401, intermitente). Uma execução anterior revelou vazamento de configuração do spec de corrida (`reports.autoHideThreshold`) para `feed`/`referrals`, corrigido com `reset` no `afterAll` |
| `pnpm --filter api test -- ad-moderation content-hash ads.service` | — | 20/20 |
| `pnpm check` | verde (93 testes) | verde: Biome com os mesmos 4 avisos preexistentes, typecheck, shared 18, web 25, api 71 (114) |
| `git diff --check` + checagem de espaços nos arquivos novos | — | sem erros |

As 3 falhas restantes da suíte completa existem antes e depois: a validação de prédio roda em segundo plano e, com IA falsa, termina antes da asserção (`pendente_revisao`/`verificado` em vez de `pendente_validacao`; raio 1 aceito). É o item de testes assíncronos/callbacks de prédio de P00, fora desta fatia. As falhas de `ads` proibido e `billing` RN-145 no antes vinham da moderação dupla (F9) e foram resolvidas.

### Critérios

- Comprovado (e2e em PostgreSQL descartável): aceite §6.8, quarto e quinto critérios; §5.7 itens 1–6 (recarga sob lock, versão + hash, estado moderável, decisão humana, comparação atômica, registro com versão/execução/modelo); RN-MOD-007; INV-1 a INV-8 do plano.
- RN-MOD-003: comportamento sem IA inalterado (configuração `MODERATION_WITHOUT_AI`); o fallback agora passa pelo mesmo claim/commit (R8, unitário).
- Não comprovado nesta fatia: execução no CI (os specs de corrida rodam no GitHub Actions via `GITHUB_ACTIONS`, ainda não executados lá); provedor de IA real; carga com várias instâncias da API.

### Notas para o proprietário (sem regra nova)

- Anúncio `pausado`/`expirado` com revisão manual pendente agora vai para `em_moderacao` ao reativar/renovar, sem análise automática (guarda de segurança; estado só alcançável artificialmente hoje).
- Admin continua podendo aprovar anúncio `removido` por banimento ou `pausado` (comportamento atual mantido); só `excluido` é recusado.
- Política de reavaliação: no máximo uma execução automática efetiva por episódio; nova análise automática só após edição de conteúdo ou nova entrada em moderação. "Revisar", falha inesperada e IA indisponível em produção ficam na fila manual (igual ao comportamento anterior).

## P00-B1-F8 — Denúncias concorrentes com moderação

Referências: RN-MOD-008 (nova, aprovada pelo proprietário em 29/10/2026 junto com D1–D5 do plano), RN-ADS-004, RN-MOD-007, RN-093 (histórico); aceite §6.8 (novo critério). Decisão técnica em [DECISIONS.md](DECISIONS.md) (D-002). Sem migration, sem mudança em `@repo/shared`, front ou dependências.

### Diagnóstico

- Elegibilidade: `assertReportable` → `FeedService.detail`, sem lock. Para terceiros, `VISIBLE` exige `status = 'ativo'`, mesmo prédio ou raio e ausência de bloqueio; o dono é recusado com 400. Só anúncio ativo admite denúncia.
- Depois da admissão, `INSERT reports` e `UPDATE ads` rodavam em autocommit, sem lock. O UPDATE só ocultava se o anúncio ainda estivesse `ativo`. Entre admissão e efeito o anúncio podia ser editado (nova moderação), pausado, expirado ou decidido pelo admin.
- Reproduzido no baseline: a moderação automática (IA ou regras) e a reativação/renovação publicavam o anúncio com denúncias abertas no limite; contagem obsoleta re-ocultava o anúncio depois da aprovação do admin.

### Alteração implementada

- `apps/api/src/feed/interactions.service.ts`: caminho de denúncia de anúncio numa transação — `settings.get` fora do lock → `SELECT … FOR UPDATE` em `ads` → `INSERT reports` → contagem e escrita num statement posterior ao lock. No limite: `ativo` → `em_moderacao` + revisão manual + aviso; `em_moderacao` → revisão manual + aviso (D2); `pausado`/`expirado` → só revisão manual (D1); `excluido`/`removido` → só contagem (D3). Denúncias de indicação, usuário, prédio e mensagem inalteradas. O commit da moderação não mudou: descarta por `revisao_manual` (D-001).
- `docs/product/03-regras-de-negocio.md` (RN-MOD-008) e `06-criterios-de-aceite.md` (§6.8): regra aprovada registrada; histórico em `docs/current-state/` intacto.
- Testes: `test/report-moderation-race.e2e-spec.ts` (novo, 17); `test/support/ads.ts` (novo, apoio extraído de `moderation-race`, que passou a importá-lo sem mudar cenários); `test/README.md`.

### Testes e sincronização

Toda denúncia passa pelo `POST /api/reports` real, admitida com o anúncio ativo; barreira em `SettingsService.get("reports.autoHideThreshold")` (depois da admissão, antes do efeito, sem lock aberto; no baseline fica entre INSERT e UPDATE). Mudança de estado por HTTP real (edição, pausa, exclusão, decisão do admin, banimento) ou pelo `AdsScheduler.expireAds()` real. Filas de lock com `holdAdLock` + `waitBlockedBy`; ordem deduzida do estado final. Asserções decisivas só com schema da P00-B1.

| Teste | Cenário | Baseline (P00-A + P00-B1, sem F8) | Depois |
|---|---|---|---|
| F1 | denúncia admitida antes da edição, concluída durante a análise; IA aprova | **falha comportamental reproduzida**: `ativo`, `manual_review` falso | passa |
| F1-fallback | idem, IA falha → regras (`approve`) | **reproduzida**: `ativo` | passa: run `descartado/revisao_manual`, sem registro de decisão do run, sem notificação de aprovação |
| F2 | IA aprova antes da denúncia | passa (controle) | passa |
| F2-lock | commit da análise e denúncia na fila do lock | passa; ordem observada commit → denúncia | passa; ordem observada commit → denúncia (3 de 3 execuções); a outra ordem não foi exercitada |
| P1 / P2 | pausa → reativação, sem / com edição pendente | **reproduzidas**: `ativo` (P2 via IA) | passam: `em_moderacao` + revisão manual, nenhuma execução nem chamada à IA |
| E1 / E2 | expiração → renovação, sem / com edição pendente | **reproduzidas**: `ativo` | passam: idem |
| E2-fallback | idem E2, IA em modo de falha | **reproduzida**: `ativo` pelas regras | passa: nenhuma execução, nenhuma chamada |
| C1 / C2 | 2 e 3 denúncias distintas na fila do lock | passam (controle) | passam: `report_count` = abertas distintas |
| C3 | clique duplo da mesma pessoa na fila do lock | **falha de sincronização**, não comportamental: no código antigo o 2º INSERT dá 409 sem esperar o lock, só 1 sessão bloqueia e `waitBlockedBy(2)` esgota | passa: 204 + 409, 1 denúncia |
| C4 | controle de elegibilidade | passa | passa: dono 400; anúncio oculto recusa nova denúncia (404) |
| D-a | aprovação do admin × denúncia na fila do lock | **reproduzida (contagem obsoleta, antes hipótese)**: anúncio aprovado volta a `em_moderacao` com `report_count` 2 e 0 denúncias abertas | passa; ordem observada admin → denúncia (3 de 3); a outra ordem não foi exercitada |
| D-b, X1, X2 | remoção pelo admin, exclusão, banimento antes do efeito | passam (controle) | passam |

Resumo: baseline 9 falham / 8 passam (8 comportamentais, 1 de sincronização); depois 17/17. Nos cenários de fila, a ordem foi deduzida do estado final; só uma ordem apareceu em cada um, então a asserção da outra ordem segue sem execução real.

### Comandos e resultados (29/10/2026)

| Comando | Resultado |
|---|---|
| `./scripts/e2e-isolated.sh test/report-moderation-race.e2e-spec.ts --verbose` (baseline) | 9 falham, 8 passam (acima) — 1 execução |
| idem, com a correção | 17/17 em 3 execuções (repetidas só para checar se a ordem dos cenários de fila variava) |
| `./scripts/e2e-isolated.sh` com `moderation-race`, `moderation-runs`, `feed`, `admin`, `referrals` | 66/67: falhou `feed` "3 denúncias…" no `publish`, antes de denunciar, com 401 de provedor externo (`authentication_error`), sem relação com a denúncia; `feed` sozinho em seguida: 11/11 |
| `pnpm --filter api test:e2e:isolated` | 134 testes: 3 falham, as mesmas preexistentes (`ads` raio, `buildings` ×2) |
| `pnpm check` | verde: Biome com os mesmos 4 avisos (o de `interactions.service.ts` é o preexistente em `assertReportable`), typecheck, shared 18, web 25, api 71 |
| `git diff --check` | sem erros |

Preservação: diff rastreado da preparação, P00-A e P00-B1 idêntico ao de antes da fatia (exceto `interactions.service.ts`); não rastreados mantidos; nenhum container de e2e restante.

### Levantamento D5 (dados existentes)

Pendente. Não há PostgreSQL local de desenvolvimento (nenhum container nem volume `aquinopredio` de banco); o `DATABASE_URL` de `apps/api/.env` aponta para um PostgreSQL hospedado (Supabase), não acessado por poder ser produção. Consulta prevista, só leitura, para rodar num ambiente autorizado:

```sql
SELECT a.id, a.status, a.manual_review, a.report_count,
       count(DISTINCT r.reporter_id) FILTER (WHERE r.status = 'aberta') AS abertas_distintas
FROM ads a LEFT JOIN reports r ON r.target_type = 'ad' AND r.target_id = a.id
WHERE a.status IN ('ativo', 'em_moderacao', 'pausado', 'expirado')
GROUP BY a.id
HAVING count(DISTINCT r.reporter_id) FILTER (WHERE r.status = 'aberta') <> a.report_count
    OR count(DISTINCT r.reporter_id) FILTER (WHERE r.status = 'aberta')
       >= COALESCE((SELECT (value)::int FROM settings WHERE key = 'reports.autoHideThreshold'), 3);
```

(3 é o padrão de `settings.defaults.ts`.) Sem backfill.

### Critérios

- Comprovado (e2e em PostgreSQL descartável): RN-MOD-008 e o novo critério de §6.8 — moderação automática (IA e regras), reativação e renovação não publicam anúncio com denúncias no limite (F1, F1-fallback, F2, F2-lock, P1, P2, E1, E2, E2-fallback); denúncias concorrentes não se perdem, duplicata 409 (C1–C3); elegibilidade inalterada (C4); decisão do admin sem contagem obsoleta (D-a); exclusão e remoção preservadas (D-b, X1, X2).
- Garantia de contagem limitada aos escritores do protocolo de lock (denúncia, decisão do admin, edição, reativação, renovação, moderação).
- Não comprovado: a segunda ordem de F2-lock e D-a; execução no CI.

### Limitações existentes (fora desta fatia)

- `resolveReport` e sanção com `reportId` mudam `reports.status` sem recalcular `ads.report_count`.
- Denúncia de indicação (`referral`) mantém contagem por subquery no mesmo statement (mesmo risco de contagem obsoleta).
- `pause` gravava por ID sem lock: corrigido em P00-B2.1 (B6).
- D4: a aprovação do admin encerra todas as denúncias abertas, inclusive uma que chegou instantes antes (regra de resolução mantida).

## P00-B2.1 — Pausa de anúncio sob lock

Referências: P00 (P00-B2, transições restantes); RN-ADS-005 **somente quanto à pausa** (exclusão e renovação não foram tratadas nesta fatia); RN-MOD-007; RN-MOD-008; aceite §6.8. Decisão técnica em [DECISIONS.md](DECISIONS.md) (D-003). Sem migration, sem regra comercial nova, sem mudança em `@repo/shared` ou front.

### Diagnóstico (P00-B2)

| Operação | Escrita | Risco | Evidência | Prioridade |
|---|---|---|---|---|
| `pause` | UPDATE por ID após leitura sem lock | sobrescreve exclusão, remoção (admin, IA, banimento), edição em moderação, ocultação por denúncia e expiração | **reproduzido** (abaixo) | Alta — corrigido nesta fatia |
| `remove` | UPDATE por ID para `excluido` | nos intercalamentos analisados (remove × edição, reativação, renovação, moderação, denúncia, admin) a exclusão prevalece, porque os escritores sob lock recusam `excluido`; outros intercalamentos não foram analisados | estático | sem correção nesta fatia |
| `bump` | UPDATE por ID de `bumped_at` | grava em anúncio que deixou de estar ativo (intervalo e ordenação; nada fica público) | estático | Baixa |
| `feature` | lock em `users` + UPDATE por ID | destaque gravado em anúncio que deixou de estar ativo, ocupando vaga do Pro | estático | Baixa/Média (fatia de benefícios) |
| `AdsScheduler.expireAds` | UPDATE condicional `status='ativo'` | o PostgreSQL reavalia o WHERE na linha nova após esperar lock | comportamento correto pela análise | — |

### Alteração implementada

- `apps/api/src/ads/ads.service.ts` (`pause`): pré-checagem sem lock aceita `ativo` e `pausado` (senão 400) e não retorna sucesso; na transação, `lockOwned` revalida propriedade e estado: inexistente/excluído → 404; `pausado` → sucesso sem escrita; `ativo` → `transition` para `pausado` (UPDATE condicionado a status e `content_version` travados); demais → 400. Só o status muda; `manual_review`, `needs_moderation`, `status_reason`, `content_version` e `moderation_run_id` ficam intactos.
- Trigger `ads_reset_moderation_run`: o UPDATE de status executa o trigger, mas `ativo → pausado` não entra em `em_moderacao` nem muda a versão, então não redefine `moderation_run_id`. A limpeza acontece quando a reativação leva o anúncio a `em_moderacao`.
- Testes: `test/pause-race.e2e-spec.ts` (novo, 10); `test/support/sync.ts` (`armGateAfter`: barreira depois de o método devolver); `src/ads/ads.service.spec.ts` (+5 unitários de pausa); `test/README.md`.

### Sincronização

Pausa pela rota real; barreira `armGateAfter` em `Repository<Ad>.findOne` injetado, casando o ID do anúncio: a pausa já leu `ativo` e não abriu lock (antes e depois). Mudança concorrente pelas rotas reais (DELETE, decisão do admin, sanção, PATCH, denúncia), pela IA com barreira ou pelo `AdsScheduler.expireAds()` real. B8 usa `holdAdLock` + `waitBlockedBy(2)`; o resultado vale em qualquer ordem. Escritas contadas por trigger de teste `AFTER UPDATE ON ads` (criado e removido pelo spec). Limpeza no `afterEach`/`afterAll`.

### Antes × depois (PostgreSQL descartável)

Baseline: árvore com preparação, P00-A, P00-B1 e F8 completas, sem a correção (2 execuções: a segunda só reordenou asserções para expor estado e reativação antes do código HTTP; mesmo resultado).

| Teste | Baseline | Classificação | Depois |
|---|---|---|---|
| B1 pausa × exclusão + reativar | `pausado` → reativado `ativo` | regressão comportamental reproduzida (exclusão revertida e republicada) | 404; segue `excluido`; reativar 404 |
| B2 pausa × remoção pelo admin + reativar | `pausado` → `ativo` | reproduzida (remoção humana revertida e publicada) | 400; segue `removido` com motivo; reativar 400 |
| B3 pausa × banimento | `pausado` | reproduzida (status do banimento revertido) | 400; `removido` "Conta banida" |
| B4 pausa × edição em análise | reativação deixa `ativo` sem decisão aprovada para a versão atual | reproduzida (publicação sem moderação) | 400; `ativo` só após a análise aplicada da versão nova |
| B5 pausa × proibição pela IA + reativar | `pausado` → `ativo` | reproduzida | 400; segue `removido` |
| B6 pausa × ocultação por denúncia | `pausado` (revisão manual mantida) | reproduzida (sai da fila do admin) | 400; `em_moderacao` + revisão manual; na fila do admin |
| B7 pausa × expiração | `pausado` | diferença esperada (sem dano: a reativação recalcula a expiração) | 400; `expirado` |
| B8 duas pausas na fila do lock | 200/200, **duas** escritas (`ativo→pausado`, `pausado→pausado`) | escrita redundante (comportamental) | 200/200, uma escrita, campos de moderação iguais |
| B9 pausa repetida | 2ª 400 | diferença esperada (RN-ADS-005, só pausa) | 2ª 200, nenhuma escrita, campos de moderação iguais |
| C1 pausar, reativar, propriedade | passa | controle | passa |

Nenhuma falha de sincronização no baseline nem depois.

### Comandos e resultados (29/10/2026)

| Comando | Resultado |
|---|---|
| `./scripts/e2e-isolated.sh test/pause-race.e2e-spec.ts --verbose` (baseline) | 9 falham, 1 passa (2 execuções) |
| idem, com a correção | 10/10 (1 execução; sem intermitência ou dúvida que pedisse repetição) |
| `pnpm --filter api test -- ads.service` | 14/14 (9 anteriores + 5 de pausa) |
| `./scripts/e2e-isolated.sh` com `moderation-race`, `moderation-runs`, `report-moderation-race`, `ads`, `admin` | 78/79: só a falha preexistente `ads` raio |
| `pnpm --filter api test:e2e:isolated` | 144 testes: 3 falham, as mesmas preexistentes (`ads` raio, `buildings` ×2) |
| `pnpm check` | verde: 4 avisos preexistentes do Biome; shared 18, web 25, api 76 |
| `git diff --check` | sem erros |

Preservação: diff rastreado idêntico ao anterior exceto `ads.service.ts`; não rastreados idênticos exceto `ads.service.spec.ts` e `support/sync.ts` (acréscimos desta fatia); nenhum container de e2e restante.

### Critérios e limitações

- Comprovado: a pausa não grava sobre exclusão, remoção, edição em moderação, ocultação ou expiração posteriores à leitura (B1–B7); nenhuma exclusão/remoção revertida nem caminho de pausa → reativação publica conteúdo removido ou não aprovado (B1, B2, B4, B5); revisão humana segue na fila do admin (B6); pausa idempotente em sequência e sob concorrência, sem escrita redundante e com campos de moderação preservados (B8, B9).
- RN-ADS-005 não está concluída: exclusão e renovação não foram verificadas quanto à idempotência nesta fatia.
- Não tratados (P00-B2 restante): `bump`, `feature`/`unfeature`; limite de anúncios ativos e disputa de uploads em fatias próprias. Pausar `em_moderacao` continua recusado (comportamento atual).
- Não executado no CI.

## P00-B3 — Limite de anúncios ativos sob concorrência

Referências: RN-065 do histórico (regra hoje implementada: 5 por usuário, 10 com vínculo verificado, `ativo` + `em_moderacao`); princípio de RN-PLAN-005 e aceite §6.1 ("criação simultânea além da cota resulta em apenas uma operação aceita"). **As cotas definitivas (RN-PLAN-003/004/009/011: por tipo, condomínio e plano) não estão implementadas**; esta fatia só torna atômica a regra atual. Decisão técnica em [DECISIONS.md](DECISIONS.md) (D-004). Sem migration, sem regra comercial nova.

### Diagnóstico

- `assertActiveLimit` contava pelo repositório injetado, sem lock e fora da transação. `create` contava antes da transação; `resume`/`renew` contavam dentro da transação, mas por outra conexão e sob lock só da linha do próprio anúncio, que não serializa anúncios distintos.
- Caminhos que aumentam a ocupação: `create`, `resume` (`pausado`→`ativo`/`em_moderacao`), `renew` (`expirado`→`ativo`/`em_moderacao`) e a aprovação pelo admin (sem checagem de cota; C3). Moderação automática, denúncia e edição não aumentam; pausa, exclusão, expiração, banimento e rejeição só liberam.

### Alteração implementada

- `apps/api/src/ads/ads.service.ts`:
  - `lockActiveQuota`: `pg_advisory_xact_lock(hashtextextended('ads.active_quota:' || user_id, 0))`, primeiro lock da transação.
  - `assertActiveLimitLocked`: contagem pela conexão da transação, num statement posterior ao lock; 403 com a mensagem atual.
  - `create`: lock de cota → contagem → INSERT. `resume`/`renew`: lock de cota → `lockOwned` → revalidação do estado → contagem (reativação de `pausado`; renovação só de `expirado`) → transição. Renovar anúncio `ativo` continua sem checagem de cota.
  - O limite (`maxActiveAds`: vínculo verificado + settings) é lido **antes** da transação; dentro dela nenhuma outra conexão é pedida enquanto o lock está seguro. A pré-checagem existente da criação (`assertActiveLimit`) foi mantida como estava; `resume`/`renew` não ganharam pré-checagem nova.
- Testes: `test/active-limit-race.e2e-spec.ts` (novo, 12); `src/ads/ads.service.spec.ts` (+4 unitários: ordem cota → linha → contagem → escrita, 403 sem escrita, renovação de ativo sem contagem); `test/support/sync.ts` (`holdUserLock`; `waitBlockedBy` passa a limpar o snapshot de estatísticas); `test/README.md`.

### Sincronização (difere entre baseline e correção; as asserções são as mesmas)

- Baseline: barreira depois de cada contagem (`Repository<Ad>.countBy`). Na criação é a pré-checagem; na reativação/renovação, a contagem dentro da transação, depois do lock da linha do próprio anúncio — anúncios distintos, então a 1ª pausada não impede a 2ª de chegar à sua barreira.
- Correção: não há contagem fora do lock a pausar em `resume`/`renew`, e pausar a 1ª depois do lock de cota impediria a 2ª de alcançar qualquer barreira. A 1ª operação segura a cota e fica esperando uma linha travada pelo teste (a do próprio anúncio; na criação, a do usuário, que o INSERT referencia pela FK); a 2ª entra na fila da cota; `pg_blocking_pids` transitivo prova a fila. Ganha a 1ª por construção, sem supor ordem FIFO.
- O modo é escolhido pela presença de `lockActiveQuota` no serviço e registrado no log da execução.
- Defeito de sincronização encontrado e corrigido no helper: o observador de `waitBlockedBy` roda dentro de uma transação e o PostgreSQL congela `pg_stat_activity` no primeiro acesso da transação; uma conexão aberta depois (a 2ª criação do Q1) ficava invisível. `waitBlockedBy` agora chama `pg_stat_clear_snapshot()` a cada consulta.

### Antes × depois (PostgreSQL descartável, limite configurado em 2)

Baseline = árvore com preparação, P00-A, P00-B1, F8 e P00-B2.1, sem a correção. Executado 3 vezes: (1) com limpeza de análises pendentes falha no `afterEach` do próprio spec (Q1 e Q10 com "tempo esgotado nas moderações pendentes" e Q9 com ocupação 1 sem causa isolada; não reapareceu depois do ajuste da limpeza); (2) após o ajuste; (3) após a correção do `waitBlockedBy`, com o `ads.service.ts` pré-B3 reconstruído do snapshot e conferido idêntico (restaurado em seguida). (2) e (3) iguais:

| Teste | Baseline | Classificação | Depois |
|---|---|---|---|
| Q1 criação × criação | ocupação 3 (limite 2), as duas aceitas | falha comportamental reproduzida | ocupação 2; 201 / 403 |
| Q2 reativação × criação | 3 | reproduzida | 2; 200 / 403 |
| Q3 renovação × criação | 3 | reproduzida | 2; 200 / 403 |
| Q4 reativação × reativação (anúncios distintos) | 3 | reproduzida | 2; 200 / 403 |
| Q5 reativação × renovação | 3 | reproduzida | 2; 200 / 403 |
| Q6 renovação × renovação | 3 | reproduzida | 2; 200 / 403 |
| Q7a criação que falha na transação | vaga não consumida; seguinte 201 | controle | igual (lock liberado no rollback) |
| Q7b reativação que falha na transação | idem; seguinte 200 | controle | igual |
| Q8 independência | B conclui com a reativação de A bloqueada (no baseline não existe cota a bloquear) | controle | cota de A bloqueada (reativação segurando, criação de A na fila); B conclui 201 antes da liberação; depois A: 200 / 403 |
| Q9 reativação dupla do mesmo anúncio | 200 / 400 | controle | igual |
| Q10 rejeição libera vaga | 403 → removido → 201 | controle | igual |
| Q11 renovar ativo com cota cheia | 200 | controle | igual |

Depois: 12/12 (1 execução; sem intermitência que pedisse repetição).

### Comandos e resultados (29/10/2026)

| Comando | Resultado |
|---|---|
| `./scripts/e2e-isolated.sh test/active-limit-race.e2e-spec.ts --verbose` | baseline: 6 falham (Q1–Q6), 6 passam; depois: 12/12 |
| `pnpm --filter api test -- ads.service` | 18/18 |
| `./scripts/e2e-isolated.sh` com `pause-race`, `report-moderation-race`, `moderation-race`, `moderation-runs`, `ads`, `admin`, `billing` | 93/95: `ads` raio (preexistente) e `moderation-runs` "rastro completo" com 401 em `/api/me/profile` no cadastro, antes de qualquer anúncio (intermitente de autenticação já registrado); `moderation-runs` sozinho em seguida: 13/13 |
| `pnpm --filter api test:e2e:isolated` | 156 testes: 2 falham, ambas preexistentes (`ads` raio, `buildings` "bloqueia o app"); a 3ª preexistente de prédio passou nesta execução (dependente de tempo) |
| `pnpm check` | verde: 4 avisos preexistentes do Biome; shared 18, web 25, api 80 |
| `git diff --check` | sem erros |

Preservação: diff rastreado idêntico ao anterior exceto `ads.service.ts`; não rastreados idênticos exceto `ads.service.spec.ts` e `support/sync.ts` (acréscimos/ajuste desta fatia); nenhum container de e2e restante.

### Locks e deadlocks (escopo da conclusão)

- Locks do protocolo: lock consultivo de cota (explícito); linha de `ads` (`lockOwned` / UPDATE da transição, com o trigger de D-001 rodando no mesmo UPDATE); no INSERT da criação, `KEY SHARE` implícito em `users`, `buildings` e `categories` (FKs) e, em `ad_images`, nas linhas de `uploads`.
- O lock de cota só é pedido como primeiro lock, por transações que ainda não seguram nada, e nenhum outro fluxo o pede. Portanto nenhum ciclo de espera passa por ele: quem o segura pode esperar linhas de `ads`/`users`/`uploads`, mas quem segura essas linhas nunca espera o lock de cota.
- Não se afirma ausência global de deadlocks. Risco preexistente, fora do protocolo: a criação (`users` KEY SHARE → `uploads` KEY SHARE) contra a exclusão de conta (DELETE `uploads` → UPDATE `users`) pode formar ciclo; o PostgreSQL aborta uma das transações. Não reproduzido, não tratado.
- Avaliação posterior (P00-B4.1): a criação passou a travar os uploads pedidos antes de inserir o anúncio, mudando a sequência acima. Ver "Locks (escopo da conclusão)" na P00-B4.1.

### Conflitos comerciais (para decisão do proprietário; nada decidido)

- **C1:** modelo implementado (por usuário, 5/10) ≠ definitivo (por tipo, condomínio e plano, com vagas de condomínio). Migração é fatia comercial própria.
- **C2:** limite de 10 depende de `building_memberships.verified_at` ("morador verificado"), em tensão com RN-PLAN-014.
- **C3:** aprovação pelo admin de `pausado`/`expirado`/`removido` vai para `ativo` sem checar cota.
- **C4:** redução do limite (perda de verificação, mudança de setting) não pausa excedentes; o definitivo prevê pausar (RN-DWN).

### Garantia e limitações

- Garantia: duas operações quaisquer entre `create`, `resume` e `renew` do mesmo titular não ultrapassam o limite lido antes da transação (Q1–Q6); falha transacional não consome vaga nem prende o lock (Q7); titulares diferentes não se bloqueiam (Q8).
- Fora da garantia: aprovação administrativa (C3); alteração concorrente do limite (setting ou verificação lidos antes da transação); SQL manual; corrida da regra de duplicidade RN-066 (checagem de similaridade fora do lock).
- Não executado no CI.

## P00-B4.1 — Associação de uploads sob concorrência

Referências: sem código RN específico para reutilização de fotos; RN-VAR-006/007 e §6.8 consultados (imagens), histórico: até 6 fotos por anúncio. Decisão técnica em [DECISIONS.md](DECISIONS.md) (D-005). Sem migration, sem regra nova.

### Diagnóstico

- O banco já impede dupla associação: `ad_images` tem `UNIQUE (upload_id)` (migration `1760500000000-ads.ts`). Corridas não compartilhavam foto entre anúncios; terminavam em 500.
- `create` validava (`claim`) fora da transação, sem lock; `update` lia os uploads na transação, sem lock; ambos marcavam `attached_at` (`markAttached`) depois do commit, em outra conexão.
- `attached_at` é marca de uso histórico (anúncio e chat gravam; nada limpa). Foto removida numa edição continua marcada e não volta — comportamento atual mantido (lacuna L1).
- Consumidores: anúncio (criação/edição), chat (`claim` + `markAttached` sem lock), rascunho IA (só valida), exclusão de conta (`DELETE uploads` na transação; storage depois).

### Alteração implementada

- `apps/api/src/uploads/uploads.service.ts`: `lockClaimable` (`SELECT … FOR UPDATE` dos uploads pedidos do dono, `ORDER BY id`, depois `pickClaimable` inalterado) e `markAttachedWith` (marcação na conexão da transação). `claim`/`markAttached` seguem para chat e rascunho.
- `apps/api/src/ads/ads.service.ts`:
  - `create`: `claim` fora da transação mantido como falha rápida; na transação, lock de cota (P00-B3) → `lockClaimable` → INSERT `ads` → INSERT `ad_images` → `markAttachedWith`. Sem marcação depois do commit.
  - `update`: `lockOwned` → imagens atuais sob o lock → `lockClaimable` (aceita as do próprio anúncio) → escrita → `markAttachedWith`. Sem marcação depois do commit.
- Testes: `test/upload-claim-race.e2e-spec.ts` (novo, 10); `src/uploads/uploads.service.spec.ts` (novo, 3); `src/ads/ads.service.spec.ts` (+2: ordem linha → uploads → escrita → marca; recusa sem escrita); `test/support/sync.ts` (`holdUploadLocks`); `test/support/ads.ts` (tipo de `imageIds`); `test/README.md`.

### Sincronização

Igual antes e depois: o teste trava as linhas dos uploads numa segunda conexão. No código antigo as operações já validaram e param no INSERT de `ad_images` (FK em `KEY SHARE`); no corrigido param em `lockClaimable`. `waitBlockedBy` (transitivo) prova a fila; o vencedor é deduzido do banco.

### Antes × depois (PostgreSQL descartável)

Baseline = árvore aprovada (preparação, P00-A, B1, F8, B2.1, B3), sem a correção. Duas execuções: a 1ª com um erro de tipo no spec (`imageIds`, sem efeito em runtime; ts-jest não bloqueia); a 2ª com o spec final e os dois serviços pré-B4 reconstruídos do snapshot e conferidos idênticos (restaurados em seguida). Resultados iguais:

| Teste | Baseline | Classificação | Depois |
|---|---|---|---|
| U1 criação × criação, mesmo upload | 201 / **500** (23505 `ad_images_upload_id_key`); upload num anúncio só | falha comportamental reproduzida (erro interno em vez de recusa; sem dupla associação) | 201 / 400 com a mensagem de foto indisponível |
| U2 criação × edição | 201 / 500 (23505) | reproduzida | 201 / 400 |
| U3 edição × edição (anúncios distintos) | 200 / 500 (23505) | reproduzida | 200 / 400 |
| U4 sobreposição em ordem inversa | 200 / 500 por 23505; **nenhum deadlock** observado | reproduzida (500); hipótese de deadlock **não confirmada** | 200 / 400 |
| U5 reordenar/manter fotos do próprio anúncio | passa | controle | passa |
| U6 upload de outro usuário | 400 sem efeito | controle | igual |
| U7a falha ao inserir a 2ª foto (criação e edição) | rollback total, nada marcado | controle | igual |
| U7b falha ao marcar `attached_at` | **anúncio criado e associado com `attached_at` nulo** (resposta 500) | reproduzida (falha parcial depois do commit) | 500 com rollback total: sem anúncio, sem associação |
| U8 uploads distintos com outro upload travado | concluem | controle | concluem |
| U9 foto removida (L1) | continua marcada; recolocar → 400 | controle documental | igual |

Depois: 10/10 (1 execução). Nenhuma falha de sincronização.

### Complemento após revisão (29/10/2026)

- **Upload associado sem `attached_at`.** `lockClaimable` aceitava upload sem marca mesmo já associado a outro anúncio; a `UNIQUE (upload_id)` impedia a dupla associação, mas a resposta era 500. Correção: com os uploads já travados, `lockClaimable` confere a associação atual em `ad_images` para os uploads que não são do próprio anúncio (`allowAttachedTo`) e recusa com 400 e a mensagem de foto indisponível. Verificação transacional; nenhum 23505 é convertido. Fotos do próprio anúncio continuam aceitas (não entram na consulta). Sem backfill nem limpeza de marcas.
- **Ambiente de teste (suporte):** `createTestApp` passa a escutar em `127.0.0.1` (ver investigação do F8 abaixo).
- Testes novos (inconsistência preparada só no banco descartável com `UPDATE uploads SET attached_at = NULL`):

| Teste | Antes do complemento (B4.1 anterior) | Depois |
|---|---|---|
| U10a criação com upload associado a outro anúncio, sem marca | 500 (23505); sem anúncio novo, associação original preservada | 400 com a mensagem; sem efeito |
| U10b edição de outro anúncio com esse upload | 1ª execução: **401 com corpo sem `message`** (não veio da API; ver F8); repetida com o app em `127.0.0.1`: 500 (23505), associação original preservada | 400; sem efeito |
| U10c o próprio anúncio mantém e reordena a foto sem marca | passa | passa |
| U7c falha ao marcar na edição | passa (a transação da B4.1 já cobria) | passa |

- **U7c (edição):** anúncio `ativo` com [X, K]; trigger de teste falha no `UPDATE OF attached_at` de um upload novo Y; a edição muda título/descrição e fotos para [K, X, Y]. Resultado: 500 e, comparados antes/depois, iguais: título, descrição, `status`, `status_reason`, `manual_review`, `needs_moderation`, `content_version`, `moderation_run_id`, imagens e posições ([X, K]), `attached_at` de X, K e Y (Y segue nulo e sem associação). Nenhuma moderação nova no rastreador e nenhuma chamada nova à IA.
- **Escopo da atomicidade:** validação, associação (`ad_images`) e marcação (`attached_at`) ficam na mesma transação. Etapas depois do commit — `drafts.linkToAd`, disparo da moderação e leitura da resposta — não fazem parte da garantia.

### Investigação do travamento do F8 (1ª suíte completa da P00-B4.1)

- Mecanismo comprovado (script isolado, sem banco): o supertest 7.3.0 faz `listen(0)` no curinga `::` e monta a URL com `127.0.0.1`. No macOS, um processo pode estar escutando a mesma porta só em `127.0.0.1`; nosso `listen` em `::` não falha e o tráfego para `127.0.0.1:porta` vai para o outro processo. O script reproduziu um 401 com corpo `{"type":"error","error":{"type":"authentication_error"}}`, o mesmo formato do 401 registrado no `feed` (P00-B1-F8).
- Na máquina havia processos escutando em portas da faixa efêmera só em `127.0.0.1` (ex.: `Code Helper` em 57832 e 65320).
- O supertest mantém o servidor compartilhado enquanto houver requisição pendente: se uma requisição cai num processo que não responde, o servidor continua naquela porta e todas as requisições seguintes do spec vão para o mesmo processo. Isso é compatível com o que se viu: o F2 e todos os testes seguintes estouraram 30 s, e o Jest não terminou (servidor e soquete presos).
- Correção restrita ao suporte de testes: `createTestApp` escuta em `127.0.0.1` porta 0 logo após `init()`; o supertest usa esse endereço e o sistema não entrega a porta de outro processo nesse endereço.
- Também explica, por mecanismo, os 401 intermitentes sem `message` (U10b acima, `feed` na F8, cadastro na P00-B1/B3). Que cada um desses episódios tenha sido exatamente essa colisão é inferência: o travamento do F8 não voltou a ocorrer e não foi capturado. Não houve aumento de timeout nem `forceExit`.
- Ponto revisado e não alterado: o `afterEach` de alguns specs de corrida (`report-moderation-race`, `pause-race`, `moderation-race`) faz `drain` antes de `settleAll`; uma análise disparada depois do `drain` fica na barreira e faz o `settleAll` estourar 10 s (visto na P00-B3, corrigido lá com `autoRespond`). Não foi a causa observada no F8 (o F2 parou no próprio teste, não no `afterEach`); registrado como risco de limpeza.

### Comandos e resultados (29/10/2026)

| Comando | Resultado |
|---|---|
| `./scripts/e2e-isolated.sh test/upload-claim-race.e2e-spec.ts --verbose -t "U10\|U7c"` antes do complemento | 1ª: U10a 500, U10b 401 (corpo alheio), U10c e U7c passam; 2ª (app em 127.0.0.1, `uploads.service.ts` anterior reconstruído do snapshot e restaurado): U10a 500, U10b 500, U10c e U7c passam |
| `./scripts/e2e-isolated.sh test/upload-claim-race.e2e-spec.ts --verbose` depois | 14/14 |
| `pnpm --filter api test -- uploads ads.service` | 27/27 |
| `./scripts/e2e-isolated.sh` com `report-moderation-race`, `active-limit-race`, `pause-race`, `moderation-race`, `moderation-runs`, `ads`, `chat`, `admin` | 106/107: só `ads` raio (preexistente) |
| `pnpm --filter api test:e2e:isolated` (após as correções finais) | 170 testes: 2 falham, ambas preexistentes (`ads` raio, `buildings` "bloqueia o app"); a 3ª preexistente de prédio passou nesta execução; F8 17/17; Jest terminou normalmente |
| `pnpm check` | verde: 4 avisos preexistentes do Biome; shared 18, web 25, api 86 |
| `git diff --check` | sem erros |

Execuções da B4.1 antes do complemento:

| Comando | Resultado |
|---|---|
| `./scripts/e2e-isolated.sh test/upload-claim-race.e2e-spec.ts --verbose` | baseline: 5 falham (U1–U4, U7b), 5 passam (2 execuções); depois: 10/10 |
| `pnpm --filter api test -- uploads ads.service` | 26/26 |
| `./scripts/e2e-isolated.sh` com `active-limit-race`, `pause-race`, `report-moderation-race`, `moderation-race`, `moderation-runs`, `ads`, `chat`, `admin` | 106/107: só `ads` raio (preexistente) |
| `pnpm --filter api test:e2e:isolated` | 1ª execução: 166 testes, 18 falham — as 3 preexistentes (`ads` raio, `buildings` ×2) e 15 do `report-moderation-race` (F8), todas por timeout de 30 s do Jest a partir do F2 (a edição do F2 não respondeu; os seguintes também estouraram; causa não isolada). Em seguida, sem mudança de código: `report-moderation-race` sozinho 17/17; em par com `upload-claim-race` 27/27; 2ª suíte completa: 166 testes, só as 3 preexistentes falham. Registrado como intermitente não reproduzido |
| `pnpm check` | verde: 4 avisos preexistentes do Biome; shared 18, web 25, api 85 |
| `git diff --check` | sem erros |

### Locks (escopo da conclusão)

- Criação: cota (P00-B3) → `uploads` (FOR UPDATE, ordem de id) → linha nova de `ads` (FKs `users`/`buildings` em KEY SHARE) → `ad_images`. Edição: linha de `ads` → `uploads` → `ad_images`. Ninguém pede a cota segurando `uploads`; edição e exclusão de conta seguem `ads` antes de `uploads`.
- Conjuntos sobrepostos travam na mesma ordem (id), então duas operações desta fatia não fecham ciclo entre si.
- Reavaliação da criação × exclusão de conta (análise do código; não reproduzida em teste). Exclusão: `UPDATE ads` das linhas existentes do usuário → `building_memberships`, `conversations`, DELETEs de tabelas filhas (não travam `users`) → `UPDATE messages` → `DELETE uploads` → `UPDATE users` (só aqui trava a linha do usuário). Criação com fotos: cota → `uploads` pedidos (FOR UPDATE) → INSERT `ads` (`users` em KEY SHARE) → `ad_images`. As duas pegam `uploads` antes de `users`: se a criação trava primeiro, o `DELETE uploads` da exclusão espera sem ter travado `users`, e a criação conclui; se a exclusão apaga primeiro, a criação espera, encontra os uploads apagados e recusa (400). A criação não espera linhas existentes de `ads`. Portanto o ciclo `users` × `uploads` descrito na P00-B3 não se forma mais com a sequência atual. Criação sem fotos não trava `uploads` e só pode esperar a exclusão (que não espera a criação). Fora disso não se afirma ausência global de deadlocks.
- Observação fora de escopo (não tratada): uma criação que commite depois do `UPDATE ads` da exclusão e antes do `DELETE uploads` deixa um anúncio novo do usuário excluído fora do `excluido` (as imagens caem em cascata). Comportamento preexistente da exclusão de conta.

### Lacunas de produto (registradas; nada decidido)

- **L1:** foto removida pode voltar ao mesmo ou a outro anúncio? Hoje não.
- **L2:** `purpose` não é checado (upload de avatar/chat pode ir para anúncio e vice-versa).
- **L3:** foto compartilhada entre anúncio e chat: o chat valida e marca sem lock; a marcação dentro da transação do anúncio reduz a janela, mas não a fecha do lado do chat.
- **L4:** RN-VAR-007 (a mesma imagem associada a várias variações) é uma avaliação futura de modelagem: pode ser atendida por associações das variações a uma mesma imagem do anúncio, sem exigir mudar `UNIQUE (upload_id)` de `ad_images`. Nada decidido; a constraint permanece.
- **L5:** retenção de uploads órfãos não implementada.

### Dados existentes (não verificados; sem correção)

Consultas só de leitura para ambiente autorizado: associados sem marca (`uploads` JOIN `ad_images` com `attached_at IS NULL`) e upload em anúncio e mensagem (`ad_images` JOIN `messages` pelo `upload_id`).

### Limitações

- Chat, rascunho IA e exclusão de conta sem mudança. Não executado no CI.
- Travamento do F8 observado uma vez (1ª suíte completa): o `report-moderation-race` estourou 30 s a partir do F2 e o Jest não terminou até ser encerrado manualmente (o script então removeu os containers). Não voltou a ocorrer. Mecanismo compatível comprovado e corrigido no suporte de testes (colisão de porta do supertest; ver "Investigação do travamento do F8"); a captura do episódio original não existe, então a causa desse episódio específico é inferida, não demonstrada.

## P00-B5.1 — Validação de prédios em segundo plano: sincronização dos testes

Referências: especificação §5.16 item 5 (testes assíncronos sem sincronização confiável); regras de prédio RN-BLD-007/RN-BLD-008 e aceite §6.2; histórico RN-026–RN-029, RN-059, RN-113. Escopo só de suporte e sincronização de testes: **sem mudança em `src/` e sem migration**.

### Diagnóstico das falhas

| Falha | Causa | Classificação |
|---|---|---|
| `ads` "limita o raio enquanto o prédio está em verificação" | `resident()` dispara a validação em segundo plano; com a IA falsa (score 0,9) o prédio fica `verificado` antes do 1º anúncio e o raio 1 passa | sincronização incorreta do teste; funcional correto |
| `buildings` "bloqueia o app até ter prédio" | a resposta é montada depois de disparar a validação; sem IA ela pode já ter gravado `pendente_revisao` | sincronização incorreta |
| `buildings` "sem IA vai para revisão manual" | o teste chamava `verify()` de novo; se a validação real já tinha terminado, a 2ª chamada devolvia `null` | sincronização incorreta (chamada artificial) |
| latentes: `buildings` "rejeita nome de teste" (mesma chamada manual), `admin` "revisa prédios pendentes" e outras fixtures por SQL depois de `resident()` | validação pendente podia sobrescrever a fixture ou concorrer com a chamada manual | sincronização incorreta (não reproduzidas) |

Baseline (specs atuais, sem modificação, PostgreSQL descartável, 1 execução): `buildings` + `ads` + `admin` → 29 testes, **3 falham**, exatamente as três acima — `ads` raio (201 em vez de 403), `buildings` "bloqueia o app" (`pendente_revisao` em vez de `pendente_validacao`), `buildings` "sem IA" (`verify()` manual devolveu `null`). As latentes não falharam nessa rodada.

### Alteração implementada (só testes)

- `test/support/background.ts` (novo): `trackBackground` envolve `BuildingVerificationService.verify` e `NotificationsService.notify` (invólucro simples, não `jest.spyOn`, para um spec que espione `notify` empilhar sobre ele), registrando a promessa **real** de cada chamada — resultado e erro preservados. `nth(chave, i)` espera a i-ésima tarefa começar e terminar; `settleAll` espera também tarefas iniciadas durante a espera e **relata** (`AggregateError`) rejeições não observadas pelo teste.
- `test/support/app.ts`: o rastreio é instalado logo após `init()`, antes de qualquer requisição; `verificationSettled(app, prédio, i)` e `backgroundSettled(app)`; `app.close` espera validações e notificações, **fecha o app mesmo se a espera falhar** e relança o erro.
- `test/support/fakes.ts`: `createFakeGeo()` por instância (com `failing` para mapa fora do ar); `createFakeAi().buildingValidation` (`aprovar` | `indisponivel` → `AiUnavailableError`); resposta da IA falsa extraída para `fakeAiData` (sem novo aviso do Biome).
- `test/buildings.e2e-spec.ts`: geo por instância; `afterEach` libera barreiras, espera validações/notificações e só então restaura o geo; sem `verify()` manual; teste novo "mapa e IA fora do ar não aprovam".
- `test/ads.e2e-spec.ts`: geo por instância; `afterEach` igual (restaura a IA falsa depois); teste do raio refeito sem `UPDATE buildings`.
- `test/admin.e2e-spec.ts`: `afterEach` espera validações/notificações; fixtures por SQL só depois da validação real; o teste da fila usa a validação real e espera a notificação da decisão antes de ler `/api/notifications`.
- `test/README.md`.

### Como cada estado é controlado e observado

- **Pendente:** `armGate` no `reverse` do geo falso por instância (antes de qualquer transação), casando a latitude do prédio com tolerância de 1e-6 — a latitude volta do PostGIS com menos casas decimais (a comparação exata não casou na 1ª execução corrigida: barreira não alcançada nos 4 testes que a usam). `gate.reached()` prova que a validação disparada pelo fluxo começou; enquanto presa, nada é gravado.
- **Aprovada:** IA falsa padrão → `verificado` (`decidedBy: ia`), observada por `verificationSettled`.
- **Revisão / indisponível:** IA real sem chave (`buildings`, `admin`) ou `buildingValidation = "indisponivel"` (`ads`) → `pendente_revisao` (`decidedBy: regras`); com `geo.failing` também (mapa e IA fora).
- **Recusada:** nome de teste → `rejeitado` (regra forçada), seguida do reenvio, cuja 2ª validação também é a real (`verificationSettled(…, 1)`).
- Asserções funcionais preservadas: onboarding, busca, privacidade, raio (pendente e em revisão → 403; verificado → 201; plano), notificação.

### Conclusão das tarefas pendentes

`afterEach` dos três specs: libera barreiras (`restore` abre e desfaz) → `backgroundSettled` (validações, depois notificações; inclui as que começam durante a espera; relata falhas não observadas) → em `finally`, restaura geo/IA. `app.close` repete a espera, fecha o app sempre e relança falhas.

### Resultados (29/10/2026)

| Comando | Resultado |
|---|---|
| `./scripts/e2e-isolated.sh test/buildings.e2e-spec.ts test/ads.e2e-spec.ts test/admin.e2e-spec.ts --verbose` (baseline, specs atuais) | 29 testes: 3 falham (as três acima) |
| idem, depois (1ª) | 30 testes: 4 falham — barreira não alcançada (comparação exata da latitude); corrigido com tolerância |
| idem, depois (2ª) | 30/30 |
| `./scripts/e2e-isolated.sh` com `moderation-race`, `moderation-runs`, `report-moderation-race`, `pause-race`, `active-limit-race`, `upload-claim-race` | 93/93 |
| `pnpm --filter api test:e2e:isolated` | 171/171 (16 suítes), pela 1ª vez sem as falhas preexistentes de prédio; o script terminou normalmente e removeu os containers |
| `pnpm check` | verde: 4 avisos preexistentes do Biome; shared 18, web 25, api 86 |
| `git diff --check` | sem erros |

### Riscos funcionais (não corrigidos nesta fatia)

- **R1 — validação atrasada sobrescrevendo decisão humana.** Já contemplado pela especificação definitiva (§5.16 item 2: "validação atrasada de condomínio sobrescrevendo decisão humana" a corrigir antes da expansão funcional); não é regra comercial ausente. Evidência: `apply` grava o status por ID sem condição; `decideByAdmin` decide sobre qualquer estado; a resposta da IA pode chegar depois da decisão. Correção prevista para a P00-B5.2.
- **R2 — resultado da validação anterior aplicado a dados reenviados.** O §5.7 (versão/hash por solicitação, recarga, estado ainda elegível, respeito à decisão humana, aplicação atômica, descarte de resposta obsoleta) está escrito para "Moderação assíncrona" e não menciona condomínios; o §5.16 item 2 cobre só a decisão humana. Lacuna residual: a especificação não define identificação de versão/submissão para a validação de condomínio. Aplicar o §5.7 por analogia é escolha técnica a confirmar na P00-B5.2; hoje `buildings` não tem versão de conteúdo.
- **R3 — estados aceitos na decisão do admin.** `decideByAdmin` aceita `verificado`/`rejeitado` em qualquer estado (`pendente_validacao` com validação em curso, `verificado`, `rejeitado`, `arquivado`). A especificação não define as transições permitidas ao admin; exige análise própria (ex.: rejeitar prédio já verificado devolve moradores ao onboarding; decidir `arquivado`). Não é a mesma decisão de R1/R2.

## P00-B5.2 — Resultado atrasado da validação de prédio

Referências: especificação §5.16 item 2 (validação atrasada de condomínio sobrescrevendo decisão humana); §5.7 por analogia técnica (recarga, comparação atômica, descarte de resposta obsoleta — o §5.7 trata de moderação e não cita condomínios); histórico RN-026/027, RN-029, RN-033, RN-113; RN-BLD-007/008. Decisão técnica em [DECISIONS.md](DECISIONS.md) (D-006). Sem regra comercial nova.

### Diagnóstico (antes)

- Validação automática: leitura sem lock → mapa/IA fora de transação → `apply` gravava status **por ID, sem condição**, mais registro e (rejeição) onboarding/prédio principal; notificação depois.
- Admin: o mesmo `apply`, sem lock, em qualquer estado.
- Reenvio: sem transação; prédio gravado por ID; vínculo, prédio principal e ativação em operações separadas (o prédio principal decidido pelo objeto `User` da requisição).
- Arquivamento (RN-033): UPDATE condicional em `verificado`/`pendente_revisao`.

### Alteração implementada

- Migration `1761800000000-building-submissions.ts` (nova, idempotente, com `down`): `buildings.submission_id uuid NOT NULL DEFAULT gen_random_uuid()`; `building_verifications.submission_id uuid` (nulo nos registros anteriores); trigger `buildings_rotate_submission` (`BEFORE UPDATE`): nova submissão quando o status entra em `pendente_validacao` vindo de outro estado ou quando um dado analisado muda de fato (nome, tipo, CEP, logradouro, número, bairro, cidade, UF, localização por `ST_AsBinary`, unidades, foto de fachada; `IS DISTINCT FROM`, nulos e regravação do mesmo valor não contam).
- `building.entity.ts`: `submissionId` (só leitura pela aplicação) e `BuildingVerification.submissionId`.
- `building-verification.service.ts`:
  - automático: a leitura inicial captura a submissão; mapa, regras, settings e IA seguem fora de transação; a aplicação é uma transação curta cujo **primeiro passo** é `UPDATE buildings … WHERE id = $1 AND status = 'pendente_validacao' AND submission_id = $capturada`. Uma linha → registro (com a submissão) + efeitos da rejeição na mesma transação, notificação depois do commit. Zero linhas → descarte: nada gravado, log `predio.validacao_descartada` (motivo `submissao_substituida` ou `estado_<atual>`), retorno `null`, sem notificação. Retorno continua `VerificationOutcome | null`.
  - admin: transação com `SELECT … FOR NO KEY UPDATE` do prédio (não bloqueia a FK de quem cria vínculo), status sem condição de estado (permissões atuais; R3 fora), registro com a submissão atual e efeitos; notificação depois.
- `buildings.service.ts` (`resubmit`): checagens de mensagem mantidas na leitura inicial; numa só transação, na conexão dela: `UPDATE` condicional do prédio (`id`, dono, `rejeitado`, `resubmissions` lido; zero linhas → 409 "O prédio mudou. Tente de novo."), incremento do contador, nova submissão pelo trigger, vínculo `ativo`, prédio principal só se vazio **no banco** e ativação com as condições atuais. A validação só é disparada depois do commit.
- `users.service.ts`: `activate(userId, manager?)` e `setPrimaryBuildingIfEmpty(userId, buildingId, manager)` para operar na transação do reenvio.
- Testes: `test/building-verification-race.e2e-spec.ts` (novo, 14, só schema anterior); `test/building-submissions.e2e-spec.ts` (novo, 5, schema novo); `src/buildings/verification/building-verification.service.spec.ts` (novo, 2); `test/README.md`.

### Locks e transações

- Ordem efetiva: linha de `buildings` → `building_verifications` / `building_memberships` → `users`.
  - automático: `UPDATE buildings` condicional (lock da linha) → INSERT registro → UPDATEs de `users` (rejeição);
  - admin: `SELECT … FOR NO KEY UPDATE` → UPDATE status → INSERT registro → UPDATEs de `users` (rejeição);
  - reenvio: `UPDATE buildings` condicional → UPDATE `building_memberships` → UPDATEs de `users`;
  - arquivamento: um UPDATE da linha.
- Fora de transação: leitura inicial da validação, mapa, IA, settings, notificações e o disparo da validação do reenvio. Nenhuma outra conexão é pedida dentro das transações acima.
- Conclusão limitada a esses caminhos; não se afirma ausência global de deadlocks.

### Garantias e limites

- Resultado automático só tem efeito se o prédio ainda estiver `pendente_validacao` na submissão capturada. Decisão do admin, reenvio (mesmo com dados iguais) e arquivamento descartam resultados anteriores.
- No máximo **uma aplicação automática** bem-sucedida por submissão. Decisões do admin posteriores continuam permitidas e geram outros registros para a mesma submissão (sem unicidade genérica).
- Não impede chamadas duplicadas à IA ou ao mapa numa reentrega: impede efeitos duplicados.
- Descarte sem efeito, sem registro de decisão e sem notificação.
- Convivência no deploy: execuções iniciadas pelo código antigo e instâncias antigas ainda em execução gravam sem a condição; a garantia completa vale só com todas as instâncias novas. O trigger rotaciona a submissão também para reenvios feitos por instâncias antigas, mas isso não faz um escritor antigo respeitar a condição.

### Testes: estratégia de baseline

- `building-verification-race`: só asserções executáveis no schema anterior (status, dados, registros, moradores, vínculo, notificações). Baseline = **árvore original intacta** (sem migration e sem a lógica nova), executado antes de qualquer mudança funcional.
- `building-submissions`: identidade e trigger; só existe com o schema novo; executado apenas depois.
- Sincronização: barreira no `reverse` do geo falso por instância (depois de a validação ler o prédio e capturar a submissão); `armGateAfter` na leitura do reenvio; `holdUserLock` para o reenvio segurar o lock do prédio esperando a linha do usuário (V9b); `waitBlockedBy` transitivo; `verificationSettled`/`backgroundSettled` (P00-B5.1); `afterEach` libera barreiras, conclui tarefas e restaura fakes; sem sleep.

| Teste | Baseline (árvore original) | Classificação | Depois |
|---|---|---|---|
| V1 admin aprova com validação capaz de rejeitar suspensa | prédio `rejeitado` pelo resultado atrasado | falha comportamental reproduzida | `verificado`; só registro do admin; dono ativo; validação → `null`; só a notificação "Prédio verificado" |
| V2 admin rejeita com validação capaz de aprovar suspensa | prédio `verificado` | reproduzida | `rejeitado` com motivo do admin; só registro do admin; notificação só da rejeição |
| V3a reenvio; antiga liberada antes da nova | registro extra `regras:rejeitado` da submissão antiga | reproduzida | antiga descartada; nova aplica `verificado`; dono ativo |
| V3b reenvio; antiga liberada depois da nova | prédio volta a `rejeitado` | reproduzida | igual a V3a |
| V4a dois reenvios concorrentes | 200 / 200; duas validações disparadas | reproduzida | 200 / 409; uma validação; contador 1 |
| V4b duas execuções da mesma submissão | as duas aplicaram (dois registros `ia:verificado`) | reproduzida | exatamente uma aplica, a outra `null`; ordem observada: a do fluxo aplicou, a reentrega foi descartada |
| V5 automática primeiro, admin depois | passa | controle | passa |
| V6a falha no registro (automático e admin) | passa (já transacional) | controle | passa |
| V6b falha depois do 1º efeito nos moradores (onboarding gravado, prédio principal falha) | passa | controle | passa: status, usuário e prédio principal intactos, sem notificação |
| V6c falha no reenvio (vínculo) | prédio já regravado (`pendente_validacao`, dados novos, contador 1) | reproduzida (efeito parcial) | 500; prédio, contador, vínculo, usuário intactos; nenhuma validação disparada |
| V7 aprovado, recusado, revisão | passa | controle | passa |
| V8 arquivamento × validação atrasada | `arquivado` desfeito para `rejeitado` | reproduzida | continua `arquivado`; validação → `null` |
| V9 admin decide depois da leitura do reenvio | reenvio regravou (contador 1) | reproduzida | reenvio 409; decisão do admin intacta |
| V9b reenvio com o lock, admin rejeitando na fila | 200 / 204, mas o usuário terminou `ativo` com prédio principal depois da rejeição (efeito tardio do reenvio) | reproduzida | 200 / 204; reenvio commita antes; rejeição prevalece: `onboarding_pendente`, sem prédio principal; validação do reenvio → `null` |

Baseline: 10 falhas comportamentais reproduzidas, 4 controles, nenhuma falha de schema/compilação/fixture. Depois: 14/14 (1 execução).

Contrato da migration (`building-submissions`, 5/5, depois): S1 decisões automática e do admin não trocam a submissão e os registros guardam a julgada; S2 reenvio com dados iguais gera nova submissão; S3 só mudança efetiva de dado analisado troca (sem troca: `last_activity_at`, motivo/nome sugerido, regravação do mesmo valor inclusive nulo e mesmo ponto, mudança de status sem entrar em `pendente_validacao`; com troca: nome, unidades para valor e para nulo, localização, volta a `pendente_validacao`); S4 reenvio que falha preserva submissão, contador, vínculo e usuário; S5 down/up no banco descartável: colunas e trigger somem no down, voltam no up, prédios existentes recebem submissões não nulas e distintas, registros antigos ficam com submissão nula.

### Comandos e resultados (29/10/2026)

| Comando | Resultado |
|---|---|
| `./scripts/e2e-isolated.sh test/building-verification-race.e2e-spec.ts --verbose` (árvore original) | 10 falham, 4 passam |
| idem, depois | 14/14 |
| `./scripts/e2e-isolated.sh test/building-submissions.e2e-spec.ts --verbose` | 5/5 |
| `pnpm --filter api test -- building-verification` | 2/2 |
| `./scripts/e2e-isolated.sh` com `buildings`, `admin`, `ads`, `building-verification-race`, `building-submissions` | 49/49 |
| `pnpm --filter api test:e2e:isolated` | 190/190 (18 suítes); o script terminou e removeu os containers |
| `pnpm check` | verde: 4 avisos preexistentes do Biome; shared 18, web 25, api 88 |
| `git diff --check` | sem erros |

### Limitações registradas (fora desta fatia)

- **R3** — estados que o admin pode decidir (inclusive `arquivado` e prédio já verificado): sem mudança.
- Entrada em prédio (`join`) concorrente com rejeição: lê o status sem lock e pode vincular a prédio recém-rejeitado.
- `audit.log` da decisão do admin continua fora da transação da decisão.
- Log de descarte em nível `warn`: não aparece nos e2e (o app de teste registra só erros); o descarte é provado pelo banco e pelo retorno `null`.

## P00-C1 — Build, caminho e2e do CI e registro da Fase 0

Fase 0 do roadmap ("formatação, lint, tipos, testes e build passarem; classificar alertas de dependência; documentar variáveis e comandos reais"); especificação §5.16 itens 5–7; prompt P00. Diagnóstico P00-C (30/10/2026) feito antes, em modo de consulta.

### Achados

- **Build:** nunca executado nesta branch; `pnpm build` verde (abaixo).
- **Caminho e2e do CI — defeito reproduzido:** o CI roda `pnpm turbo test:e2e`; o turbo 2.11.5 em modo estrito (padrão; `turbo.json` sem `env`/`passThroughEnv`) não repassava `DATABASE_URL`. Pelo mesmo comando, com as variáveis do job e portas fechadas, o app recusou subir: `DATABASE_URL: expected string, received undefined` (`CI` chegou à tarefa; `DATABASE_URL` não). Execução efetiva no GitHub Actions não verificada (sem acesso aos logs).
- **Possível uso indevido do Supabase pelos testes (achado de segurança, por leitura do código):** o `ConfigModule` completava o ambiente com `apps/api/.env`, que neste checkout aponta `DATABASE_URL` para um Supabase hospedado e define `SUPABASE_URL`/`SUPABASE_SECRET_KEY` e chaves VAPID. O `setup-env.ts` não zerava Supabase nem VAPID, e o `ChatRealtimeService.notify` faz `POST` em `<SUPABASE_URL>/realtime/v1/api/broadcast` a cada mensagem de chat (o e2e `chat` envia mensagens). Logo, as execuções locais dos e2e anteriores a esta fatia (inclusive `e2e-isolated.sh`) podem ter enviado requisições de broadcast ao projeto configurado, autenticadas com a chave do `.env`. **Não há evidência** de que as requisições tenham saído ou sido aceitas, nem de vazamento da chave: o Supabase e seus logs não foram acessados. O banco não foi usado no `e2e-isolated.sh` (`DATABASE_URL` vinha do script). Também por leitura do código, `pnpm turbo test:e2e` local com `CI` definido usaria o banco do `.env`. O CI não tem `.env`.
- **Pulo silencioso:** sem `GITHUB_ACTIONS`/`E2E_ISOLATED`, os 8 specs com `describeIsolated` viravam `describe.skip` e o job ficava verde.
- **Documentação:** `apps/api/.env.example` sem `RESEND_API_URL`, `NOMINATIM_URL`, `VIACEP_URL`; README da raiz sem `test:e2e:isolated`; lista de specs de corrida desatualizada em `apps/api/test/README.md`.

### Alteração implementada

- `apps/api/src/app.module.ts`: `ignoreEnvFile` com `NODE_ENV=test` — o ambiente dos testes vem só do processo e do `setup-env`, como no CI.
- `apps/api/test/support/setup-env.ts`: zera `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (além de IA e Stripe, já zerados).
- `turbo.json`: `test:e2e` com `passThroughEnv` (`CI`, `GITHUB_ACTIONS`, `NODE_ENV`, `DATABASE_URL`, `SMTP_URL`, `MAILPIT_URL`, `BETTER_AUTH_SECRET`, `E2E_*`).
- `apps/api/test/support/isolation.ts` + `.github/workflows/ci.yml`: `E2E_REQUIRE_RACE=1` no job e2e; sem `E2E_ISOLATED`/`GITHUB_ACTIONS` o import lança erro em vez de pular.
- Documentação: `apps/api/.env.example` (as 3 chaves, comentadas com o default), `README.md`, `apps/api/test/README.md` (lista completa de specs de corrida; seção "Ambiente"), [D-007](DECISIONS.md).
- Sem mudança de dependências, lockfile, regra comercial ou migration.

### Execução local equivalente ao CI (não é execução no GitHub Actions)

Script de verificação fora do repositório (substituído no complemento por `pnpm test:e2e:ci`, versionado): PostGIS `16-3.4` e Mailpit `v1.27` descartáveis (`--rm`, `tmpfs`, `127.0.0.1`), com as mesmas credenciais e portas dos serviços do job (5432, 1025, 8025); `env -i` só com `PATH`, `HOME` e as variáveis do job (`CI`, `GITHUB_ACTIONS`, `NODE_ENV`, `DATABASE_URL`, `SMTP_URL`, `MAILPIT_URL`, `BETTER_AUTH_SECRET`, `E2E_REQUIRE_RACE`); comando `pnpm turbo test:e2e` na raiz. Diferenças restantes para o GitHub: sistema operacional (macOS × ubuntu-latest), `pnpm install --frozen-lockfile` não refeito, cache do turbo local.

### Comandos e resultados (30/10/2026)

| Comando | Resultado |
|---|---|
| `pnpm build` | verde: `api` e `web` executados, `@repo/shared` em cache; sem `pnpm dev` ativo |
| `pnpm turbo run test:e2e --filter api --dry=json` (antes) | `env: []`, `passThroughEnv: null`, modo estrito |
| sonda pelo turbo com `DATABASE_URL` em porta fechada (antes; `.env` já ignorado) | app não sobe: `DATABASE_URL` indefinida na tarefa |
| idem `--dry=json` (depois) | `passThroughEnv` com as 8 entradas |
| equivalente ao CI com `GITHUB_ACTIONS=` vazio, `pause-race` | falha explícita: "E2E_REQUIRE_RACE exige os specs de corrida…" (teste negativo) |
| equivalente ao CI, suíte completa (`pnpm turbo test:e2e`) | 18/18 suítes, 190/190, 0 pulados; specs de corrida: `moderation-race` 27, `moderation-runs` 13, `report-moderation-race` 17, `pause-race` 10, `active-limit-race` 12, `upload-claim-race` 14, `building-verification-race` 14, `building-submissions` 5 |
| `pnpm --filter api test:e2e:isolated` | 190/190 (18 suítes), 0 pulados |
| `pnpm check` | verde: 4 avisos preexistentes do Biome; shared 18, web 25, api 88 |
| `git diff --check` | sem erros |
| `pnpm audit --prod` | inalterado: 2 baixos, 12 moderados, 0 altos/críticos |

Containers removidos ao fim de cada execução; lockfile e `package.json` sem alteração nesta fatia.

### Triagem de dependências (consulta, 30/10/2026)

Triagem **não concluída**: nenhum aviso alto/crítico e nenhuma exposição comprovada, mas a aplicabilidade dos casos abaixo foi julgada só por inspeção e segue inconclusiva (ver "Pendências para encerrar P00"). Enquanto não for concluída, não se afirma que nenhuma correção é necessária. Presença ≠ exposição.

| Pacote | Avisos | Caminho | Aplicabilidade | Corrigida | Ação |
|---|---|---|---|---|---|
| nodemailer 10.0.12 | 4× addressparser, 1× ReDoS SMTP AUTH (moderados) | direta, `apps/api` | `to` é o e-mail do usuário (Better Auth); ReDoS exige servidor SMTP malicioso; só no transporte `smtp`. Não comprovada | 10.1.4 (18/10; carência de 14 dias até 01/11) | opcional, decisão própria |
| qs 6.16.0 | DoS em `stringify` com `arrayFormat: 'comma'` | express | Express usa `parse` | 6.16.1 | nenhuma agora |
| seroval 1.6.9 | 2× injeção ao serializar dado do atacante | `better-auth` → `solid-js` (peer opcional); devtools do web | sem uso em runtime da API | 1.6.11 | nenhuma |
| @vitest/mocker 5.0.2 | 2× (servidor de teste) | peer opcional / dev | ferramenta de teste | 5.0.3 | grupo `testing` do Dependabot |
| fast-uri 3.1.8 | 4× (2 baixos) | `@hookform/resolvers` → `ajv`; `@nestjs/cli` | web usa só `zodResolver` | 3.1.9 | nenhuma |
| deepmerge 4.3.1 | 1× baixo | jest | dev | sem patch | nenhuma |

Biome: 4 avisos `noExcessiveCognitiveComplexity` (`interactions.service.ts:157`, `admin-panel.tsx:330`, `ad-detail-view.tsx:45`, `referral-list.tsx:15`); só manutenibilidade, `biome ci` sem erro. Sem ação.

### Pendências para encerrar P00

- Resolvido: execução no GitHub Actions. CI aprovado no PR #22 (run 41653758749, `pull_request`, tentativa 1; jobs `quality` e `e2e` com `success`). Checkout de `refs/pull/22/merge` inferido, contagens no runner não verificadas: ver "Entrega P00 — validação no GitHub Actions".
- Resolvido: P00-B5.1, P00-B5.2 e P00-C1 (com o complemento) aprovadas em 03/11/2026, dentro dos escopos e da validação local registrada; a aprovação não comprova execução no GitHub Actions.
- **Pendente, sem decisão:** validação de endereço/CEP (§5.16 item 4) em P00 ou P03 (recomendação: P03; hoje só formato do CEP; sem reprodução de defeito).
- Proprietário: avaliar o possível uso indevido do Supabase pelos testes (requisições de broadcast possíveis, não comprovadas) e decidir se consulta os logs do projeto ou rotaciona `SUPABASE_SECRET_KEY`; chaves e `.env` não foram alterados nem lidos para os testes.
- Conclusão da triagem de dependências: aplicabilidade das vulnerabilidades triadas segue **inconclusiva** (julgada por inspeção, sem prova de exposição nem de não exposição): validador de e-mail do Better Auth para o `nodemailer`, devtools inertes no build de produção (`seroval`), `ajv` fora do bundle (`fast-uri`), `qs.stringify` sem uso.

Fora do encerramento (destino): migrations concorrentes entre instâncias (deploy/P11); `bump`/`feature` (removidos na Fase 1/P01); `join` × rejeição (P03); auditoria do admin fora da transação (P04/P11); push dentro de `notify` e moderação fora dos specs de corrida sem rastreamento nos testes (fase posterior); `nodemailer` (atualização decidida após concluir a triagem). C1–C4, L1–L5, R3 e D5 seguem para decisão.

## P00-C1 complemento — Proteção do banco, verificação externa do relatório e reprodutibilidade

Pedido do proprietário após a revisão da P00-C1 (03/11/2026). [D-008](DECISIONS.md).

### Achados (antes)

- Com `CI` definido, o `global-setup` dava `TRUNCATE` na `DATABASE_URL` do ambiente sem conferir o banco, e o `setup-env` a repassava ao app (migrations no boot). Com `GITHUB_ACTIONS`, os specs de corrida rodavam sobre qualquer `DATABASE_URL`. Token e cluster só eram conferidos com `E2E_ISOLATED`.
- `E2E_REQUIRE_RACE` só pegava pulo de suíte inteira; teste pulado/todo, spec ausente ou filtro de caminho passavam. O equivalente ao CI dependia de um script fora do repositório.

### Alteração implementada

- `apps/api/test/support/e2e-database.ts` (novo): decide o banco sem conexão. Com `E2E_ISOLATED`: exige `127.0.0.1`, `E2E_ISOLATION_TOKEN`, `E2E_PG_SYSTEM_ID`. Sem ele: sempre `localhost:5433/aquinopredio_test` (fluxo local documentado, restrito; `DATABASE_URL` ignorada); com `E2E_REQUIRE_RACE`, recusa. `CI`/`GITHUB_ACTIONS` não entram.
- `global-setup.ts`: confere token e `system_identifier` pela conexão antes do `TRUNCATE`; roda antes de qualquer spec, logo antes das migrations do boot. `support/app.ts` (`createTestApp`): repete a conferência pela conexão do app, logo após o `compile`. `isolation.ts`: specs de corrida só com o banco provisionado. `setup-env.ts`: `DATABASE_URL` sempre do alvo resolvido.
- `apps/api/scripts/e2e-isolated.sh`: modo `--turbo` (mesmo provisionador): exporta `E2E_REQUIRE_RACE=1`, roda `pnpm turbo test:e2e -- --json --outputFile=<relatório>` na raiz e depois `scripts/verify-e2e-report.mjs` (novo), num processo separado do turbo. Raiz: `pnpm test:e2e:ci`.
- Verificador: reprova spec protegido ausente (pelo caminho do arquivo em `apps/api/test`) ou repetido, sem testes, com qualquer teste não aprovado (pulado, todo, falha), suíte com falha, relatório ausente, ilegível, fora do formato ou anterior à execução; a lista dos 8 tem de coincidir com os arquivos que usam `describeIsolated`.
- `.github/workflows/ci.yml`: job e2e sem `services:` nem variáveis de banco; roda `pnpm test:e2e:ci`. `turbo.json`: `CI` e `GITHUB_ACTIONS` fora do `passThroughEnv`.
- `apps/api/src/config/config-module.options.ts` (novo): opções do `ConfigModule` extraídas do `app.module.ts` (mesmo comportamento), para o teste de regressão usar exatamente as do app.
- Testes de guarda sem banco (`apps/api/test/guards/*.spec.ts`, 28 testes; `roots` do Jest unitário em `apps/api/package.json`, sem mudança de dependência): `e2e-database` (pg substituído por registro de eventos; URLs fictícias `.invalid`), `verify-e2e-report` (verificador como processo separado, relatórios fictícios), `env-isolation` (`.env` fictício temporário via `process.cwd`, integrações fictícias no processo; Supabase sem `fetch`, VAPID sem `setVapidDetails`, e-mail por SMTP local sem `fetch` ao Resend).
- Documentação: `README.md`, `apps/api/test/README.md`, D-008 (D-007 marcada como parcialmente substituída).

### Comandos e resultados (03/11/2026)

| Comando | Resultado |
|---|---|
| `jest test/guards` | 3 suítes, 28/28 |
| mesma suíte com o suporte anterior a este complemento (troca temporária, restaurada) | 10 de 12 falham em `e2e-database.spec.ts` (CI/GITHUB_ACTIONS liberavam) |
| `env-isolation.spec.ts` com `ignoreEnvFile: false` e sem zerar Supabase/VAPID/Resend (troca temporária, restaurada) | 2 de 3 falham (`STORAGE_BUCKET` recebido do `.env` fictício; integração ativa) |
| `pnpm test:e2e:ci` com `CI=true GITHUB_ACTIONS=true` e Supabase/Resend fictícios no shell | exit 0: 18/18 suítes, 190/190; verificador: `moderation-race` 27, `moderation-runs` 13, `report-moderation-race` 17, `pause-race` 10, `active-limit-race` 12, `upload-claim-race` 14, `building-verification-race` 14, `building-submissions` 5 |
| `pnpm test:e2e:ci health` (spec omitido) | exit 1: Jest 2/2 aprovados, verificador reprova os 8 como "ausente do relatório" |
| `pnpm test:e2e:ci -t '^(?!.*B1: pausa atrasada…)'` (teste pulado) | exit 1: Jest 189 aprovados, 1 pulado; verificador: `pause-race` com status `focused` e o teste B1 `pending` |
| verificador com relatório truncado / inexistente / anterior | exit 1: "JSON ilegível" / "relatório ausente" / "anterior a esta execução" |
| `pnpm test:e2e` (jest direto, `NODE_OPTIONS` com sonda que registra e bloqueia qualquer conexão TCP), `DATABASE_URL` fictícia `banco-hospedado.example.invalid`: (a) `CI`+`GITHUB_ACTIONS`+`E2E_ISOLATED` sem token; (b) token/cluster fictícios; (c) `CI`+`GITHUB_ACTIONS`+`E2E_REQUIRE_RACE` | os três recusados no `globalSetup` antes de qualquer conexão (sonda sem nenhuma tentativa): "exige DATABASE_URL, E2E_ISOLATION_TOKEN…", "exige DATABASE_URL em 127.0.0.1", "E2E_REQUIRE_RACE exige o banco descartável…" |
| `pnpm check` | verde: 4 avisos preexistentes do Biome; shared 18, web 25, api 116 (88 + 28) |
| `pnpm build` | verde (`app.module.ts` mudou) |
| `git diff --check` | sem erros |

### Limitações

- GitHub Actions não executado nesta fatia (executado depois no PR #22; ver "Entrega P00 — validação no GitHub Actions"): Docker no `ubuntu-latest`, `pnpm install --frozen-lockfile` e o verificador no runner só se comprovam com push autorizado. Execução local em macOS.
- A sonda TCP não passa pelo turbo (modo estrito filtra `NODE_OPTIONS`); as recusas pelo turbo seguem o mesmo `globalSetup`.
- O fluxo local restrito (`localhost:5433/aquinopredio_test`) confia no `pnpm db:up`: não há token nesse banco. Specs de corrida nunca rodam nele.
- O `TRUNCATE` e as migrations confiam que `DATABASE_URL` não muda entre o `global-setup` e os specs (mesmo processo/ambiente); `createTestApp` reconfere depois do boot, já após as migrations.

## Entrega P00 — validação no GitHub Actions

PR #22 em rascunho (`chore/context-engineering` → `main`), consultado em 03/11/2026 pela API pública do GitHub. Registro documental; sem mudança funcional.

| Item | Resultado |
|---|---|
| Run | https://github.com/Wendell00/aquinopredio/actions/runs/41653758749, evento `pull_request`, tentativa 1 |
| `head_sha` | `db64124` |
| Referência testada | `refs/pull/22/merge` em `ac6fb47`, merge de `db64124` (branch) com `34b15fa` (`main`); árvore igual à do `git merge-tree` local. Checkout dessa referência **inferido** do comportamento padrão do `actions/checkout` em `pull_request`, não confirmado nos logs |
| Job `quality` (Lint, tipos, testes e build) | `success`: `pnpm install --frozen-lockfile`, Biome, typecheck, unitários, build e auditoria (`--audit-level high`) |
| Job `e2e` (Testes e2e da API) | `success`: `pnpm install --frozen-lockfile` e `pnpm test:e2e:ci` |
| 8 specs protegidos e verificador | Aprovação **inferida**: o passo `pnpm test:e2e:ci` só sai com 0 se o turbo passar e o `verify-e2e-report.mjs`, em processo separado, aprovar o relatório (spec ausente, sem testes, teste não aprovado ou relatório inválido saem com 1) |
| Contagens por spec e total no runner | **Não verificadas**: logs do job indisponíveis sem autenticação (HTTP 403) |

Anotação do run: aviso de migração do rótulo `ubuntu-latest` para Ubuntu 26 a partir de 19/10/2026 (sem efeito neste run).

## Concluído

- Branch `chore/context-engineering` e árvore de trabalho limpa confirmadas antes das edições.
- `CLAUDE.md`, `AGENTS.md` e índice anterior lidos integralmente.
- Pacote definitivo v1.4 incorporado em `docs/product/`, com adaptações operacionais registradas no [mapa de transição](DOCUMENTATION-TRANSITION.md).
- Sete documentos anteriores preservados em `docs/current-state/`, sem alteração de conteúdo.
- Índice documental e contexto permanente apontam para a fonte definitiva; `CLAUDE.md` preservado.
- Produto aprovado, histórico e evidência de execução separados.

## Em andamento

- P00-A, P00-B1, P00-B1-F8, P00-B2.1, P00-B3 e P00-B4.1 (com o complemento) implementadas, validadas e aprovadas pelo proprietário (29/10/2026) dentro dos respectivos escopos; sem commit. Conflitos C1–C4 (P00-B3) e lacunas L1–L5 (P00-B4.1) seguem pendentes de decisão.
- P00-B5.1 e P00-B5.2 (R1 e R2) implementadas, validadas e aprovadas pelo proprietário (03/11/2026) dentro dos respectivos escopos; sem commit. R3 segue separado.
- P00-C1 e o complemento (proteção do banco, verificação externa do relatório, `pnpm test:e2e:ci`) implementados, validados localmente e aprovados pelo proprietário (03/11/2026) dentro do escopo e da validação local registrada; sem commit. CI aprovado no GitHub Actions no PR #22 (run 41653758749), com as ressalvas registradas em "Entrega P00 — validação no GitHub Actions".
- Entrega autorizada pelo proprietário (03/11/2026): quatro commits na `chore/context-engineering` e PR em rascunho para `main`. Commits intermediários não validados isoladamente; a validação registrada é da árvore final. Sem merge.

## Checks conhecidos

- Integridade dos sete documentos históricos e inventário dos 13 arquivos definitivos: verificados na preparação.
- Links Markdown locais e adaptações da cópia: verificados na preparação.
- `git diff --check`: sem erros na preparação e após cada fatia até o complemento da P00-C1.
- `pnpm check`: verde após o complemento da P00-C1 (159 testes; 4 avisos preexistentes do Biome).
- `pnpm --filter api test:e2e:isolated`: executado após a P00-C1 em banco descartável; 190/190. Caminho do CI (`pnpm test:e2e:ci`, turbo + verificador) em execução local: 190/190, 8 specs protegidos verificados. `pnpm test:e2e` no banco `aquinopredio_test` local não executado.
- `pnpm build`: verde (P00-C1). Jornadas manuais: não executadas. GitHub Actions: CI aprovado no PR #22 (run 41653758749; referência testada inferida, contagens no runner não verificadas).

## Pendências e riscos

- Autenticação antes das migrations: reproduzida em PostgreSQL descartável e corrigida em P00-A.
- Callbacks obsoletos de moderação de anúncios: reproduzidos e corrigidos em P00-B1. Os 3 e2e que dependiam do tempo da validação de prédio foram sincronizados em P00-B5.1 (sem mudança funcional); R1/R2 da validação de prédio tratados em P00-B5.2; R3 pendente. Falha de Biome relatada no pacote recebido não reproduzida (4 avisos, sem falha). Alertas de dependência triados na P00-C1: 14 em produção (0 altos/críticos); triagem não concluída nos casos de aplicabilidade inconclusiva.
- P00-B2: `pause` corrigida em P00-B2.1. `bump` e `feature` ainda gravam por ID sobre leitura sem lock (riscos estáticos de baixa prioridade); `remove` sem defeito nos intercalamentos analisados; `expireAds` correto (UPDATE condicional). Limite de anúncios ativos serializado em P00-B3 (criação, reativação, renovação; aprovação do admin fora — C3). Associação de uploads em criação/edição atômica em P00-B4.1 (chat fora; L1–L5).
- F8: regra RN-MOD-008 e D1–D5 aprovadas; reproduzida e corrigida em P00-B1-F8. Pendente só o levantamento D5 em ambiente autorizado. Limitações de contagem (`resolveReport`, sanção, indicação) registradas na seção da fatia.
- Intermitentes observados uma vez cada na suíte e2e: verificação de e-mail com 401 em `signUpAndLogin` (P00-B1) e 401 `authentication_error` de provedor externo no `publish` do `feed` (P00-B1-F8); nenhum reproduzido na repetição, sem relação com moderação ou denúncia. Avaliação posterior (P00-B4.1): mecanismo comprovado — o supertest escutava em `::` e chamava `127.0.0.1`, e outro processo local na mesma porta só em `127.0.0.1` recebia a requisição; corrigido no suporte de testes (`createTestApp` escuta em `127.0.0.1`). Atribuição de cada episódio a esse mecanismo é inferência.
- Concorrência de migrations entre processos da API: risco separado, sem fatia aberta (destino: deploy/P11).
- E2e locais anteriores à P00-C1 liam `apps/api/.env` (Supabase hospedado): possível uso indevido do serviço pelos testes, sem evidência de requisição aceita nem de vazamento; corrigido na P00-C1, ver achado na seção. `CI`/`GITHUB_ACTIONS` liberando limpeza de banco arbitrário: corrigido no complemento.
- Capacidades descritas no README e documentos históricos não constituem evidência de implementação.
- Não há nova decisão comercial identificada nesta preparação. Lacunas e conflitos encontrados durante implementação devem ser registrados e submetidos ao proprietário.
- Nenhuma regra definitiva foi marcada como implementada; isso exige rastreabilidade RN → arquivos → migrations → testes → evidências de aceite.

## Registro das próximas entregas

Para cada fatia, registrar: prompt e fase do roadmap (distintos), códigos RN, critérios de aceite, arquivos, migrations, comandos e resultados, evidências manuais, pendências e próxima ação. Decisões técnicas relevantes vão para [DECISIONS.md](DECISIONS.md); decisões comerciais permanecem em `docs/product/`.

## Próxima ação

CI do PR #22 aprovado (run 41653758749). P00 continua aberta. Seguem abertas as decisões listadas em "Pendências para encerrar P00" (seção P00-C1): CEP/endereço (P00 ou P03), achado do Supabase e conclusão da triagem de dependências. Seguem pendentes C1–C4, L1–L5, R3 e o ambiente autorizado para o levantamento D5.

Merge não autorizado; push só da `chore/context-engineering`.
