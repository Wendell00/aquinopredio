# 1. Visão Geral

## 1.1 Problema

Moradores de prédios e condomínios oferecem serviços (manicure, aulas particulares, conserto, marmitas, pet sitter etc.) e vendem produtos (bolos, usados, artesanato), mas a divulgação hoje acontece em grupos de WhatsApp desorganizados, murais físicos ou boca a boca. Não há um lugar confiável, organizado e restrito à vizinhança.

## 1.2 Objetivo

Oferecer um aplicativo PWA (instalável no celular, sem loja de apps) onde:

1. Cada usuário está vinculado a um **prédio/condomínio**.
2. O usuário publica **anúncios** de serviços/produtos visíveis para os vizinhos do seu prédio e, se desejar, para outros prédios dentro de um **raio em km**.
3. O usuário pode escrever de forma livre (ex.: *"faço bolo de pote, 10 reais, chocolate e ninho"*) com fotos, e a **IA cria um anúncio** bem redigido, categorizado e pronto para publicar.
4. Novos prédios cadastrados passam por **validação automática por IA** (endereço + dados de geolocalização) para evitar prédios falsos.

## 1.3 Público-alvo

- **Primário:** moradores de prédios residenciais e condomínios (verticais ou horizontais) que querem vender produtos ou oferecer serviços.
- **Secundário:** moradores que querem **consumir** serviços/produtos próximos e de vizinhos (confiança da proximidade).
- **Terciário (futuro):** síndicos/administradoras que querem um canal oficial de comunicação com moradores.

## 1.4 Glossário

| Termo | Definição |
|-------|-----------|
| **Prédio** | Entidade que representa um edifício ou condomínio (vertical ou horizontal) com endereço e coordenadas geográficas. |
| **Vínculo (membership)** | Relação entre um usuário e um prédio. Define que o usuário é morador daquele prédio. |
| **Prédio principal** | O prédio a partir do qual o usuário publica anúncios e que define a origem do seu feed. |
| **Anúncio** | Publicação de um serviço ou produto. |
| **Raio de alcance** | Distância em km, a partir do prédio do anunciante, dentro da qual o anúncio fica visível para outros prédios. Raio 0 = só o próprio prédio. |
| **Rascunho IA** | Sugestão de anúncio gerada pela IA a partir de texto/imagens do usuário, antes da publicação. |
| **Validação de prédio** | Processo (automático por IA + manual quando necessário) que confirma que o prédio existe no endereço informado. |
| **Admin da plataforma** | Equipe interna com acesso ao painel administrativo. |

## 1.5 Perfis de usuário

| Perfil | Pode |
|--------|------|
| **Visitante (não logado)** | Ver a landing page. Não vê anúncios (privacidade dos moradores). |
| **Morador** | Ver feed, favoritar, conversar, denunciar, criar anúncios, avaliar. |
| **Morador verificado** | Tudo do morador + selo de verificação e maior limite de anúncios. |
| **Admin da plataforma** | Revisar prédios pendentes, tratar denúncias, banir usuários, configurar parâmetros, ver métricas. |

## 1.6 Escopo do MVP

Incluído:
- Cadastro/login, vínculo obrigatório a um prédio (localizar ou criar).
- Validação de prédio por IA + fila de revisão manual.
- Criação de anúncio manual ou assistida por IA (texto + imagens).
- Raio de alcance por anúncio.
- Feed com filtros (categoria, tipo, distância, busca).
- Chat interno simples entre interessado e anunciante + botão de WhatsApp opcional.
- Favoritos, denúncias, moderação automática por IA.
- Notificações push (Web Push) e instalação PWA.

Fora do MVP (ver [Roadmap](./07-roadmap.md)): pagamentos dentro do app, anúncios patrocinados, avaliações públicas, painel de síndico, mural oficial do condomínio.
