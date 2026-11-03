# 2. Planos, preços e limites

## 2.1 Matriz comercial definitiva

| Benefício | Free | Pro | Business |
|---|---:|---:|---:|
| Preço mensal | R$ 0,00 | R$ 29,90 | R$ 59,90 |
| Novos condomínios criados pela conta | 3 | 7 | 20 |
| Condomínios simultâneos com publicações ativas ou em moderação | 3 | 5 | 10 |
| Produtos ativos ou em moderação, por condomínio | 1 | 20 | 50 |
| Serviços ativos ou em moderação, por condomínio | 1 | 20 | 50 |
| Indicações de serviço ativas ou em moderação, por condomínio | 1 | 20 | 50 |
| Publicações `Procuro` ativas ou em moderação, por condomínio | 1 | 10 | 25 |
| Usos mensais de IA pelo usuário | 0 | 10 | 30 |
| Importação de produtos por XLSX/CSV | Não | Sim | Sim |
| Atributos e variações de produto | Não | Sim | Sim |
| Alcance máximo de anúncio comum | 1 km | 5 km | 10 km |
| Alcance para descobrir e responder `Procuro` | 1 km | 5 km | 10 km |
| Chat interno | Sim | Sim | Sim |
| Autor pode habilitar contato por WhatsApp | Não | Sim | Sim |
| Compartilhar publicação ativa por WhatsApp | Sim | Sim | Sim |
| Telefone pessoal único e verificado | Obrigatório | Obrigatório | Obrigatório |
| Foto de perfil | Sim | Sim | Sim |

## 2.2 Natureza dos limites

### Condomínios

O limite de criação de condomínio é **cumulativo por conta**, não mensal. Entrar em um prédio já existente ou pedir vínculo não consome o limite.

Uma solicitação rejeitada por endereço inválido ou uma duplicidade reconhecida não consome definitivamente uma vaga. Tentativas continuam sujeitas a controle de abuso.

Esse limite é diferente do limite de **condomínios de publicação**, que é simultâneo: Free pode manter publicações ativas ou em moderação em até 3 prédios, Pro em até 5 e Business em até 10. Apenas entrar, acompanhar ou navegar em um condomínio não ocupa essa franquia.

Um condomínio começa a ocupar uma vaga quando sua primeira publicação entra em moderação ou fica ativa. A vaga é liberada quando não restar nele nenhuma publicação nesses dois estados.

### Publicações

As cotas são independentes por tipo **e aplicadas separadamente em cada condomínio de publicação**. Um produto não consome vaga de serviço, indicação ou `Procuro`, e a cota usada em um prédio não reduz a cota interna de outro prédio. O total máximo da conta continua limitado pela quantidade de condomínios permitida pelo plano.

Contam para a cota:

- publicação ativa;
- publicação aguardando moderação.

Não contam:

- rascunho;
- pausada;
- expirada;
- rejeitada ou removida;
- excluída.

Uma publicação com várias variações continua contando como um único produto.

Cada publicação pertence a um único condomínio. Copiar a mesma oferta para outro prédio cria outra publicação, que consome uma vaga da categoria naquele prédio e passa por moderação. A primeira versão não oferece publicação automática em massa para vários prédios.

### Teto teórico da matriz

Se uma conta usar todas as categorias em todos os condomínios permitidos, os máximos simultâneos serão:

| Plano | Produtos | Serviços | Indicações | `Procuro` | Total dos quatro tipos |
|---|---:|---:|---:|---:|---:|
| Free | 3 | 3 | 3 | 3 | 12 |
| Pro | 100 | 100 | 100 | 50 | 350 |
| Business | 500 | 500 | 500 | 250 | 1.750 |

Esses totais são consequência matemática das cotas por prédio, não uma quinta cota. Os parâmetros devem permanecer configuráveis e ser acompanhados por métricas de moderação, armazenamento e abuso para futura calibração comercial.

### IA

As cotas de IA são mensais e configuráveis. Um uso é consumido somente quando a solicitação de geração ou melhoria entrega resultado utilizável. Falha técnica não consome.

Não consomem a franquia do usuário:

- moderação da plataforma;
- validação de condomínio;
- mecanismos antifraude e antispam.

A primeira versão não inclui IA de criação para `Procuro`.

## 2.3 Funcionalidades removidas da oferta

As seguintes funcionalidades não devem aparecer na matriz comercial nem interferir na ordenação:

- indexação pública especial do anúncio em buscadores;
- destaque pago;
- “subir anúncio” ou renovação de posição;
- anúncio sem prazo de expiração.

A busca interna continua disponível a todos e pode usar título, descrição, categoria e termos normalizados.

Compartilhar uma publicação ativa é universal e não deve ser confundido com o botão de contato do anunciante. O primeiro envia um convite para a plataforma; o segundo abre o número de WhatsApp habilitado pelo autor Pro ou Business.

## 2.4 Telefone obrigatório

A exigência independe do plano. A conta pode usar a plataforma durante os cinco primeiros dias com avisos de pendência. Ao vencer o prazo sem verificação, fica bloqueada até concluir o processo. O bloqueio não cancela assinatura nem apaga conteúdo.

O telefone de perfil verificado é único por conta. Telefones de prestadores indicados não são identificadores de usuário e não participam dessa restrição.

## 2.5 Expiração e renovação

Todas as publicações expiram após 30 dias em qualquer plano. A renovação por mais 30 dias é gratuita, mas exige vaga na cota daquele tipo.

Conteúdo alterado ou denunciado deve voltar à moderação. Uma renovação sem mudança material pode seguir validação simplificada.

## 2.6 Downgrade

Na data de efetivação do downgrade:

- o alcance dos anúncios é reduzido imediatamente ao novo máximo;
- o novo alcance reduzido é persistido;
- um upgrade futuro não restaura o alcance anterior automaticamente;
- o usuário recebe um resumo único das consequências;
- o usuário escolhe previamente quais publicações permanecerão ativas dentro de cada cota;
- sem escolha, permanecem as mais recentemente ativadas, e as demais são pausadas.

Quando o novo plano também reduz a quantidade de condomínios de publicação, o usuário escolhe primeiro quais prédios permanecerão ativos. Sem escolha, permanecem os condomínios com atividade publicável mais recente. Depois, as cotas por tipo são aplicadas dentro de cada prédio mantido.

Ao cair para o Free, produtos com variações:

- ficam invisíveis, desativados e somente para leitura;
- permanecem recuperáveis por 60 dias;
- geram avisos no início, aos 30 dias restantes, aos 7 dias e a 1 dia;
- são apagados ao final do período, junto com variações e imagens sem outro uso;
- preservam somente o registro mínimo necessário a histórico, auditoria e conversas;
- não são reativados automaticamente após novo upgrade.

## 2.7 Parâmetros configuráveis

Preços, cotas, raios, usos de IA, prazos e limites operacionais devem estar centralizados em configuração/versionamento de benefícios. A aplicação não deve espalhar números fixos pela interface e pelo servidor.
