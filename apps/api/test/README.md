# Testes e2e da API

## Banco descartável (recomendado)

```bash
pnpm test:e2e:ci                                                     # caminho do CI: turbo + verificação do relatório
pnpm --filter api test:e2e:isolated                                  # suíte inteira, jest direto
apps/api/scripts/e2e-isolated.sh test/moderation-race.e2e-spec.ts    # um spec
```

`scripts/e2e-isolated.sh` sobe `postgis/postgis:16-3.4` e `axllent/mailpit:v1.27` com `--rm`, dados em `tmpfs`, portas efêmeras em `127.0.0.1` e usuário/senha/banco aleatórios. Grava um token aleatório em `e2e_isolation` e captura o `system_identifier` do cluster. Os containers são removidos ao sair, inclusive em erro.

Com `--turbo` (`pnpm test:e2e:ci`, o que o job e2e do CI roda) o script exporta `E2E_REQUIRE_RACE=1`, roda `pnpm turbo test:e2e -- --json --outputFile=<relatório>` na raiz e, depois que o turbo termina, `scripts/verify-e2e-report.mjs` confere o relatório num processo separado: reprova se qualquer um dos 8 specs protegidos estiver ausente (pelo caminho do arquivo em `apps/api/test`), sem testes, com teste pulado/todo/com falha, se a suíte falhar, ou se o relatório faltar, for ilegível, fugir do formato do Jest ou for anterior à execução. A lista de specs protegidos tem de coincidir com os arquivos que usam `describeIsolated`. `E2E_REPORT_FILE` escolhe onde gravar o relatório.

## Qual banco os testes usam (`support/e2e-database.ts`)

- **Com `E2E_ISOLATED`** (só o script define): exige `DATABASE_URL` em `127.0.0.1`, `E2E_ISOLATION_TOKEN` e `E2E_PG_SYSTEM_ID` antes de qualquer conexão. O `global-setup` (roda antes de qualquer spec, logo antes das migrations do boot) confere token e cluster pela conexão e só então faz o `TRUNCATE`; `createTestApp` repete a conferência pela conexão do próprio app, e os specs de corrida também (`assertIsolated`).
- **Sem `E2E_ISOLATED`** — fluxo local restrito (`pnpm test:e2e`): sempre `localhost:5433/aquinopredio_test` do `pnpm db:up`; `DATABASE_URL` do ambiente é ignorada. Os specs de corrida (`describeIsolated`: `moderation-race`, `moderation-runs`, `report-moderation-race`, `pause-race`, `active-limit-race`, `upload-claim-race`, `building-verification-race`, `building-submissions`) aparecem como **pulados**; com `E2E_REQUIRE_RACE` a execução é recusada antes de conectar.
- `CI` e `GITHUB_ACTIONS` não influem em nada disso (nem chegam à tarefa do turbo).
- Testes de guarda sem banco (`test/guards/*.spec.ts`, rodam no `pnpm check`): recusas antes da conexão, verificador do relatório e isolamento de ambiente, com valores fictícios.

## Ambiente

- Com `NODE_ENV=test` o app ignora o `.env` (`src/config/config-module.options.ts`): o ambiente vem só do processo e do `support/setup-env.ts`. O `.env` local pode apontar para banco e serviços hospedados.
- `setup-env.ts` desliga as integrações externas (IA, Stripe, Resend, Supabase Realtime, push), mesmo que venham do processo.
- O turbo (modo estrito) só repassa à tarefa `test:e2e` as variáveis de `passThroughEnv` no `turbo.json`. Variável nova lida pelos e2e precisa entrar lá.

## Endereço do app de teste

`createTestApp` faz o app escutar em `127.0.0.1` (porta 0) logo após `init()`. Sem isso o supertest faz `listen(0)` no curinga `::` e chama `127.0.0.1:porta`; no macOS outro processo pode escutar a mesma porta só em `127.0.0.1` e receber a requisição (401 com corpo alheio, ou requisição pendurada que prende o servidor nessa porta e trava o resto do spec).

## Moderação em segundo plano

A moderação é disparada sem esperar (fire-and-forget). `createTestApp` rastreia cada execução; use `moderationSettled(app, adId)` para esperar a análise que o próprio fluxo disparou. Não chame `AdModerationService.moderate` de novo para "forçar" o resultado: com execução única por episódio (P00-B1), a segunda chamada é recusada.

## Validação de prédio e notificações em segundo plano

`createTestApp` também rastreia `BuildingVerificationService.verify` e `NotificationsService.notify` (`support/background.ts`), ambos disparados com `void` pelo código. Use `verificationSettled(app, prédio, i)` para esperar a i-ésima validação **disparada pelo fluxo** (não chame `verify` de novo) e `backgroundSettled(app)` no `afterEach` — ela espera inclusive tarefas iniciadas durante a espera e falha com rejeições não observadas. Para observar o prédio pendente, prenda o `reverse` de um `createFakeGeo()` por instância com `armGate` (latitude com tolerância: volta do PostGIS com menos casas). `geo.failing` simula o mapa fora do ar; `createFakeAi().buildingValidation = "indisponivel"` simula IA fora. Restaure esses ajustes só depois de `backgroundSettled`.

## Validação de prédio atrasada (P00-B5.2)

- `building-verification-race.e2e-spec.ts`: só asserções com o schema anterior à P00-B5.2 (roda também na árvore anterior). A validação fica presa no `reverse` do geo falso (depois de ler o prédio); o reenvio pausa depois da leitura (`armGateAfter` no `findOneBy` de `Building`); V9b usa `holdUserLock` para o reenvio segurar o lock do prédio enquanto o admin entra na fila. Capacidades: nome de teste rejeita, IA falsa aprova, IA indisponível manda para revisão.
- `building-submissions.e2e-spec.ts`: identidade da submissão e trigger; só com o schema novo. O teste de down/up desfaz a última migration e a reaplica em `finally`.

## Specs de corrida (P00-B1)

- `support/fakes.ts` → `createBarrierAi()`: cada análise de anúncio fica pendente até o teste chamar `release(dados)` ou `fail()`; outras tarefas de IA respondem na hora.
- `support/sync.ts`: `armGate` pausa a primeira chamada de um método (sempre antes de qualquer lock), `holdAdLock` segura o lock da linha numa segunda conexão, `waitBlockedBy` observa a fila de lock por `pg_blocking_pids`, `withTimeout` dá erro de diagnóstico nomeando a etapa que não aconteceu. Nenhuma espera por tempo serve de prova de ordem.
- Toda barreira, lock e análise pendente é liberada no `afterEach`, mesmo quando uma asserção falha.
- `support/sync.ts` → `armGateAfter`: pausa depois de o método devolver (a operação já leu e ainda não agiu); usada na janela entre leitura sem lock e escrita.
- `pause-race.e2e-spec.ts` (P00-B2.1): a pausa para logo depois de ler o anúncio, a mudança concorrente passa pelas rotas reais e um trigger de teste `AFTER UPDATE ON ads` (criado e removido pelo próprio spec) conta as escritas para provar a idempotência.
- `waitBlockedBy` limpa o snapshot de estatísticas a cada consulta (`pg_stat_clear_snapshot()`): o observador costuma estar numa transação e o PostgreSQL congela `pg_stat_activity` no primeiro acesso dela. `holdUserLock` segura a linha do usuário (um INSERT que o referencie espera pela FK).
- `active-limit-race.e2e-spec.ts` (P00-B3): a asserção decisiva é a ocupação no banco. A sincronização muda conforme a versão (presença de `lockActiveQuota`): no código antigo, barreira depois de cada contagem; no corrigido, a 1ª operação segura a cota esperando uma linha travada pelo teste e a 2ª entra na fila da cota (`pg_blocking_pids`). O modo aparece no log da execução.
- Uploads associados sem `attached_at` (dados antigos) são preparados só no banco descartável (`UPDATE uploads SET attached_at = NULL`) nos casos U10.
- `holdUploadLocks(ids)` trava linhas de `uploads` (ordem por id) numa segunda conexão. Em `upload-claim-race.e2e-spec.ts` (P00-B4.1) a mesma sincronização serve antes e depois da correção: no código antigo a operação para no INSERT de `ad_images` (FK); no corrigido, ao travar os uploads. Asserções sobre `ad_images`, dono e `attached_at` no banco.
- `support/ads.ts`: apoio comum (dono, admin, vizinha, publicar, linha do anúncio, contagens).
- `report-moderation-race.e2e-spec.ts` (P00-B1-F8, RN-MOD-008): a denúncia passa pelo HTTP real, admitida com o anúncio ativo, e pausa em `settings.get("reports.autoHideThreshold")` — depois da admissão e antes do efeito, sem lock aberto. Cenários de fila registram no log a ordem observada (`[F8 …]`).

### Demonstração antes/depois

`moderation-race.e2e-spec.ts` usa só o schema anterior à P00-B1 nas asserções e só símbolos que já existiam, para rodar também no código antigo:

1. Salve o diff local e os arquivos não rastreados necessários; crie um worktree de `HEAD` (`git worktree add --detach <dir> HEAD`) e aplique-os.
2. Copie `test/moderation-race.e2e-spec.ts`, `test/support/*` e `scripts/e2e-isolated.sh` para o worktree e rode `./scripts/e2e-isolated.sh test/moderation-race.e2e-spec.ts --verbose` (de `apps/api`).
3. Remova o worktree (`git worktree remove --force <dir>`).
