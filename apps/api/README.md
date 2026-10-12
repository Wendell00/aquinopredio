# api — Aqui no Prédio

Backend NestJS. Veja a documentação do projeto em [`docs/`](../../docs/README.md) e as convenções em [`AGENTS.md`](../../AGENTS.md).

```bash
pnpm db:up          # na raiz: sobe Postgres + PostGIS (porta 5433)
cp .env.example .env
pnpm dev            # http://localhost:3001/api/health
pnpm test           # testes unitários (Jest)
pnpm test:e2e       # testes e2e (precisa do banco)
```
