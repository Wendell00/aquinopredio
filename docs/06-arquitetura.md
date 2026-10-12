# 6. Arquitetura e Requisitos Não Funcionais

## 6.1 Stack (alinhada ao monorepo atual)

| Camada | Tecnologia | Local no repo |
|--------|-----------|---------------|
| Frontend PWA | Next.js (App Router) + manifest + Service Worker (ex.: Serwist) | `apps/web` |
| Estilos | **Tailwind CSS v4** em todo o front (tokens da marca no `@theme` de `app/globals.css`). Arquivos `.css` só quando necessário (tokens, keyframes, estilos base) — sem CSS Modules | `apps/web` |
| Backend API | NestJS (REST), validação com `class-validator`/Zod | `apps/api` |
| Componentes compartilhados | React | `packages/ui` |
| Tipos/contratos compartilhados | DTOs e enums (status, categorias) | `packages/shared` (a criar) |
| Banco | PostgreSQL + PostGIS (ORM: Prisma ou Drizzle) | |
| Filas / cache | Redis + BullMQ (moderação, validação de prédio, notificações) | |
| Armazenamento de imagens | S3 compatível (S3, R2, Supabase Storage) + CDN, upload via URL pré-assinada | |
| IA | OpenRouter (API compatível com OpenAI; SDK `openai` com `baseURL` do OpenRouter) | `apps/api/src/ai` |
| Geolocalização | ViaCEP, Google Geocoding/Places ou Nominatim/OSM, mapa com Leaflet/MapLibre | |
| Push | Web Push (VAPID) | |
| Auth | JWT (access curto + refresh httpOnly) ou provedor (Auth.js / Supabase Auth) | |

## 6.2 Ferramentas de desenvolvimento

| Ferramenta | Uso |
|------------|-----|
| **Docker Compose** | Banco local PostgreSQL 16 + PostGIS 3.4: `docker compose up -d` na raiz do repo. Porta **5433** no host (usuário/senha/banco: `aquinopredio`). |
| **Beekeeper Studio** | Cliente SQL para acessar o PostgreSQL/PostGIS (dev e produção, com conexão somente leitura em produção). Conectar usando os mesmos dados de `DATABASE_URL`. |
| **OpenRouter (painel)** | Acompanhar consumo/custo por modelo, limite de crédito e configurações de privacidade. |

## 6.3 Variáveis de ambiente

Modelo em `apps/api/.env.example` (copiar para `apps/api/.env` e preencher). O `.env` está no `.gitignore`.

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Conexão PostgreSQL + PostGIS (a mesma usada no Beekeeper Studio) |
| `OPENROUTER_API_KEY` | Chave do OpenRouter |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` |
| `OPENROUTER_SITE_URL` / `OPENROUTER_APP_NAME` | Identificação do app no OpenRouter |
| `OPENROUTER_MODEL_AD_GENERATION` / `_BUILDING_VALIDATION` / `_MODERATION` | Modelo de cada tarefa (ver [Integração com IA](./04-integracao-ia.md)) |
| `REDIS_URL` | Filas (BullMQ) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Autenticação |
| `STORAGE_*` | Bucket de imagens (S3/R2/Supabase) |
| `GOOGLE_MAPS_API_KEY` | Geocoding/Places (opcional se usar Nominatim/OSM) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (gerar com `npx web-push generate-vapid-keys`) |
| `SMS_PROVIDER_*` | Confirmação de telefone (pode ficar para depois) |

No `apps/web`, somente variáveis públicas (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) — nenhuma chave secreta.

## 6.4 Módulos do backend (NestJS)

`auth`, `users`, `buildings` (busca, criação, duplicidade, memberships), `verification` (pipeline de validação de prédio), `ads`, `ai` (geração, moderação, validação — prompts versionados), `feed`, `chat` (WebSocket/SSE), `favorites`, `reports`/`moderation`, `notifications`, `admin`, `settings`.

## 6.5 Requisitos PWA

- **RNF-001** — Instalável (manifest com ícones 192/512, `display: standalone`, tema/cores, screenshots).
- **RNF-002** — Funciona offline para: shell do app, último feed carregado, "Meus anúncios" e favoritos (cache). Ações offline (ex.: rascunho de anúncio) ficam salvas localmente e sincronizam ao voltar a conexão.
- **RNF-003** — Câmera/galeria via `<input type="file" accept="image/*" capture>`; compressão e remoção de EXIF no cliente antes do upload.
- **RNF-004** — Web Push com fluxo de permissão contextual (pedir após primeira ação relevante, não no primeiro acesso). Considerar limitação do iOS: push só funciona com o PWA instalado na tela inicial (iOS 16.4+) — exibir tutorial de instalação.
- **RNF-005** — Mobile-first, Lighthouse PWA/Performance ≥ 90, LCP < 2,5 s em 4G.
- **RNF-006** — Acessibilidade WCAG 2.1 AA.

## 6.6 Segurança

- **RNF-010** — Chaves de IA (OpenRouter) e de mapas somente no backend.
- **RNF-011** — Rate limiting por IP e por usuário (login, OTP, criação de prédio, IA, chat).
- **RNF-012** — Autorização por recurso: um usuário só lê anúncios visíveis ao seu prédio (RN-058) — o filtro é sempre aplicado no backend.
- **RNF-013** — Upload apenas por URL pré-assinada com tipo e tamanho restritos; imagens reprocessadas no servidor.
- **RNF-014** — Proteção contra prompt injection: entradas do usuário sempre delimitadas no prompt e saída validada por schema.
- **RNF-015** — Logs de auditoria para ações de moderação e administração.

## 6.7 LGPD

- Base legal: execução de contrato (uso do app) e consentimento (notificações, geolocalização).
- Minimização: localização do navegador não armazenada; unidade privada; EXIF removido.
- Direitos do titular: exportação e exclusão (RN-008, RN-133).
- Registro de operadores (provedor de IA, mapas, storage) na Política de Privacidade.

## 6.8 Observabilidade

- Logs estruturados, rastreamento de erros (Sentry), métricas de negócio (anúncios publicados, % com IA, conversão anúncio→conversa, prédios ativos) e de custo de IA.
