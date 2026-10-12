# Documentação do Projeto — Aqui no Prédio

PWA para moradores divulgarem **serviços e produtos** dentro do seu prédio/condomínio e, opcionalmente, para prédios vizinhos dentro de um raio em km. O usuário pode escrever um texto livre e enviar fotos para que uma **IA gere o anúncio** por ele.

## Índice

| # | Documento | Conteúdo |
|---|-----------|----------|
| 1 | [Visão geral](./01-visao-geral.md) | Objetivo, público-alvo, glossário, perfis de usuário, escopo do MVP |
| 2 | [Regras de negócio](./02-regras-de-negocio.md) | Todas as regras numeradas (RN-xxx) por módulo |
| 3 | [Fluxos do usuário](./03-fluxos.md) | Cadastro, criação/localização de prédio, criação de anúncio, feed |
| 4 | [Integração com IA](./04-integracao-ia.md) | Geração de anúncio, validação de prédio, moderação — entradas, saídas e limites |
| 5 | [Modelo de dados](./05-modelo-de-dados.md) | Entidades, campos, status e relacionamentos |
| 6 | [Arquitetura e requisitos não funcionais](./06-arquitetura.md) | Stack (Next.js PWA + NestJS), geolocalização, PWA, segurança, LGPD |
| 7 | [Roadmap](./07-roadmap.md) | MVP, fases seguintes e ideias futuras |

## Convenções

- **RN-xxx**: regra de negócio. Toda implementação deve referenciar a RN correspondente em PRs/testes.
- **RF-xxx**: requisito funcional. **RNF-xxx**: requisito não funcional.
- Valores marcados como `[configurável]` devem ficar em configuração (env/tabela de settings), não fixos no código.
