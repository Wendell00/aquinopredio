# Aqui no Prédio

PWA para moradores divulgarem serviços e produtos no próprio prédio e nos prédios vizinhos (por raio em km), com anúncios escritos por IA a partir de texto livre e fotos.

- Produto, regras de negócio (RN-xxx) e arquitetura: [`docs/`](./docs/README.md)
- Convenções de código, estrutura e segurança: [`AGENTS.md`](./AGENTS.md)

## Capacidades descritas na base anterior

A lista abaixo é histórica e ainda não foi auditada contra o código nesta preparação. Para o produto aprovado, consulte [a especificação definitiva](docs/product/README.md); para evidências de implementação, consulte [STATUS.md](docs/implementation/STATUS.md). Destaque, “subir anúncio” e outras regras substituídas não definem o produto alvo.

| Área | Destaques |
|------|-----------|
| Conta | Cadastro com e-mail + senha (confirmação por e-mail, recuperação) e Google; sessões seguras; exportar dados e excluir conta |
| Prédios | Busca por nome, CEP ou "perto de mim"; cadastro com CEP + mapa; detecção de duplicidade; validação automática (OSM + IA) com fila de revisão |
| Anúncios | Manual ou "escrever do meu jeito" com IA; fotos sem EXIF; raio de alcance; moderação automática; renovar, pausar, subir |
| Feed | Visibilidade por raio (PostGIS), filtros, busca em português, favoritos, denúncias, bloqueio |
| Conversas | Chat por anúncio com fotos, aviso de link/golpe, botão de WhatsApp sem expor o número |
| Avisos | Central de notificações, Web Push, preferências e horário silencioso; PWA instalável com página offline |
| Administração | Admin do prédio (moradores, selo, política de entrada) e painel da plataforma (métricas, filas, sanções, configurações) |

## Requisitos

- Node 24 (`nvm use`) e pnpm 11 (`corepack enable` ou `npm i -g pnpm@11`)
- Docker

## Começando

```bash
pnpm install
pnpm db:up                                   # Postgres/PostGIS, SeaweedFS (S3) e Mailpit
cp apps/api/.env.example apps/api/.env       # gere BETTER_AUTH_SECRET: openssl rand -base64 32
cp apps/web/.env.example apps/web/.env.local
pnpm dev                                     # web http://localhost:3000 · api http://localhost:3001/api/health
```

As migrations rodam sozinhas quando a API sobe.

| Serviço local | Endereço |
|---------------|----------|
| App | http://localhost:3000 |
| E-mails enviados (Mailpit) | http://localhost:8025 |
| Imagens (SeaweedFS, S3) | http://localhost:8333 |

**Primeiro admin da plataforma:** crie a conta pelo app e rode
`pnpm --filter api build && pnpm --filter api admin:promote seu@email.com`.

**IA:** coloque `OPENROUTER_API_KEY` em `apps/api/.env` para ligar a geração de anúncios, a validação de prédios e a moderação. Sem chave, o comportamento descrito na base anterior segue a [RN-113 histórica](docs/current-state/02-regras-de-negocio.md): criação manual continua, prédios e anúncios vão para revisão (em dev, `MODERATION_WITHOUT_AI=approve` aprova após o filtro local).

**Google:** crie credenciais OAuth (redirect `http://localhost:3000/api/auth/callback/google`) e preencha `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.

## Scripts

| Comando | O que faz |
|---------|-----------|
| `pnpm dev` | Web, API e o watch do `@repo/shared` |
| `pnpm check` | Biome + typecheck + testes unitários |
| `pnpm test:e2e` | E2E da API no banco local `aquinopredio_test` (sempre `localhost:5433`, limpo a cada execução; specs de corrida pulados) |
| `pnpm test:e2e:ci` | O que o CI roda: E2E pelo turbo em PostgreSQL e Mailpit descartáveis (Docker), com os specs de corrida obrigatórios e o relatório do Jest verificado — ver `apps/api/test/README.md` |
| `pnpm --filter api test:e2e:isolated` | Idem, com o jest direto (aceita um spec como argumento) |
| `pnpm lint:fix` | Corrige lint e formatação |
| `pnpm build` | Build de produção |
| `pnpm db:up` / `pnpm db:down` | Liga/desliga os serviços locais |
| `pnpm --filter api db:migrate` / `db:revert` | Migrations manuais (sobre o build) |

Para criar o banco de testes na primeira vez: `docker exec aquinopredio-db psql -U aquinopredio -c "CREATE DATABASE aquinopredio_test"`.

## Estrutura

```
apps/web            Next.js 16 (App Router), Tailwind v4, TanStack Query, ky, nuqs, react-hook-form
apps/api            NestJS 12, Better Auth, TypeORM + PostgreSQL/PostGIS, OpenRouter
packages/shared     Schemas zod e regras compartilhadas entre web e api
infra/              Configuração dos serviços locais
.github/            CI (lint, tipos, testes, build, auditoria, e2e) e Dependabot
```
