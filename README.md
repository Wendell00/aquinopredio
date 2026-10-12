# Aqui no Prédio

PWA para moradores divulgarem serviços e produtos no próprio prédio e nos prédios vizinhos, com anúncios gerados por IA.

- Produto, regras de negócio e arquitetura: [`docs/`](./docs/README.md)
- Convenções de código, estrutura e segurança: [`AGENTS.md`](./AGENTS.md)

## Requisitos

- Node 24 (`nvm use`) e pnpm 11 (`corepack enable` ou `npm i -g pnpm@11`)
- Docker (Postgres + PostGIS local)

## Começando

```bash
pnpm install
pnpm db:up                                  # banco na porta 5433
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev                                    # web http://localhost:3000 · api http://localhost:3001/api/health
```

## Scripts

| Comando | O que faz |
|---------|-----------|
| `pnpm dev` | Sobe web, api e o watch do `@repo/shared` |
| `pnpm check` | Biome + typecheck + testes unitários (o mesmo que o CI) |
| `pnpm lint:fix` | Corrige lint e formatação |
| `pnpm test` / `pnpm test:e2e` | Testes unitários / e2e da API |
| `pnpm build` | Build de produção |
| `pnpm db:up` / `pnpm db:down` | Liga/desliga o banco local |

## Estrutura

```
apps/web            Next.js 16 (App Router), Tailwind v4, TanStack Query, ky, nuqs
apps/api            NestJS 12, TypeORM, PostgreSQL/PostGIS
packages/shared     Schemas zod e regras compartilhadas entre web e api
packages/typescript-config
```
