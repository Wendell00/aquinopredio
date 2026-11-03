# 7. Roadmap de implementação

## Como usar este roadmap

Cada fase termina com uma entrega testável. Não iniciar várias mudanças estruturais ao mesmo tempo. Dentro de cada fase, preservar as funcionalidades atuais que não forem explicitamente substituídas.

## Fase 0 — estabilizar a base

Objetivo: remover riscos que podem corromper estado ou esconder regressões.

- garantir migrações antes da autenticação;
- proteger moderação e validação de prédio contra respostas atrasadas;
- corrigir sincronização dos testes assíncronos;
- fazer formatação, lint, tipos, testes e build passarem;
- classificar alertas de dependência;
- documentar variáveis e comandos reais do monorepo.

Saída: base atual reproduzível, sem mudança comercial ampla.

## Fase 1 — motor de planos e ciclo de vida

Objetivo: estabelecer a fundação comum das demais funcionalidades.

- adicionar Business e preços mensais definitivos;
- centralizar capacidades e cotas;
- separar cotas por tipo e por condomínio;
- limitar condomínios simultâneos de publicação em 3/5/10 e aplicar reserva atômica das duas franquias;
- remover destaque, “subir anúncio”, produto indicado e diferenças de validade;
- unificar expiração em 30 dias e renovação gratuita;
- implantar consumo mensal de IA com ledger;
- preparar downgrade, seleção de itens e jobs idempotentes.
- permitir que o downgrade selecione primeiro os condomínios mantidos e depois as publicações locais.

Saída: a API é a fonte de verdade dos benefícios Free/Pro/Business.

## Fase 2 — condomínio, endereço e convites

Objetivo: tornar confiável a unidade geográfica da plataforma.

- normalizar endereço completo e tratar CEP municipal único;
- integrar geocodificação com precisão e evidências;
- deduplicar condomínio;
- aplicar cota cumulativa 3/7/20 e antispam;
- implementar estados de validação e revisão;
- criar convite seguro que sobreviva ao onboarding.

Saída: entrada no condomínio correta e auditável.

## Fase 3 — moderação completa

Objetivo: colocar todo conteúdo publicável sob uma política coerente.

- versionar política, conteúdo e decisões;
- incluir indicação, atributos, variações, planilhas e imagens;
- adicionar categorias ofensivas, políticas e ilegais aprovadas;
- criar fila de revisão humana e recurso;
- garantir que falha não aprove e resposta obsoleta não escreva;
- separar custo interno da franquia de IA.

Saída: nenhuma rota publica conteúdo sem moderação aplicável.

## Fase 4 — alcance, distância e `Procuro`

Objetivo: implementar a autorização geográfica definitiva.

- centralizar política de acesso por distância;
- oferecer raios 0/0,5/1/2/3/5/10 km nos anúncios comuns;
- exibir mesmo condomínio ou distância aproximada;
- aplicar regras em lista, detalhe, favorito e contato;
- especializar `Procuro` pelo plano do visitante;
- reduzir alcance em downgrade e preservar conversas existentes.
- implementar compartilhamento de publicação ativa, retorno após autenticação e exceção de distância limitada a um único anúncio.

Saída: links diretos comuns e endpoints não contornam o alcance; convites válidos aplicam somente a exceção documentada.

## Fase 5 — atributos e variações

Objetivo: representar opções simples de produto sem criar um e-commerce.

- criar catálogo oficial e itens privados;
- semear o catálogo inicial aprovado;
- implementar dois eixos, vinte combinações e limites de imagens;
- calcular preço de exibição;
- exigir variação antes do contato;
- aplicar bloqueio e retenção de 60 dias no downgrade para Free.

Saída: produto variável completo para Pro e Business.

## Fase 6 — importação em lote

Objetivo: acelerar o cadastro pago mantendo revisão e controle.

- gerar modelos XLSX/CSV;
- processar, validar e exibir prévia assíncrona;
- criar e atualizar por código estável;
- confirmar de forma idempotente em rascunho;
- importar ZIP de fotos com proteção;
- aplicar retenção, limpeza e moderação.

Saída: lote nunca publica automaticamente e nunca duplica por repetição.

## Fase 7 — login social completo

Objetivo: lançar com os três métodos de acesso definidos.

- preservar Google e e-mail/senha;
- adicionar Apple;
- adicionar telefone pessoal único, OTP, carência de cinco dias e bloqueio em tempo real;
- migrar contas existentes com nova carência e avisos idempotentes;
- tratar vinculação e ausência de e-mail com segurança;
- criar gerenciamento dos métodos de acesso;
- validar credenciais e URLs de produção;
- cobrir convite + SSO + onboarding ponta a ponta.

Saída: e-mail/senha, Google e Apple operacionais em ambiente público HTTPS, com todas as contas sujeitas à identidade telefônica verificada.

## Fase 8 — preparação de lançamento

Objetivo: comprovar a jornada completa e a operação.

- executar todos os critérios de aceite;
- revisar acessibilidade, privacidade e textos de erro;
- testar upgrade, cancelamento e webhooks de pagamento;
- configurar filas, retentativas, métricas, alertas e painéis;
- ensaiar backup, restauração e rollback de migrações;
- testar carga de feed, moderação, planilha e imagens;
- publicar política de conteúdo, termos e privacidade;
- confirmar que não existem assinantes de preço antigo antes de trocar produtos do Stripe.

Saída: checklist de go-live assinado e plano de resposta a incidentes.

## Dependências críticas

- Fases 0 e 1 precedem todas as demais.
- Endereço confiável da Fase 2 precede a autorização geográfica da Fase 4.
- Moderação da Fase 3 precisa aceitar novos tipos antes das Fases 5 e 6 irem a produção.
- Variações da Fase 5 precedem importação completa da Fase 6.
- Apple exige cadastro e credenciais externas; iniciar esse provisionamento com antecedência, mesmo que o código seja entregue na Fase 7.

## Não incluir sem nova decisão

- pagamento e checkout entre usuários;
- entrega, frete ou estoque;
- painel de publicidade;
- destaque ou impulsionamento;
- indexação pública individual dos anúncios;
- atributos globais criados automaticamente por usuários;
- acesso baseado em GPS contínuo;
- produto indicado.
