# 6. Arquitetura e Requisitos Não Funcionais

## 6.1 Stack (alinhada ao monorepo atual)

| Camada | Tecnologia | Local no repo |
|--------|-----------|---------------|
| Monorepo | pnpm 11 workspaces + Turborepo 2, Node 24 | raiz |
| Frontend PWA | Next.js 16 (App Router) + React 19 + manifest + Service Worker (ex.: Serwist) | `apps/web` |
| Estilos | **Tailwind CSS v4** em todo o front (tokens da marca no `@theme` de `src/app/globals.css`). Arquivos `.css` só quando necessário (tokens, keyframes, estilos base) — sem CSS Modules | `apps/web` |
| Dados no front | TanStack Query v5 (cache/servidor) + ky (HTTP) + nuqs (estado na URL) | `apps/web/src/lib`, `src/features` |
| Backend API | NestJS 12 (REST), validação com Zod (`ZodValidationPipe`), helmet, rate limit | `apps/api` |
| Tipos/contratos compartilhados | Schemas zod, enums (status, categorias) e constantes de regra | `packages/shared` |
| Banco | PostgreSQL + PostGIS, ORM TypeORM (migrations fora de dev) | `apps/api` |
| Filas / cache | Redis + BullMQ (validação de prédio, moderação) e cache de geocodificação | `apps/api` |
| Armazenamento de imagens | S3 compatível (SeaweedFS em dev; S3/R2 em produção) + CDN. Upload passa pela API, que reprocessa a imagem (WebP, sem EXIF) | `apps/api/src/uploads` |
| IA | OpenRouter (API compatível com OpenAI; SDK `openai` com `baseURL` do OpenRouter) | `apps/api/src/ai` |
| Geolocalização | ViaCEP + Nominatim/Overpass (OpenStreetMap), mapa com Leaflet | `apps/api/src/geo` |
| Push | Web Push (VAPID) + service worker próprio (`public/sw.js`) | `apps/api/src/notifications` |
| Auth | **Better Auth** dentro da API: e-mail + senha (com confirmação de e-mail e recuperação) e Google. Sessões no banco, cookie `httpOnly` + `SameSite=Lax` | `apps/api/src/auth` |

## 6.2 Ferramentas de desenvolvimento

| Ferramenta | Uso |
|------------|-----|
| **Biome** | Lint e formatação de todo o monorepo (`pnpm lint`, `pnpm lint:fix`) |
| **Vitest / Jest** | Testes unitários (Vitest no web e no shared, Jest na API) e e2e da API com supertest |
| **GitHub Actions** | CI em `.github/workflows/ci.yml`: Biome, typecheck, testes, build, `pnpm audit` e e2e com PostGIS. Dependabot semanal |
| **Docker Compose** | Banco local PostgreSQL 16 + PostGIS 3.4: `docker compose up -d` na raiz do repo. Porta **5433** no host (usuário/senha/banco: `aquinopredio`). |
| **Beekeeper Studio** | Cliente SQL para acessar o PostgreSQL/PostGIS (dev e produção, com conexão somente leitura em produção). Conectar usando os mesmos dados de `DATABASE_URL`. |
| **OpenRouter (painel)** | Acompanhar consumo/custo por modelo, limite de crédito e configurações de privacidade. |

## 6.3 Variáveis de ambiente

Modelo em `apps/api/.env.example` (copiar para `apps/api/.env` e preencher). O `.env` está no `.gitignore`.

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Conexão PostgreSQL + PostGIS (a mesma usada no Beekeeper Studio) |
| `REDIS_URL` | Filas (BullMQ) e cache de geocodificação |
| `APP_URL` / `WEB_ORIGIN` / `TRUSTED_PROXIES` | Origem pública do app, origens aceitas (CSRF/CORS) e proxies confiáveis (IP real no rate limit) |
| `BETTER_AUTH_SECRET` | Segredo das sessões (mínimo 32 caracteres) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Login com Google (opcional) |
| `AUTH_CHECK_PWNED_PASSWORDS` | Bloqueia senhas vazadas (recomendado em produção) |
| `SMTP_URL` / `MAIL_FROM` | Envio de e-mails (Mailpit em dev) |
| `STORAGE_*` | Bucket S3 compatível e URL pública/CDN das imagens |
| `GEO_USER_AGENT` / `NOMINATIM_URL` / `OVERPASS_URL` / `VIACEP_URL` | Geolocalização (OpenStreetMap) |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL_*` | IA (ver [Integração com IA](./04-integracao-ia.md)) |
| `MODERATION_WITHOUT_AI` | `review` (padrão) ou `approve` (só dev) quando não há IA |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (`pnpm --filter api exec web-push generate-vapid-keys`) |
| `WORKERS_ENABLED` | Liga filas e jobs agendados no processo (desligue em réplicas só de HTTP) |

A lista completa, com padrões, está em `apps/api/src/config/env.ts`; a API não sobe com variável inválida.

No `apps/web`: `API_INTERNAL_URL` (só no servidor, destino do proxy `/api`) e `NEXT_PUBLIC_STORAGE_URL` (origem pública das imagens). Nenhuma chave secreta vai para o navegador.

## 6.3.1 Decisões de implementação do MVP

| Tema | Decisão | Motivo |
|------|---------|--------|
| Chat | Polling (4 s com a conversa aberta, 15 s na lista) + Web Push | Simples, funciona atrás do proxy do Next e em qualquer hospedagem; trocar por SSE/WebSocket quando o volume pedir |
| Upload | Multipart para a API, reprocessado com `sharp` | Garante remoção de EXIF/GPS e formato real no servidor (RNF-013, RN-132) sem depender do cliente |
| Visibilidade | Uma única expressão SQL (RN-058) reutilizada no feed, detalhe e favoritos | Evita divergência entre telas; pré-filtro por raio máximo usa o índice GIST |
| Distâncias | Arredondadas a 50 m nas respostas | Não revelar a posição exata de outro prédio (RN-034) |
| Telefone | Opcional e não verificado (RN-002 adiada) | Sem provedor de SMS no MVP; o número só sai no link do WhatsApp gerado sob demanda |
| Configuráveis | Tabela `settings` com padrões no código (`SettingsService`) e tela no painel | Itens `[configurável]` dos docs mudam sem deploy |

## 6.4 Módulos do backend (NestJS)

Implementados em `apps/api/src`: `auth` (Better Auth + guard), `users` (perfil, conta/LGPD), `buildings` (busca, cadastro, duplicidade, vínculos, `verification/` em fila, `maintenance/` com o arquivamento de prédios inativos), `geo`, `ai` (OpenRouter, prompts versionados em `ai/prompts/`), `uploads` + `storage`, `ads` (anúncios, rascunhos de IA, `moderation/` em fila, expiração), `feed` (feed, detalhe, favoritos, bloqueio, denúncias), `chat`, `notifications` (central + Web Push), `admin` (painel da plataforma, sanções), `settings`, `audit`.

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

### Autenticação (implementado)

- O navegador só fala com o Next; `/api/*` é repassado para a API (mesma origem). Sem token no `localStorage`, sem CORS entre domínios.
- Sessão opaca no banco (`sessions`), 30 dias, renovada a cada 24 h; ações sensíveis exigem login nos últimos 15 min. Logout e troca de senha revogam sessões.
- Senha: mínimo 10 caracteres, hash `scrypt` do Better Auth; opcionalmente bloqueio de senhas vazadas (`AUTH_CHECK_PWNED_PASSWORDS`).
- E-mail precisa ser confirmado antes do primeiro login. Recuperação de senha não revela se o e-mail existe.
- Rate limit no banco: login 5/min, cadastro e recuperação 5/h por IP (IP real só via `TRUSTED_PROXIES`).
- CSRF: checagem de `Origin` em toda requisição que altera estado (inclusive login) + cookies `SameSite=Lax`.
- Tokens OAuth criptografados no banco; Google só vincula conta pelo e-mail porque o provedor o confirma.
- Contas banidas/excluídas não abrem sessão; e-mails banidos ficam como hash em `banned_identities` (RN-009).
- Guard global na API: toda rota exige sessão, exceto `@Public()`; quem não concluiu o onboarding só acessa rotas `@AllowOnboarding()` (RN-005).

## 6.7 LGPD

- Base legal: execução de contrato (uso do app) e consentimento (notificações, geolocalização).
- Minimização: localização do navegador não armazenada; unidade privada; EXIF removido.
- Direitos do titular: exportação e exclusão (RN-008, RN-133).
- Registro de operadores (provedor de IA, mapas, storage) na Política de Privacidade.

## 6.8 Observabilidade

- Logs estruturados, rastreamento de erros (Sentry), métricas de negócio (anúncios publicados, % com IA, conversão anúncio→conversa, prédios ativos) e de custo de IA.
