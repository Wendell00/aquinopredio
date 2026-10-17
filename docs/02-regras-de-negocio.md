# 2. Regras de Negócio

Regras numeradas por módulo. Valores `[configurável]` devem ser parametrizados.

---

## 2.1 Conta e autenticação (RN-001 a RN-019)

- **RN-001** — O cadastro pode ser feito por e-mail + senha, link mágico por e-mail ou login social (Google/Apple). *No MVP atual: e-mail + senha e Google.*
- **RN-002** — *(adiada no MVP atual: o telefone é opcional e não é confirmado por código; a exigência volta quando houver provedor de SMS/WhatsApp.)* O telefone (celular) é obrigatório e deve ser confirmado por código (SMS ou WhatsApp) antes de publicar o primeiro anúncio. Navegar e conversar não exige telefone confirmado.
- **RN-003** — Um telefone e um e-mail só podem estar associados a uma conta.
- **RN-004** — O usuário deve ter **18 anos ou mais** (declaração no cadastro + aceite dos Termos de Uso e Política de Privacidade).
- **RN-005** — **O cadastro só é concluído após o vínculo com um prédio** (localizar existente ou criar novo). Enquanto não houver vínculo, o usuário fica no estado `onboarding_pendente` e só acessa o fluxo de onboarding.
- **RN-006** — Nome de exibição é obrigatório; foto de perfil é opcional.
- **RN-007** — O número do apartamento/unidade é informado no vínculo, mas **nunca é exibido publicamente**; é visível apenas para os admins da plataforma (ex.: ao tratar denúncias).
- **RN-008** — O usuário pode excluir a conta a qualquer momento. A exclusão remove anúncios ativos, anonimiza mensagens enviadas ("Usuário removido") e apaga dados pessoais em até 30 dias (LGPD), mantendo apenas registros exigidos por lei/segurança (logs de moderação).
- **RN-009** — Contas banidas não podem criar nova conta com o mesmo e-mail, telefone ou dispositivo identificado.
- **RN-010** — Todo usuário escolhe um **nome de usuário** (`@fulano`) no passo de perfil do cadastro. Ele é **único** no app, tem 3–20 caracteres (letras minúsculas sem acento, números, `_` e `.`, começando por letra) e não pode usar nomes reservados (ex.: `admin`, `suporte`). Pode ser trocado no perfil, se o novo estiver livre. Ao excluir a conta, o nome é liberado.

## 2.2 Prédios (RN-020 a RN-049)

### Localização de prédio existente
- **RN-020** — No onboarding, o usuário pode buscar prédios por: nome, CEP, endereço ou "perto de mim" (geolocalização do navegador, com permissão).
- **RN-021** — A busca retorna somente prédios com status `verificado`, `pendente_revisao` ou `pendente_validacao` (recém-cadastrado, aguardando a validação automática). Prédios `rejeitado` e `arquivado` não aparecem.
- **RN-022** — Ao selecionar um prédio, o usuário informa a unidade (apto/bloco/casa) e solicita vínculo.

### Criação de prédio
- **RN-023** — Se o prédio não for encontrado, o usuário pode criá-lo informando: nome do prédio/condomínio, tipo (`edificio` ou `condominio_horizontal`), CEP, logradouro, número, bairro, cidade, UF e, opcionalmente, foto da fachada e número aproximado de unidades.
- **RN-024** — O endereço é preenchido automaticamente via CEP (ex.: ViaCEP) e depois **geocodificado** (latitude/longitude). Se a geocodificação falhar, o usuário deve ajustar o pino no mapa manualmente.
- **RN-025** — **Detecção de duplicidade:** antes de criar, o sistema busca prédios num raio de **100 m** `[configurável]` ou com mesmo CEP + número. Se houver candidatos, eles são exibidos com a pergunta *"Seu prédio é um destes?"*. O usuário só prossegue com a criação se negar todos.
- **RN-026** — Todo prédio criado é enviado para **validação por IA** (ver [Integração com IA](./04-integracao-ia.md#42-validação-de-prédio)) junto com o endereço, as coordenadas, os dados de lugares próximos (Google Places/OSM) e a foto da fachada, se houver.
- **RN-027** — Resultado da validação por IA (score de 0 a 1):
  - `score >= 0.80` `[configurável]` → status **`verificado`**.
  - `0.50 <= score < 0.80` → status **`pendente_revisao`** (fila de revisão manual do admin da plataforma).
  - `score < 0.50` → status **`rejeitado`**, com o motivo exibido ao usuário.
- **RN-028** — Enquanto o prédio estiver `pendente_revisao`, o criador e quem se vincular **podem usar o app**, mas os anúncios ficam com raio máximo de **0 km** (somente o próprio prédio) até a verificação. Um aviso é exibido no prédio.
- **RN-029** — Se o prédio for `rejeitado`, o usuário pode **corrigir os dados e reenviar uma única vez** `[configurável]`; nova rejeição exige contato com o suporte. O usuário volta para o estado `onboarding_pendente`.
- **RN-030** — Um usuário pode criar no máximo **2 prédios a cada 30 dias** `[configurável]` (antifraude).
- **RN-031** — *(removida em 17/10/2026: não existe mais administrador do prédio.)* O criador do prédio é um morador como os demais; a moderação é feita pela IA e pelos admins da plataforma.
- **RN-032** — Alterações de nome ou endereço de um prédio verificado disparam **nova validação por IA**; até a conclusão, os dados antigos continuam valendo.
- **RN-033** — Prédios sem nenhum morador ativo por **180 dias** `[configurável]` são arquivados (somem da busca, mas podem ser reativados).
- **RN-034** — O endereço completo do prédio nunca é exibido para moradores de **outros** prédios: eles veem apenas nome do prédio, bairro e distância aproximada (ex.: "a 1,2 km").

### Vínculo do morador com o prédio
- **RN-035** — Cada usuário possui **um prédio principal** e pode ter até **2 prédios adicionais** `[configurável]` (ex.: quem tem imóvel em outro condomínio). Anúncios são sempre publicados a partir de um prédio escolhido pelo usuário dentre os seus.
- **RN-036** — Status do vínculo: `pendente`, `ativo`, `recusado`, `removido`.
- **RN-037** — O vínculo entra `ativo` imediatamente; não há aprovação por moradores. (`pendente` e `recusado` ficam reservados para uma verificação futura.)
- **RN-038** — **Selo de morador verificado** é concedido quando ocorrer uma das opções: (a) *(removida: não há administrador do prédio)*; (b) confirmação por **2 moradores verificados** do mesmo prédio; (c) envio de comprovante de residência analisado (IA + revisão). O selo é exibido no perfil e nos anúncios.
- **RN-039** — O usuário pode trocar o prédio principal a qualquer momento; anúncios ativos vinculados ao prédio antigo continuam ativos até expirarem, a menos que o vínculo seja removido (nesse caso, são pausados).
- **RN-040** — *(removida em 17/10/2026: não existe mais administrador do prédio.)*
- **RN-041** — *(removida em 17/10/2026: não existe mais administrador do prédio.)*

## 2.3 Anúncios (RN-050 a RN-069)

### Criação
- **RN-050** — Somente usuários com vínculo **ativo** e telefone confirmado podem criar anúncios.
- **RN-051** — Tipos de anúncio: `servico`, `produto` e `procura` (o morador procura algo, ex.: "procuro diarista").
- **RN-052** — Campos do anúncio:
  - Título (obrigatório, 5–80 caracteres).
  - Descrição (obrigatória, 20–2.000 caracteres).
  - Tipo (obrigatório).
  - Categoria (obrigatória, lista fixa — ver RN-060).
  - Imagens (0 a **6**, JPG/PNG/WebP/HEIC, até 10 MB cada antes da compressão).
  - Preço (opcional) com modo: `fixo`, `a_partir_de`, `a_combinar`, `gratuito`.
  - Raio de alcance (obrigatório, padrão 0 km).
  - Formas de contato: chat interno (sempre ativo) e WhatsApp (opcional).
  - Disponibilidade (opcional, escolhida numa lista: todos os dias, dias úteis, fins de semana, horário comercial, à noite, a combinar). Detalhes de horário vão na descrição.
  - Prédio de origem (obrigatório; um dos prédios ativos do usuário).
- **RN-053** — **Criação assistida por IA (opcional):** o usuário pode enviar um texto livre e/ou imagens; a IA retorna um **rascunho** com título, descrição, tipo, categoria, preço sugerido (se mencionado), tags e alertas. O rascunho **nunca é publicado automaticamente** — o usuário sempre revisa, edita e confirma.
- **RN-054** — O usuário pode pedir à IA para **regerar** o rascunho ou ajustar o tom (`formal`, `amigavel`, `direto`). Cada geração/regeração conta no limite diário (RN-110).
- **RN-055** — O usuário também pode criar o anúncio **manualmente**, sem IA, e pode pedir à IA apenas para "melhorar texto" de um anúncio já escrito.
- **RN-056** — A IA não pode inventar informações que o usuário não forneceu (preço, horários, garantias). Dados ausentes devem vir como campos vazios ou como sugestão marcada "confirme este dado".

### Raio de alcance
- **RN-057** — Opções de raio: **0 (só meu prédio), 0,5, 1, 2, 3, 5 e 10 km** `[configurável]`, limitadas pelo plano (RN-141, RN-142). O raio é calculado a partir das coordenadas do prédio de origem do anúncio.
- **RN-058** — Um anúncio é visível para um usuário do prédio **B** se: o anúncio estiver `ativo` **e** (`prédio_origem == B` **ou** `distância(prédio_origem, B) <= raio_do_anúncio`).
- **RN-059** — Prédios com status `pendente_revisao` só publicam com raio 0 (RN-028). Fora isso, o raio máximo é definido pelo **plano** (RN-141, RN-142), não pelo selo de verificado.

### Categorias
- **RN-060** — Categorias iniciais: Alimentação, Beleza e Estética, Saúde e Bem-estar, Aulas e Educação, Reparos e Manutenção, Limpeza e Organização, Pets, Crianças e Babás, Tecnologia, Moda e Acessórios, Casa e Decoração, Eletrônicos, Veículos e Vagas de Garagem, Eventos e Festas, Transporte e Caronas, Outros. A lista é gerenciada pelo admin da plataforma.

### Ciclo de vida
- **RN-061** — Status do anúncio: `rascunho`, `em_moderacao`, `ativo`, `pausado`, `expirado`, `removido` (pela moderação), `excluido` (pelo usuário).
- **RN-062** — Ao publicar, o anúncio passa por **moderação automática por IA** (RN-090). Aprovado → `ativo`. Suspeito → `em_moderacao` (revisão manual). Proibido → `removido` com motivo.
- **RN-063** — No plano Free, anúncios ficam ativos por **30 dias** `[configurável]` (no Pro não expiram — RN-143). Três dias antes de expirar, o anunciante recebe notificação para **renovar** (renovação gratuita, 1 clique, reinicia os 30 dias).
- **RN-064** — O anunciante pode pausar, reativar, editar ou excluir o anúncio a qualquer momento. Editar título, descrição ou imagens dispara nova moderação.
- **RN-065** — Limite de anúncios ativos simultâneos por usuário: **5** para morador e **10** para morador verificado `[configurável]`.
- **RN-066** — Não é permitido publicar anúncios **duplicados** (mesmo usuário, texto com similaridade > 90%) simultaneamente ativos.
- **RN-067** — Opcional "**Subir anúncio**": o anunciante pode trazer o anúncio ao topo do feed 1 vez a cada **72 h** `[configurável]`.
- **RN-068** — Anúncios de usuários removidos do prédio ou banidos são pausados/removidos automaticamente.

## 2.4 Feed, busca e descoberta (RN-070 a RN-079)

- **RN-070** — O feed mostra apenas anúncios visíveis segundo a RN-058, a partir do **prédio principal** do usuário (ou do prédio selecionado no seletor de prédios).
- **RN-071** — Ordenação padrão: (1) anúncios do próprio prédio, (2) demais por distância crescente, (3) dentro da mesma faixa, mais recentes/"subidos" primeiro.
- **RN-072** — Filtros: tipo, categoria, faixa de distância (só meu prédio / até 1 / 3 / 5 km), faixa de preço, apenas verificados, busca textual (título, descrição, tags).
- **RN-073** — Cada card exibe: imagem principal, título, preço, nome do prédio de origem (ou "Seu prédio"), distância aproximada, selo de verificado e tempo desde a publicação.
- **RN-074** — Os próprios anúncios ativos aparecem no feed, como para os vizinhos, com a marca "Seu anúncio" e sem a opção de favoritar. A gestão (editar, pausar, renovar) continua em "Meus anúncios".
- **RN-075** — Anúncios de usuários **bloqueados** pelo usuário não aparecem para ele, e vice-versa.
- **RN-076** — **Alertas de busca:** o usuário pode salvar uma busca (ex.: "manicure até 2 km") e receber notificação quando surgir anúncio compatível.

## 2.5 Interações (RN-080 a RN-089)

- **RN-080** — **Chat interno** 1:1 entre interessado e anunciante, sempre vinculado a um anúncio. Suporta texto e imagens.
- **RN-081** — O botão de **WhatsApp** só aparece se o anunciante habilitou e abre `wa.me` com mensagem pré-preenchida citando o anúncio. O número não é exibido em texto no anúncio.
- **RN-082** — O usuário pode **bloquear** outro usuário (encerra o chat e oculta anúncios mutuamente).
- **RN-083** — O usuário pode **favoritar** anúncios. Se um favorito for alterado (preço) ou estiver perto de expirar, o usuário pode ser notificado.
- **RN-084** — Limite antispam de **20 novas conversas por dia** por usuário `[configurável]`.
- **RN-085** — Mensagens passam por filtro automático (palavrões, golpes conhecidos, links suspeitos). Mensagens com links externos exibem aviso de segurança.
- **RN-086** — **Indicar:** o morador pode indicar um anúncio que consegue ver (1 indicação por pessoa por anúncio, pode desfazer). O anúncio mostra "X vizinhos indicam". O dono não indica o próprio anúncio.
- **RN-087** — **Avaliar o anunciante:** nota de 1 a 5 e comentário opcional (até 500 caracteres, sem links nem termos barrados pela moderação). Só avalia quem conversou com o anunciante pelo chat **e recebeu resposta**; uma avaliação por pessoa avaliada, que pode ser editada ou apagada. A média e as avaliações aparecem no anúncio e no perfil do anunciante, para quem enxerga algum anúncio dele ou já conversou com ele. Bloqueio entre os dois impede avaliar. O anunciante é notificado da nova avaliação.
- **RN-088** — **Compartilhar:** o anúncio pode ser compartilhado pelo menu do celular, pelo WhatsApp ou copiando o link; o link só abre para quem tem conta e pode ver o anúncio.

## 2.6 Moderação e denúncias (RN-090 a RN-109)

- **RN-090** — **Moderação automática por IA** em todo anúncio publicado/editado (texto + imagens), classificando em `aprovado`, `revisar` ou `proibido`.
- **RN-091** — Conteúdo proibido: itens ilegais (drogas, armas, medicamentos controlados), conteúdo adulto/sexual, animais silvestres, serviços financeiros duvidosos/pirâmides, jogos de azar, discurso de ódio, dados pessoais de terceiros, anúncios enganosos e falsificações.
- **RN-092** — Qualquer usuário pode **denunciar** um anúncio, usuário ou mensagem, escolhendo um motivo (golpe, conteúdo impróprio, spam, item proibido, outro).
- **RN-093** — Anúncio com **3 denúncias de usuários distintos** `[configurável]` é ocultado automaticamente e enviado para revisão manual.
- **RN-094** — *(removida em 17/10/2026: não existe mais administrador do prédio.)* Moradores apenas denunciam (RN-093).
- **RN-095** — Sanções progressivas: 1ª infração → aviso; 2ª → suspensão de publicação por 7 dias; 3ª → banimento. Infrações graves (golpe, conteúdo ilegal) → banimento imediato.
- **RN-096** — O usuário afetado é notificado do motivo e pode **contestar** uma vez por decisão.

## 2.7 Limites de uso da IA (RN-110 a RN-119)

- **RN-110** — Gerações de anúncio por IA: **10 por usuário por dia** `[configurável]`.
- **RN-111** — Imagens enviadas para a IA são redimensionadas (máx. 1568 px no maior lado) antes do envio, para reduzir custo.
- **RN-112** — Validações de prédio por IA: **1 por criação + 1 reenvio** (RN-029); revalidações por edição (RN-032) contam no limite de quem cadastrou o prédio.
- **RN-113** — Se o serviço de IA estiver indisponível: a criação manual de anúncio continua funcionando; prédios novos ficam `pendente_revisao` (fila manual); anúncios ficam `em_moderacao` até a moderação ser processada (fila com reprocessamento).

## 2.8 Notificações (RN-120 a RN-129)

- **RN-120** — Canais: push (Web Push via PWA), e-mail e central de notificações no app.
- **RN-121** — Eventos notificados: nova mensagem; anúncio aprovado/removido; anúncio perto de expirar; vínculo aprovado/recusado; prédio verificado/rejeitado; novo anúncio no meu prédio (resumo diário, opt-in); alerta de busca; favorito alterado.
- **RN-122** — O usuário controla cada tipo de notificação nas preferências. Notificações não essenciais respeitam "horário silencioso" (padrão 22h–8h).

## 2.9 Privacidade e LGPD (RN-130 a RN-139)

- **RN-130** — Dados exibidos publicamente (para outros moradores): nome de exibição, foto, prédio (nome), bairro, selo de verificado, data de entrada. **Nunca**: unidade, telefone, e-mail, endereço completo para outros prédios.
- **RN-131** — Localização do navegador é usada apenas no momento da busca de prédio e não é armazenada.
- **RN-132** — Imagens enviadas têm **metadados EXIF removidos** (inclui GPS) antes de serem armazenadas.
- **RN-133** — O usuário pode exportar seus dados (portabilidade) em JSON.
- **RN-134** — Conteúdo enviado à IA não é usado para treinar modelos (configuração do provedor) e o uso de IA é informado na Política de Privacidade.

## 2.10 Planos e assinatura (RN-140 a RN-149)

- **RN-140** — Há dois planos: **Free** (padrão, grátis) e **Pro** (assinatura mensal, **R$ 50** `[configurável]` — o valor cobrado é o do preço cadastrado no Stripe). A assinatura é feita pelo **Stripe Checkout** e gerenciada no portal do cliente do Stripe (cartão, notas, cancelamento).
- **RN-141** — **Free:** raio máximo de **1 km** `[configurável]`, **sem destaque**, anúncios saem do ar em **30 dias** (renovação grátis, RN-063).
- **RN-142** — **Pro:** raio máximo de **10 km** `[configurável]`.
- **RN-143** — **Pro:** anúncios **não expiram** enquanto a assinatura estiver valendo.
- **RN-144** — **Pro:** **1 anúncio em destaque** `[configurável]` por vez, fixado no topo do feed de quem pode vê-lo, com o selo "Destaque". Destacar outro anúncio tira o destaque do anterior.
- **RN-145** — O Pro vale com a assinatura `active`, `trialing` ou `past_due` (o Stripe ainda está tentando cobrar). Ao voltar para o Free, os anúncios passam às regras do Free na hora: raio reduzido a 1 km, destaque retirado e prazo de 30 dias contado a partir da troca. O usuário é notificado.
- **RN-146** — O estado da assinatura chega por **webhook assinado** do Stripe; o app sempre consulta a assinatura atual no Stripe antes de mudar o plano (eventos repetidos ou fora de ordem não causam erro). Excluir a conta cancela a assinatura na hora (RN-008).

