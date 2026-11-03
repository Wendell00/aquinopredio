# 11. Guia de implementação com Context Engineering, VS Code e Claude Code

Versão: 1.0\
Data: 28/10/2026

Nota de incorporação (28/10/2026): caminhos, situação do Git e autorização de operações foram adaptados ao repositório oficial; regras comerciais do produto v1.4 foram preservadas.

## 1. Objetivo

Este guia transforma a documentação definitiva em um processo incremental de implementação no Claude Code, evitando três problemas comuns:

- colocar contexto demais em todas as sessões;
- permitir que documentação antiga concorra com as regras aprovadas;
- fazer alterações grandes sem histórico, teste ou rollback.

O princípio é simples: contexto permanente curto, documentação versionada sob demanda, uma fase por vez, testes como definição objetiva de conclusão.

## 2. Situação inicial encontrada

- O código está em `aquinopredio/`.
- A especificação v1.4 está em `documentacao-definitiva/`.
- O repositório oficial já possui Git e fica em `/Users/leandromaciel/Projects/aquinopredio`. A preparação documental ocorre na branch `chore/context-engineering`.
- O projeto já possui `CLAUDE.md`, `AGENTS.md`, `.claude/settings.local.json` e skills.
- `CLAUDE.md` contém apenas `@AGENTS.md`, o que deve ser preservado.
- `AGENTS.md` já descreve stack, arquitetura, comandos, segurança e testes.
- Os documentos atuais de `aquinopredio/docs/` representam uma especificação anterior e podem conflitar com a versão definitiva.

## 3. Camadas de contexto

### Camada 1 — contexto permanente

Carregado em toda sessão:

- `CLAUDE.md`;
- `AGENTS.md`;
- regras realmente universais de `.claude/rules/`, caso venham a ser necessárias.

Deve conter somente arquitetura, comandos, convenções e proibições aplicáveis a quase todas as tarefas. Não importar `DOCUMENTACAO-COMPLETA.md` no `CLAUDE.md`.

### Camada 2 — fonte de verdade do produto

Versionada no repositório, mas lida somente quando relevante:

- visão e planos;
- regras numeradas;
- fluxos;
- especificação técnica;
- critérios de aceite;
- roadmap;
- catálogo.

### Camada 3 — contexto da fase

Adicionado com `@arquivo` no prompt:

- um prompt P00–P11;
- apenas os documentos e seções relacionados;
- arquivos de código que implementam o domínio;
- testes existentes do domínio.

### Camada 4 — evidência de execução

Contexto efêmero:

- erro reproduzido;
- saída de teste;
- diff;
- migration gerada;
- resposta HTTP ou screenshot necessários ao aceite.

## 4. Preparação única

### Passo 1 — abrir a pasta correta

No VS Code, abrir diretamente:

```text
/Users/leandromaciel/Projects/aquinopredio
```

Não abrir somente a pasta superior. A raiz do Claude, dos comandos e do Git deve ser `aquinopredio`.

### Passo 2 — preservar a fonte externa

Não apagar nem alterar o pacote original em `/Users/leandromaciel/Documents/ChatGPT/Aqui no Prédio/documentacao-definitiva`. A cópia versionada no repositório é a referência das próximas tarefas.

### Passo 3 — verificar o repositório existente

```bash
git branch --show-current
git status --short
```

Não inicializar Git novamente nem registrar uma nova baseline por suposição. Preservar alterações existentes e conferir a branch antes de editar.

### Passo 4 — usar a branch de preparação

A branch desta preparação é `chore/context-engineering`. Não trocar de branch, fazer commit, merge ou push sem autorização do proprietário.

### Passo 5 — levar a documentação definitiva para o repositório

Criar:

```text
docs/
  product/          # especificação futura e oficial
  current-state/    # documentação antiga, somente histórica
  implementation/   # andamento, decisões técnicas e evidências
```

Copiar os arquivos de `documentacao-definitiva/` para `docs/product/`.

Mover ou copiar os documentos antigos `docs/01-...` a `docs/07-...` para `docs/current-state/`. O `docs/README.md` deve dizer, inequivocamente:

- `docs/product/` é a fonte de verdade do produto desejado;
- `docs/current-state/` preserva a especificação anterior e não comprova o código atual;
- conflito é resolvido em favor de `docs/product/`;
- mudança comercial só entra após decisão do proprietário.

### Passo 6 — corrigir referências internas

Nos prompts copiados para o repositório, trocar referências como:

```text
docs/product/03-regras-de-negocio.md
```

por:

```text
docs/product/03-regras-de-negocio.md
```

Atualizar `AGENTS.md` para apontar para `docs/product/README.md` e não para os documentos históricos.

### Passo 7 — preservar o contexto permanente curto

Manter `CLAUDE.md` assim:

```text
@AGENTS.md
```

No `AGENTS.md`, acrescentar apenas um bloco curto:

```markdown
## Fonte de verdade do produto

- A especificação alvo está em `docs/product/`.
- `docs/current-state/` é histórica, não comprova o código atual e não define comportamento futuro.
- Leia somente os documentos do domínio da tarefa.
- Não invente regra ausente: registre a pendência em `docs/implementation/STATUS.md` e peça decisão.
- Toda regra implementada deve citar seu código RN em testes e no resumo.
```

### Passo 8 — criar o estado de implementação

Criar `docs/implementation/STATUS.md`:

```markdown
# Estado da implementação

## Fase atual
Preparação documental; diagnóstico P00 ainda não iniciado.

## Concluído
- Registrar somente itens verificados.

## Em andamento
- Registrar a atividade efetivamente em curso.

## Checks conhecidos
- `pnpm check`: ainda não executado na baseline.
- `pnpm test:e2e`: ainda não executado na baseline.

## Pendências e riscos
- Registrar apenas fatos confirmados.

## Próxima ação
- Executar diagnóstico da P00 em Plan mode.
```

Criar `docs/implementation/DECISIONS.md` somente para decisões técnicas relevantes. Regras comerciais continuam em `docs/product/`.

### Passo 9 — revisar a preparação

```bash
git diff --check
git status --short
```

Revisar o diff documental e aguardar autorização explícita antes de commit, merge ou push. Esta preparação não inicia P00 nem modifica a plataforma.

## 5. Preparar VS Code e Claude Code

1. Atualizar o VS Code para uma versão compatível com a extensão.
2. Instalar a extensão oficial `Claude Code`.
3. Abrir o painel pelo ícone Spark.
4. Entrar na conta Anthropic.
5. Abrir uma sessão na raiz `aquinopredio`.
6. Executar `/context` e confirmar que `CLAUDE.md` e `AGENTS.md` aparecem como arquivos de memória.
7. Não executar `/init` como primeiro passo: o projeto já possui instruções cuidadas. Usar `/init` apenas para pedir sugestões e revisar o resultado antes de aceitar.

A extensão já possui o mecanismo do Claude Code. A instalação separada da CLI só é necessária para usar o comando `claude` no terminal.

## 6. Criar a baseline executável

Após aprovação do diagnóstico e autorização para a etapa funcional, em uma branch própria:

```bash
git switch -c fix/p00-estabilizacao
nvm use
pnpm install
pnpm check
pnpm db:up
pnpm test:e2e
```

Não corrigir automaticamente antes de registrar os resultados. Copiar o resumo das falhas para `docs/implementation/STATUS.md`. A baseline deve distinguir:

- falha que já existia;
- configuração local ausente;
- regressão criada durante a evolução.

## 7. Rotina de uma fase

### Etapa A — iniciar uma sessão limpa

Usar uma nova conversa para cada fase ou fatia grande. Não continuar indefinidamente a conversa anterior.

Abrir em **Plan mode**. Esse modo permite investigar sem editar o código.

### Etapa B — fornecer contexto seletivo

Usar:

- `@AGENTS.md` é desnecessário, pois já é carregado;
- `@docs/product/07-roadmap-de-implementacao.md` somente para localizar a fase;
- `@docs/product/08-prompts-claude-code.md` somente para o prompt Pxx;
- o documento de regra do domínio;
- o critério de aceite correspondente;
- `@docs/implementation/STATUS.md`;
- diretórios ou arquivos concretos encontrados durante a investigação.

Não anexar `DOCUMENTACAO-COMPLETA.md` em todas as sessões. Ele é um documento humano de consulta, não contexto padrão do agente.

### Etapa C — pedir investigação antes do plano

Prompt base:

```text
Estamos implementando a fase PXX do Aqui no Prédio.

Contexto obrigatório:
- @docs/product/03-regras-de-negocio.md
- @docs/product/06-criterios-de-aceite.md
- @docs/product/08-prompts-claude-code.md
- @docs/implementation/STATUS.md

Trabalhe em Plan mode e não edite arquivos ainda.

1. Leia somente as regras, critérios e prompt relacionados à PXX.
2. Investigue o código atual e os testes; não presuma que a documentação histórica representa o código.
3. Mostre o fluxo atual, as lacunas e os riscos de migration/concorrência/segurança.
4. Divida a entrega em fatias pequenas, cada uma com arquivos, migration, testes e comando de validação.
5. Identifique qualquer decisão de produto ausente. Não invente a resposta.
6. Proponha a primeira fatia implementável e aguarde aprovação.

Formato da resposta: diagnóstico curto, plano numerado, arquivos prováveis, testes e dúvidas bloqueantes.
```

### Etapa D — revisar o plano

Antes de autorizar edição, confirmar:

- a fatia implementa regras RN específicas;
- não mistura outra fase;
- migrations são novas e versionadas;
- não utiliza migrador automático do Better Auth;
- backend aplica autorização, não apenas interface;
- há testes para corrida, limite e falha quando aplicável;
- existe um comando objetivo de conclusão.

### Etapa E — implementar uma fatia

Mudar para **Ask permissions** ou **Auto accept edits**, conforme sua confiança. Não usar bypass de permissões no computador pessoal.

Prompt:

```text
Plano aprovado. Implemente somente a fatia 1.

Regras cobertas: RN-XXX, RN-YYY.
Critérios cobertos: seção 6.X, itens [...].

Restrições:
- preserve alterações não relacionadas;
- use migrations do repositório;
- mantenha contratos compartilhados em @repo/shared;
- não acrescente dependência sem justificar;
- não altere regra de negócio;
- escreva os testes antes ou junto da implementação.

Ao terminar:
1. rode os testes focados;
2. rode typecheck/lint relevantes;
3. mostre o diff resumido;
4. informe o que não foi coberto;
5. não comece a fatia seguinte.
```

### Etapa F — validar

Executar em camadas:

1. teste unitário do módulo alterado;
2. typecheck do pacote;
3. `pnpm check`;
4. `pnpm test:e2e` quando houver API, banco, autenticação, raio ou migration;
5. jornada manual no navegador quando houver interface.

Não aceitar “deve funcionar”. Pedir o comando executado, resultado e evidência contra os critérios.

### Etapa G — revisão adversarial

Em uma nova sessão curta ou no fim da fatia:

```text
Revise o diff atual como revisor adversarial.
Compare apenas com RN-XXX/RN-YYY e os critérios 6.X.
Procure: bypass pelo backend, corrida, migration insegura, quebra de downgrade, vazamento de PII, job não idempotente e teste que passa sem provar a regra.
Não edite. Liste achados por severidade e cite arquivo/linha.
```

Corrigir somente achados válidos e repetir os checks.

### Etapa H — registrar e commitar

Pedir ao Claude:

```text
Atualize apenas docs/implementation/STATUS.md com fatos desta fatia:
- regras concluídas;
- migrations;
- testes e resultados;
- pendências reais;
- próxima ação.
Não reescreva a especificação do produto.
```

Depois revisar. O commit abaixo exige autorização explícita; push e merge também:

```bash
git status --short
git diff --check
git add <arquivos revisados>
git commit -m "feat(<dominio>): implementar <fatia>"
```

### Etapa I — renovar o contexto

Depois de uma fatia ou quando a conversa estiver longa:

- abrir nova sessão;
- carregar `STATUS.md`;
- carregar somente as regras da próxima fatia;
- pedir ao Claude para conferir Git e código, sem confiar cegamente no resumo.

## 8. Ordem recomendada

| Ordem | Prompt | Entrega |
|---:|---|---|
| 0 | P00 | estabilização da base |
| 1 | P01 | planos, cotas, validade e IA |
| 2 | P02 | downgrade |
| 3 | P03 | endereço, condomínio e convites |
| 4 | P04 | moderação completa |
| 5 | P05 | distância, `Procuro` e compartilhamento |
| 6 | P06 | catálogo e variações |
| 7 | P07 | importação XLSX/CSV |
| 8 | P08 | ZIP de fotos |
| 9 | P09 | telefone, Apple e métodos de acesso |
| 10 | P10 | indicação, WhatsApp e consentimento |
| 11 | P11 | auditoria e lançamento |

Não executar todas as fases em uma única conversa. Dentro da P00, separar pelo menos:

1. ordem de migrations e autenticação;
2. concorrência da moderação e validação de prédio;
3. testes assíncronos, Biome e dependências.

Os números de fase do roadmap (0–8) e os identificadores de prompt (P00–P11) não são equivalentes. Por exemplo, P02 detalha downgrade da Fase 1 e P03 corresponde à Fase 2. Use a [matriz de rastreabilidade](10-matriz-de-rastreabilidade.md) para relacioná-los.

## 9. Controle de contexto e tokens

- Manter `CLAUDE.md`/`AGENTS.md` pequenos e universais.
- Referenciar arquivos específicos com `@`, não diretórios enormes.
- Carregar no máximo os documentos necessários à fatia.
- Pedir investigação dirigida, não “leia o repositório inteiro”.
- Usar sessões novas depois de cada entrega coerente.
- Usar subagentes apenas para pesquisa isolada; não deixar vários agentes editarem a mesma área.
- Não manter servidores MCP desconectados ou irrelevantes durante a fase.
- Pedir resumo final de no máximo 20 linhas.
- Colocar o estado durável em arquivos, não depender da memória da conversa.
- Reservar modelos/esforço mais altos para arquitetura, segurança, concorrência e revisão final; usar o modelo padrão para mudanças mecânicas e testes.

## 10. Regras que não podem depender apenas de prompt

Transformar em mecanismos verificáveis:

- CI bloqueia merge com lint, tipos ou testes falhando;
- migrations são revisadas e executadas em base limpa;
- `.env` e segredos permanecem ignorados;
- força de autorização e cota fica no backend;
- comandos destrutivos continuam sujeitos a permissão;
- branch protection e revisão humana decidem o merge;
- hooks podem executar checks, mas não substituem o CI.

## 11. Anti-padrões

- Colar as 736 linhas da documentação completa em todo prompt.
- Pedir “implemente tudo”.
- Aceitar alteração sem teste e sem diff.
- Usar documentação antiga como regra atual.
- Deixar Claude decidir regra comercial ausente.
- Corrigir baseline e feature na mesma alteração sem separar commits.
- Permitir que uma sessão edite múltiplos domínios dependentes sem checkpoints.
- Rodar `lint:fix` em todo o monorepo antes de registrar a baseline.
- Usar bypass de permissões no Mac pessoal.
- Implementar todas as fases diretamente em `main`.

## 12. Checklist antes da primeira feature

- [ ] Repositório Git existente, branch e estado de trabalho conferidos.
- [ ] Nenhum segredo foi incluído no commit.
- [ ] Documentação v1.4 dentro de `docs/product/`.
- [ ] Documentação antiga marcada como histórica.
- [ ] `AGENTS.md` aponta para a fonte correta.
- [ ] `CLAUDE.md` continua curto.
- [ ] `STATUS.md` criado.
- [ ] Extensão oficial funcionando na raiz correta.
- [ ] `/context` confirma as instruções carregadas.
- [ ] `pnpm check` da baseline registrado.
- [ ] Banco e e2e registrados.
- [ ] Diagnóstico P00 aprovado antes de criar a branch funcional.
- [ ] Primeira sessão iniciada em Plan mode.

## Referências oficiais

- Claude Code no VS Code: https://code.claude.com/docs/en/vs-code
- Memória, `CLAUDE.md`, `AGENTS.md` e regras: https://code.claude.com/docs/en/memory
- Boas práticas de contexto e verificação: https://code.claude.com/docs/en/best-practices
- Fluxos comuns, planejamento e testes: https://code.claude.com/docs/en/common-workflows
- Configurações e precedência: https://code.claude.com/docs/en/settings
