# 8. Prompts para o Claude Code

## Instruções de uso

Execute **um prompt por vez**, na ordem do roadmap. Abra o Claude Code na raiz `aquinopredio`. Os documentos definitivos ficam em `docs/product/`.

Antes do primeiro prompt, confirme que o código está versionado ou faça uma cópia segura. Cada prompt exige implementação, testes e um resumo final. Não peça ao Claude para reescrever o projeto inteiro.

### Prefixo opcional para todos os prompts

Use este bloco somente se o Claude estiver perdendo contexto:

```text
Trabalhe no monorepo atual. Antes de editar, leia AGENTS.md/CLAUDE.md se existirem e somente os documentos definitivos citados neste prompt. Preserve mudanças existentes, use as convenções do projeto, crie migrações versionadas e nunca use migração automática do Better Auth. Não altere funcionalidades fora do escopo. Ao final, rode os checks relevantes e reporte arquivos alterados, decisões, testes e pendências reais.
```

## P00 — estabilização da base

```text
Implemente a Fase 0 descrita em docs/product/07-roadmap-de-implementacao.md e considere a seção 5.16 de docs/product/05-especificacao-tecnica.md. Primeiro reproduza cada problema no código atual. Corrija: ordem migrações/autenticação; callbacks atrasados de validação de prédio e moderação; sincronização de testes assíncronos; falhas de Biome. Faça triagem dos alertas de dependências sem upgrades amplos desnecessários. Não implemente ainda novos planos. Adicione testes de regressão para decisões obsoletas e exclusão durante moderação. Entregue checks executados e riscos restantes.
```

## P01 — planos, cotas, validade e IA

```text
Implemente a matriz de docs/product/02-planos-e-limites.md e as regras RN-PLAN, RN-ADS, RN-AI e RN-DWN. Preserve a diferença entre criação cumulativa de prédios 3/7/20 e condomínios simultâneos de publicação 3/5/10. Cotas de Produto, Serviço, Indicação e Procuro são por condomínio. Reserve atomicamente a cota local e a vaga do prédio ao entrar em moderação/ativo; libere a vaga do prédio quando sair a última publicação contabilizável. Vínculo, navegação e rascunho não contam. Centralize Free/Pro/Business, preços 29,90/59,90, validade de 30 dias, renovação e ledger de IA 10/30. Remova destaque, subir anúncio e produto indicado. Crie migrações e testes concorrentes para o 4º/6º/11º prédio e para cotas locais. Não implemente variações/importação ainda.
```

## P02 — downgrade completo

```text
Implemente o fluxo 4.12 e RN-DWN. Permita escolher primeiro quais condomínios continuam publicando dentro de 3/5/10 e depois quais publicações ficam ativas por tipo e por prédio. Sem escolha, preserve prédios com atividade publicável mais recente e, dentro deles, os anúncios mais recentes. Pause excedentes, reduza/persista alcance, gere resumo único e torne o job idempotente. Prepare a política de 60 dias para produtos com variações. Upgrade cancela exclusão agendada, sem reativar conteúdo. Teste Business→Pro, Pro→Free, repetição de webhook/job e corrida com novas ativações.
```

## P03 — endereço, validação e convite

```text
Implemente RN-BLD e os fluxos 4.2/4.3. A identificação precisa usar CEP, logradouro, número, cidade/UF e coordenadas, inclusive em cidades com CEP único. Normalize, geocodifique, detecte duplicidade e guarde evidências/precisão. Aplique criação cumulativa 3/7/20 sem cobrar vínculo, duplicidade ou rejeição inválida, mas com rate limit. Condomínio incerto vai para revisão e não alcança outros prédios. Crie link de convite seguro, revogável e com validade, preservado por login/cadastro/onboarding. Cubra os critérios 6.2 com testes.
```

## P04 — moderação segura e completa

```text
Implemente RN-MOD e o fluxo 4.13, usando docs/product/05-especificacao-tecnica.md#57-moderação-assíncrona. Unifique a política para produto, serviço, Procuro, indicação, texto e imagens; deixe interfaces extensíveis para atributos/importação. Adicione categorias proibidas aprovadas, resultados approved/review/prohibited, limiares configuráveis, fila humana, motivo curto, correção e recurso. Em produção, falha nunca aprova. Use contentVersion/hash e compare-and-set para descartar resposta obsoleta e respeitar decisão humana/exclusão. Separe essas chamadas da cota de IA do usuário. Adicione testes de corrida.
```

## P05 — alcance, `Procuro` e compartilhamento

```text
Implemente RN-GEO, RN-WNT, RN-COM e RN-SHR. Crie uma política central de autorização geográfica. Produto, serviço e indicação usam raio escolhido 0/0,5/1/2/3/5/10 km limitado pelo plano do autor; padrão mesmo condomínio. Procuro não tem raio salvo: o plano do visitante define 1/5/10 km. Origem/destino são os prédios da publicação e do contexto ativo. Aplique no feed, busca, detalhe, favorito, chat, WhatsApp e URL comum. Sem coordenadas ou prédio não verificado, apenas mesmo prédio. Preserve conversas já iniciadas. Adicione Compartilhar somente em publicação ativa, com WhatsApp/Web Share/cópia e convite opaco. Anônimo autentica sem ver conteúdo e retorna ao anúncio; convite válido ignora somente distância para aquela publicação e interação, sem liberar feed ou outras regras. Revogue ao sair de ACTIVE e não exponha conteúdo a buscadores. Cubra 6.3, 6.4 e 6.13.
```

## P06 — catálogo e variações de produto

```text
Implemente RN-VAR usando docs/product/09-catalogo-inicial-de-atributos.md. Crie catálogo oficial por categoria e itens privados por usuário, com snapshots. Pro/Business: até 2 eixos, 10 valores por eixo, 20 combinações, 6 fotos gerais, 2 associações por variação e 20 arquivos únicos. Uma imagem pode ser reutilizada; galeria geral é fallback. SKU manual opcional. Preço por variação somente em preço fixo e resumo “A partir de”. Exija combinação completa antes de chat/WhatsApp e grave o contexto. Integre moderação e a retenção de downgrade. Faça migrações, seed idempotente e testes de 6.5.
```

## P07 — importação XLSX e CSV

```text
Implemente RN-IMP e o fluxo 4.9, sem ZIP nesta etapa. Pro permite 20 produtos/400 linhas; Business 50/1000. Gere XLSX principal e CSV UTF-8 com BOM e separador ponto e vírgula para Excel PT-BR. Siga o contrato de colunas da seção 5.9. Uma linha por variação; codigo_produto e codigo_variacao são obrigatórios, usando UNICA sem variação. A chave é usuário+prédio+código. Faça processamento assíncrono, validação por linha, prévia New/Update/Error, confirmação idempotente e criação/atualização apenas como rascunho. Nunca associe por título nem exclua por ausência. Aplique retenção de 7/30 dias, cota e moderação. Proteja contra fórmulas/macros. Cubra 6.6.
```

## P08 — fotos por ZIP

```text
Adicione ao fluxo de importação o ZIP de fotos de RN-IMP-012 e seções 4.10/5.10. Aceite CODIGOPRODUTO__GERAL__NN e CODIGOPRODUTO__CODIGOVARIACAO__NN. Mostre prévia de associados, órfãos e excedentes antes de confirmar. Rejeite zip slip, links, tipos falsos, excesso de entradas, tamanho/expansão abusivos e imagens fora dos limites. Remova metadados, normalize nomes, reutilize arquivo físico e limpe órfãos. Não publique automaticamente. Cubra 6.7.
```

## P09 — telefone, Apple e métodos de acesso

```text
Implemente RN-AUTH e RN-PHN mantendo Better Auth, Google e e-mail/senha. Primeiro implemente telefone E.164 único após confirmação, criptografado e identificado por HMAC único, OTP temporário com rate limit e troca verificada. Conta nova tem cinco dias; contas existentes recebem cinco dias da ativação. Use guard em tempo real e job idempotente: bloqueado só acessa verificação/segurança permitida/suporte/logout, fica invisível e sem novos contatos, mas estados, cotas, validade e cobrança permanecem. Verificação restaura somente conteúdo ainda elegível. WhatsApp próprio usa o número verificado; telefone de indicação fica separado. Depois adicione Apple conforme 5.13, preservando Google e credenciais locais. Crie Perfil > Segurança > Métodos de acesso e impeça remover o último. Preserve convites de condomínio/publicação por senha e OAuth, incluindo a etapa de telefone. Migrações somente pelo repositório. Cubra 6.10, 6.13 e 6.14, inclusive corrida de confirmação do mesmo número.
```

## P10 — indicação de serviço e WhatsApp

```text
Revise indicação de serviço contra RN-PLAN-003, RN-COM e RN-MOD. Remova totalmente indicação de produto. A indicação tem cota própria 1/20/50, expira em 30 dias, usa alcance comum e passa por moderação. Se o contato for de terceiro, exija consentimento explícito e registre data/versão do aceite. WhatsApp é benefício do autor Pro/Business; qualquer visitante autorizado pode clicar. Garanta a regra em API e interface e adicione testes de permissão, downgrade e remoção de consentimento.
```

## P11 — integração e auditoria de lançamento

```text
Faça uma auditoria final sem adicionar escopo. Leia todo docs/product e confronte cada RN e cenário de 06-criterios-de-aceite.md com o código. Gere uma matriz regra -> arquivos -> testes -> status. Corrija lacunas pequenas; para lacunas grandes, reporte sem improvisar regra. Rode instalação limpa, migrações, lint, tipos, testes, build e jornadas E2E críticas. Verifique segurança de arquivos, tokens, cookies, webhooks, concorrência, logs e jobs idempotentes. Confirme que preços antigos do Stripe não têm assinantes reais antes de qualquer substituição. Entregue checklist de go-live e rollback.
```

## Formato de resposta recomendado ao Claude

Para economizar tokens nas iterações seguintes, peça que finalize cada etapa com:

```text
Resumo em até 20 linhas: objetivo entregue; arquivos/migrações principais; testes executados e resultado; decisões técnicas relevantes; pendências ou riscos reais. Não repita a especificação.
```
