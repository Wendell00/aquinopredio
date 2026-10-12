# AGENTS.md — Aqui no Prédio

Guia de convenções para pessoas e agentes de IA que trabalham neste repositório. Regras de negócio e produto ficam em [`docs/`](./docs/README.md) — leia antes de implementar uma feature e referencie a `RN-xxx` correspondente em testes e PRs.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Monorepo | pnpm 11 workspaces + Turborepo 2, Node 24 (`.nvmrc`) |
| Front (`apps/web`) | Next.js 16 (App Router) + React 19, Tailwind CSS v4, TanStack Query v5, ky, nuqs, zod |
| API (`apps/api`) | NestJS 12, TypeORM 1 + PostgreSQL/PostGIS, zod, helmet, `@nestjs/throttler` |
| Contratos (`packages/shared`) | Schemas zod, enums e constantes de regra de negócio usados pelo front e pela API |
| Qualidade | Biome (lint + format), TypeScript 6 estrito, Vitest (web/shared), Jest (api), GitHub Actions |

## Comandos

```bash
nvm use                 # Node 24
pnpm install
pnpm db:up              # Postgres + PostGIS no Docker (porta 5433)
pnpm dev                # web :3000 + api :3001
pnpm check              # Biome + typecheck + testes — rode antes de abrir PR
pnpm lint:fix           # corrige lint/format
pnpm test:e2e           # e2e da API (precisa do banco)
```

Não rode `next build` enquanto o `pnpm dev` estiver no ar: os dois escrevem em `apps/web/.next`. Para validar, use `pnpm check`.

## Estrutura

```
apps/
  web/src/
    app/                 # rotas do App Router — finas: só compõem features
    features/<feature>/  # tudo de uma feature: components/, hooks/, api/, utils
    components/ui/       # componentes visuais genéricos, sem regra de negócio
    lib/                 # infraestrutura: api/client.ts (ky), query/, env.ts, cn.ts
    providers/           # providers client-side (Query, nuqs)
  api/src/
    modules/<modulo>/    # controller, service, dto (zod), entities, *.spec.ts
    common/              # pipes, guards, filtros, decorators reutilizáveis
    config/              # env validado (zod) e config do banco
packages/
  shared/src/            # contratos compartilhados — fonte única dos schemas
  typescript-config/     # tsconfigs base
```

## Convenções gerais

- **TypeScript estrito**, sem `any` e sem `!` (non-null assertion). Valide dados externos com zod em vez de fazer cast.
- **Contratos no `@repo/shared`**: se o front e a API trocam um payload, o schema zod mora no `shared` e os dois lados usam `z.infer`. Nada de duplicar tipos.
- **Valores `[configurável]`** dos docs vão para env/settings, nunca fixos no código.
- Nomes de arquivo em `kebab-case`. Componentes React em `PascalCase`, hooks `useAlgo`.
- Código e identificadores em inglês; textos de UI, mensagens de erro para o usuário, comentários e nomes de testes em português.
- Comentários explicam o **porquê**, não o quê.

## Front (`apps/web`)

- **Server Components por padrão.** `"use client"` só no menor componente que precisa de estado, efeito ou evento.
- **Estilos só com Tailwind** (tokens da marca no `@theme` de `src/app/globals.css`). `.css` apenas para tokens, keyframes e base. Sem CSS Modules. Combine classes com `cn()` de `@/lib/cn`.
- **Dados do servidor → TanStack Query.** Cada feature expõe `queryOptions` (chave + função) em `hooks/` e uma função de API em `api/` que chama o client `ky` de `@/lib/api/client` e valida a resposta com o schema do `shared`. Chaves de query são arrays começando pelo nome do recurso: `["ads", { buildingId }]`.
- **Estado de URL (filtros, busca, paginação, abas) → nuqs**, não `useState`.
- Estado local só para UI efêmera. Não adicione store global sem necessidade clara.
- Erros HTTP chegam como `ApiError` (status + mensagem do backend).
- **Imagens** via `next/image`; acessibilidade WCAG 2.1 AA (RNF-006): `alt`, labels, foco visível, contraste.

## API (`apps/api`)

- Um módulo por domínio (`docs/06-arquitetura.md` §6.4). Controller fino → service com a regra → repositório TypeORM.
- **Validação de entrada** com `ZodValidationPipe` + schema do `shared`. Nunca confie no corpo da requisição.
- **Autorização no backend sempre** (RNF-012): filtros de visibilidade por prédio/raio ficam na query, nunca só no front.
- Variáveis de ambiente passam pelo schema de `config/env.ts`; a API não sobe com env inválido. Acesse via `ConfigService<Env, true>`.
- `synchronize` só em desenvolvimento; fora disso, migrations.
- Erros: lance exceções HTTP do Nest (`NotFoundException`, `ForbiddenException`…), com mensagem em português para o usuário. Não vaze stack ou detalhes internos.
- Logs com `Logger` do Nest; nunca logue segredo, token ou dado pessoal.

## Segurança

- **Segredos só no backend** (RNF-010). No front, apenas `NEXT_PUBLIC_*` com valores públicos. `.env` nunca é commitado — mantenha os `.env.example` atualizados.
- API: helmet, CORS restrito a `WEB_ORIGIN`, rate limit global (ajuste por rota sensível com `@Throttle`, RNF-011).
- Web: CSP e cabeçalhos de segurança em `next.config.ts`. Ao adicionar um domínio externo (CDN de imagens, mapas), atualize a CSP.
- Uploads só por URL pré-assinada com tipo/tamanho restritos (RNF-013).
- Entrada de usuário enviada à IA sempre delimitada no prompt, e a saída validada por schema (RNF-014).
- Dependências com versão exata. O Dependabot espera 14 dias por versões novas; `pnpm audit --prod` roda no CI.

## Testes

- **Unitários junto do código**: `*.test.ts(x)` no web/shared (Vitest + Testing Library) e `*.spec.ts` na API (Jest). E2E da API em `apps/api/test/*.e2e-spec.ts`.
- Teste comportamento, não implementação. No front, consulte por papel/texto (`getByRole`) e use `user-event`.
- Toda regra de negócio nova (RN-xxx) tem teste. Nomeie o teste pelo comportamento esperado.
- Mocke a borda (HTTP, banco), não o módulo sob teste.

## Git e CI

- Branches curtas a partir de `main`; PR com o template de `.github/`. Commits no padrão Conventional Commits (`feat:`, `fix:`, `chore:`…).
- O CI (`.github/workflows/ci.yml`) roda Biome, typecheck, testes, build, auditoria e e2e com PostGIS. PR só entra com CI verde.

## Documentação das bibliotecas

As versões instaladas podem ser mais novas que o conhecimento do agente. Antes de usar uma API de Next.js, consulte a doc que vem no pacote: `apps/web/node_modules/next/dist/docs/` (bate com a versão instalada). Para as demais, confira o README da versão instalada em `node_modules/<pacote>/`.

## Skills de agentes

Skills de terceiros em `.claude/skills/` (cada uma tem `SOURCE.md` com origem e commit). Elas são referência: quando conflitarem com este arquivo, **este arquivo vale**. Conflitos conhecidos:

| Skill | Use para | Ignore |
|-------|----------|--------|
| `vercel-react-best-practices`, `vercel-composition-patterns` | Performance, Server/Client Components, composição | Regras que sugerem SWR — aqui é TanStack Query |
| `tanstack-query-best-practices`, `nuqs` | Chaves, mutations, SSR/hidratação; estado na URL | — |
| `tailwind-design-system` | Tokens no `@theme`, padrões v4 | Dependências novas (CVA, shadcn) sem combinar antes |
| `nestjs-best-practices` | Módulos, DI, erros, segurança | Validação com `class-validator` — aqui é zod + `ZodValidationPipe` |
| `clean-ddd-hexagonal` | Fronteiras de domínio quando um módulo crescer | Camadas extras em CRUD simples |
| `typescript-best-practices` + `principle-*` | Tipos e validação nas bordas | — |
| `vitest`, `javascript-typescript-jest` | Testes do web/shared e da API | — |
| `security-best-practices` | Revisão de segurança (Next, React, Express) | — |
| `github-actions-hardening`, `github-actions-efficiency` | Mudanças no CI | — |
| `landing-page` | Landing page e copy | — |

Sem skill (use a doc oficial): ky, Biome.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
