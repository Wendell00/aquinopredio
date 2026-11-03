# Aqui no Prédio — documentação definitiva da primeira versão

Versão: 1.4\
Data de consolidação: 26/10/2026\
Estado: regras de produto aprovadas; implementação ainda deve ser confrontada com esta especificação.

## Finalidade deste pacote

Este diretório é a fonte de verdade para a evolução da primeira versão pública do Aqui no Prédio. Em caso de conflito com documentos exploratórios anteriores, prevalece este pacote.

Ele distingue três coisas:

- **produto aprovado**: comportamento que a plataforma deverá oferecer;
- **estado atual**: capacidade já encontrada no código analisado;
- **trabalho pendente**: mudança necessária para que o código cumpra o produto aprovado.

## Documentos

1. [Documentação completa do produto](DOCUMENTACAO-COMPLETA.md)
2. [Visão e escopo](01-visao-e-escopo.md)
3. [Planos, preços e limites](02-planos-e-limites.md)
4. [Regras de negócio](03-regras-de-negocio.md)
5. [Fluxos funcionais](04-fluxos-funcionais.md)
6. [Especificação técnica](05-especificacao-tecnica.md)
7. [Critérios de aceite](06-criterios-de-aceite.md)
8. [Roadmap de implementação](07-roadmap-de-implementacao.md)
9. [Prompts para o Claude Code](08-prompts-claude-code.md)
10. [Catálogo inicial de atributos](09-catalogo-inicial-de-atributos.md)
11. [Matriz de rastreabilidade](10-matriz-de-rastreabilidade.md)
12. [Guia de implementação com Context Engineering, VS Code e Claude Code](11-guia-context-engineering-vscode-claude-code.md)

## Escopo comercial confirmado

- Free: gratuito.
- Pro: R$ 29,90 por mês.
- Business: R$ 59,90 por mês.
- Anúncios de produto e serviço, publicações `Procuro` e indicações de serviço.
- Produto indicado foi removido do escopo.
- Destaque pago, “subir anúncio” e exposição pública em buscadores foram removidos da primeira versão.
- Login por e-mail e senha, Google e Apple desde o lançamento, com telefone pessoal único e verificado em até cinco dias.
- Compartilhamento de publicações ativas por WhatsApp, com retorno ao anúncio após autenticação e acesso pontual independente do raio.

## Situação do código analisado

O monorepo possui uma base real e significativa: interface em Next.js/React, API em NestJS, banco PostgreSQL/PostGIS, autenticação com Better Auth, pagamentos, armazenamento de imagens, chat, anúncios, moderação e geolocalização. Entretanto, ele **não está pronto para produção** e ainda não implementa integralmente estas regras.

Antes das evoluções comerciais, devem ser corrigidos os problemas de concorrência e inicialização registrados no diagnóstico original, especialmente autenticação antes das migrações e rotinas atrasadas capazes de sobrescrever decisões mais recentes.

| Área | Encontrado no código | Objetivo desta versão |
|---|---|---|
| Planos | Free e Pro parciais | Free, Pro e Business com nova matriz |
| Publicações | Produto, serviço e bases correlatas | cotas por tipo e por condomínio, limite de condomínios de publicação, validade e downgrade definitivos |
| Distância | base geográfica existente | autorização uniforme e regra própria de `Procuro` |
| Moderação | base de IA existente | política completa, versionada e segura contra concorrência |
| Variações | não atende à regra final | catálogo, combinações, preço e foto por variação |
| Importação | não atende à regra final | XLSX, CSV e ZIP com prévia e rascunho |
| Login social | Google existente | Google e Apple |
| Identidade telefônica | não validada na regra anterior | um telefone verificado por conta, único na plataforma, com bloqueio após cinco dias |
| Convite | não encontrado | convite de condomínio preservado no onboarding |
| Compartilhamento | não validado na base atual | convite de publicação ativa com retorno após login e exceção pontual de distância |

Não há pendência de decisão comercial conhecida neste pacote. Limites operacionais marcados como configuráveis podem ser calibrados com dados reais sem alterar a proposta dos planos.

## Convenções

- “Publicação” abrange produto, serviço, `Procuro` e indicação de serviço.
- “Anúncio comum” abrange produto, serviço e indicação de serviço, cujo alcance é escolhido pelo autor.
- “Plano atual” é o plano efetivo no momento da operação, não o plano existente quando o anúncio foi criado.
- “Condomínio de publicação” é um prédio onde a conta possui pelo menos uma publicação ativa ou em moderação; não representa comprovação de residência.
- “Mesmo condomínio” é determinado pelo identificador interno do prédio, e não apenas por distância.
- Distâncias são aproximadas e calculadas entre as coordenadas dos condomínios.
- “Link direto comum” continua sujeito ao raio; somente um convite de compartilhamento válido concede a exceção para uma publicação específica.

## Controle de mudanças

Toda nova decisão de negócio deve atualizar, no mínimo:

1. a regra correspondente em `03-regras-de-negocio.md`;
2. os critérios relacionados em `06-criterios-de-aceite.md`;
3. o prompt afetado em `08-prompts-claude-code.md`;
4. a versão e a data deste índice.
