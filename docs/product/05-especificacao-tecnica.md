# 5. Especificação técnica

Este documento orienta a evolução do monorepo existente. Nomes finais de tabelas e classes podem seguir o padrão atual, mas os comportamentos abaixo são obrigatórios.

## 5.1 Princípios de implementação

- PostgreSQL e PostGIS permanecem como fonte transacional e geográfica.
- Migrações versionadas do repositório são a única forma de alterar esquema.
- O migrador automático do Better Auth não deve ser executado em produção.
- Regras de autorização, plano, cota e distância ficam no servidor e são reutilizadas por todos os endpoints.
- Operações concorrentes usam transação, bloqueio adequado ou restrição única.
- Jobs são idempotentes, verificam a versão atual do registro antes de escrever e mantêm trilha de auditoria.
- Arquivos são privados por padrão e entregues por URLs temporárias/autorizadas.
- Números comerciais não devem ser duplicados em vários módulos.

## 5.2 Capacidades de plano

Criar uma representação central de benefícios, por exemplo:

- `buildingCreationLimit`;
- `publishingBuildingLimit`;
- `publicationQuota` por tipo;
- `userAiMonthlyLimit`;
- `maxRadiusKm`;
- `batchImportEnabled`;
- `variationsEnabled`;
- `whatsAppEnabled`.

A API retorna as capacidades efetivas ao cliente. `publicationQuota` é avaliada por `(userId, originBuildingId, publicationType)`, enquanto `publishingBuildingLimit` é avaliado por usuário. Toda mutação resolve o plano atual no servidor. Testes devem garantir paridade entre o resumo mostrado e a autorização aplicada.

## 5.3 Estados de publicação

Modelo conceitual:

- `DRAFT`;
- `PENDING_MODERATION`;
- `ACTIVE`;
- `PAUSED`;
- `EXPIRED`;
- `REJECTED`;
- `REMOVED`;
- `DELETED`.

Transições devem ser explícitas. A entrada em `PENDING_MODERATION` ou `ACTIVE` reserva atomicamente a cota local e, se necessário, a vaga do condomínio. Rejeição, pausa, expiração ou remoção libera a cota local e libera a vaga do prédio quando não houver outra publicação contabilizável, sem perder o histórico necessário.

Campos recomendados:

- `activatedAt`;
- `expiresAt`;
- `renewedAt`;
- `contentVersion`;
- `moderatedVersion`;
- `originBuildingId`;
- `configuredRadiusKm` para tipos comuns;
- `statusReasonCode`;
- `deletedAt` quando houver exclusão lógica.

## 5.4 Distância e autorização

Usar coordenadas do condomínio e funções PostGIS adequadas para distância em metros. A política central recebe:

- tipo da publicação;
- prédio de origem e sua verificação;
- prédio ativo do visitante;
- plano atual do autor;
- plano atual do visitante;
- alcance salvo, quando aplicável;
- estado da publicação;
- existência de conversa anterior, para continuidade.

Para Produto, Serviço e Indicação, o limite efetivo é `min(alcance_salvo, alcance_plano_autor)`. Para `Procuro`, não existe alcance salvo: o limite vem do plano do visitante.

Cada registro publicável possui um único `originBuildingId`. Uma oferta copiada para outro prédio recebe outro identificador de publicação e usa as coordenadas dessa nova origem.

Aplicar a política em consultas de lista e novamente nas ações por identificador. Não criar tabela com todas as combinações usuário-publicação.

## 5.5 Condomínio e endereço

Guardar componentes normalizados, endereço de exibição, coordenadas, fonte da geocodificação, precisão e estado de verificação.

A deduplicação deve combinar:

- CEP normalizado;
- cidade/UF;
- logradouro normalizado;
- número normalizado;
- proximidade geográfica com tolerância conservadora;
- identificador do provedor, quando existir.

Não aprovar automaticamente quando número, cidade ou precisão forem incompatíveis. Registrar evidências e versão dos provedores usados.

## 5.6 Convites

Persistir somente hash do token, com:

- condomínio;
- criador;
- validade;
- limite de usos, se aplicável;
- revogação;
- contador/registro de uso.

O navegador mantém um identificador de intenção curto durante autenticação. A confirmação do vínculo acontece no servidor, com proteção contra reutilização e enumeração.

## 5.7 Moderação assíncrona

Cada solicitação deve carregar `entityId`, `contentVersion`, hash do conteúdo e motivo. Ao concluir:

1. carregar novamente a entidade;
2. comparar versão/hash;
3. verificar se ainda está em estado moderável;
4. respeitar decisão humana mais recente;
5. aplicar resultado com comparação atômica;
6. registrar modelo, política, confiança, categorias e decisão.

Uma resposta obsoleta é descartada. Exclusão e decisão humana jamais são revertidas por callback atrasado.

## 5.8 Atributos e variações

Modelo conceitual:

- catálogo oficial de atributos;
- catálogo oficial de valores;
- associação atributo-categoria;
- atributo privado por usuário;
- valor privado por usuário;
- atributo escolhido no anúncio com snapshot de rótulo;
- variação com combinação canônica, preço, SKU opcional, estado e ordem;
- associação de imagens gerais e por variação.

Requisitos de integridade:

- combinação canônica única por produto;
- no máximo dois eixos e vinte combinações;
- itens privados pertencem ao autor;
- somente um eixo `define_foto`;
- preço monetário em unidade inteira de centavos;
- imagem física deduplicada e exclusão somente quando não referenciada.

## 5.9 Importação

Entidades conceituais:

- sessão de importação;
- arquivo original temporário;
- linha normalizada;
- erro/aviso por linha;
- agrupamento por produto;
- plano de alteração (`CREATE`/`UPDATE`/`SKIP`);
- confirmação idempotente;
- lote de fotos e associação proposta.

Processar fora da requisição web. Nunca executar fórmula ou macro de planilha. Tratar toda célula como dado. XLSX deve ter limites de planilha, linha, coluna e tamanho; CSV deve tratar encoding e fórmula iniciada por `=`, `+`, `-` ou `@` ao exportar relatórios.

Chave de negócio: `(user_id, building_id, product_code)`. Variação usa `(product_id, variation_code)`. Restrições únicas no banco sustentam a idempotência.

O CSV pode ser distribuído em um pacote com arquivos auxiliares de categorias/atributos, pois não possui abas. O modelo XLSX inclui instruções e catálogos em abas protegidas de referência.

### Contrato inicial da planilha

Cada modelo possui uma versão. O servidor aceita versões suportadas e informa quando o usuário precisa baixar um modelo novo.

| Coluna | Regra |
|---|---|
| `codigo_produto` | obrigatória; identificador estável dentro de usuário + condomínio |
| `codigo_variacao` | obrigatória; usar `UNICA` para produto sem variação |
| `categoria_codigo` | obrigatória; deve existir no catálogo ativo |
| `titulo` | obrigatório e consistente em todas as linhas do mesmo produto |
| `descricao` | obrigatória e consistente no grupo |
| `condicao_codigo` | obrigatória conforme catálogo de condição |
| `tipo_preco` | obrigatório: preço fixo, gratuito ou a combinar |
| `preco` | obrigatório somente para preço fixo; valor validado sem ponto flutuante |
| `atributo_1_codigo` / `valor_1_codigo` | obrigatórios quando o produto possui primeiro eixo |
| `atributo_2_codigo` / `valor_2_codigo` | opcionais; usados juntos quando houver segundo eixo |
| `alcance_km` | opcional; ausente significa mesmo condomínio e nunca pode exceder o plano |
| `habilitar_whatsapp` | opcional; só produz efeito quando o plano permitir |

O modelo pode ter colunas opcionais adicionais versionadas, mas não deve exigir IDs internos. Códigos de catálogo são expostos nas abas ou arquivos de referência. Dados gerais repetidos com valores diferentes dentro do mesmo `codigo_produto` tornam o grupo inválido. Valores vazios não apagam conteúdo existente sem ação explícita.

## 5.10 ZIP de imagens

Antes de extrair:

- validar tamanho comprimido, quantidade de entradas e soma descomprimida;
- rejeitar caminhos absolutos, `..`, links e diretórios inesperados;
- validar assinatura real do arquivo, não apenas extensão;
- limitar dimensões e megapixels;
- renomear para identificador interno;
- remover metadados sensíveis e gerar versões otimizadas;
- verificar associação e limites antes de persistir.

Os valores iniciais recomendados, todos configuráveis, são 250 MB comprimidos, 1 GB descomprimido, 1.000 entradas, 10 MB e 24 megapixels por imagem. O limite comercial de imagens de cada produto continua prevalecendo.

## 5.11 IA do usuário

O consumo deve ser um ledger, não apenas um contador vulnerável a corrida. Campos mínimos: usuário, ciclo, operação, chave idempotente, estado, unidade reservada/consumida/estornada e timestamps.

Fluxo: reservar → chamar provedor → consumir em sucesso ou estornar em falha. A cota é consultada e reservada atomicamente.

## 5.12 Downgrade

Persistir uma avaliação de impacto e a seleção do usuário antes da data efetiva, incluindo condomínios mantidos e publicações mantidas por tipo em cada um. O job usa chave idempotente por assinatura/evento de plano.

Aplicar o downgrade em ordem determinística:

1. selecionar até o novo limite de condomínios;
2. pausar todas as publicações contabilizáveis dos prédios excedentes;
3. dentro dos prédios mantidos, aplicar cada cota por tipo;
4. reduzir raios;
5. aplicar bloqueio de variações quando o destino for Free.

Produtos com variação bloqueados pelo Free precisam de:

- `lockedByDowngradeAt`;
- `scheduledDeletionAt`;
- registro de avisos enviados;
- cancelamento do agendamento em upgrade;
- limpeza de imagem por contagem de referências;
- tombstone mínimo para conversas.

Também aplicar `min(alcance_salvo, máximo_atual)` em tempo de execução, mesmo depois de persistir o novo raio, como defesa adicional.

## 5.13 Autenticação social

Manter Better Auth na versão compatível com o projeto e configurar provedores por ambiente:

- Google com OIDC já existente;
- Apple com Service ID, Team ID, Key ID e segredo de cliente assinado/rotacionável.

Para Apple, persistir nome/e-mail recebidos na primeira autorização, inclusive relay válido. Google e Apple devem guardar o identificador estável retornado pelo respectivo provedor; vinculação de contas segue fluxo seguro e auditável.

As tabelas de contas/sessões continuam sob migrações do repositório. Configuração inválida em produção deve falhar de forma visível na inicialização ou health check.

## 5.14 Compartilhamento de publicação

O link compartilhado deve usar token aleatório criptograficamente forte. Persistir somente seu hash com, no mínimo:

- publicação;
- usuário que compartilhou;
- criação e expiração;
- revogação;
- estado/versão ativa da publicação a que se aplica;
- contadores mínimos de abertura e conversão.

O token expira no máximo junto com o período ativo corrente da publicação. Ao sair de `ACTIVE`, todos os convites desse período são revogados. Uma renovação cria novo período ativo e exige um novo convite.

A rota pública do convite:

- não devolve título, descrição, fotos, autor, condomínio ou metadados sociais do anúncio antes da autenticação;
- usa `noindex` e uma prévia genérica da plataforma;
- troca o token por uma intenção server-side ou cookie assinado de curta duração;
- aceita apenas destinos internos previamente conhecidos, evitando redirecionamento aberto;
- preserva a intenção entre provedores OAuth, cadastro e onboarding;
- valida o convite novamente antes de conceder acesso.

Depois da autenticação, registrar uma autorização escopada a `(user_id, publication_id, active_period)`. A política central pode então ignorar apenas a distância para essa publicação. Estado, moderação, bloqueios, consentimento, propriedade da variação e regras de contato continuam sendo verificados.

Aplicar rate limit à criação e resolução de convites. O identificador real da publicação não deve ser suficiente para fabricar a exceção. URLs e logs não devem conter conteúdo do anúncio nem dados pessoais.

Na interface, preferir a Web Share API quando disponível, oferecer ação explícita para WhatsApp e fallback de copiar link. O texto compartilhado é genérico e configurável.

## 5.15 Observabilidade e privacidade

Registrar métricas de:

- aprovação, rejeição, revisão e latência da moderação;
- consumo e falha de IA;
- importações, erros e abandono;
- conversão por método de login;
- alcance e contatos sem registrar localização precisa da unidade;
- downgrade, pausas e recuperações;
- criação, duplicidade e rejeição de condomínios.
- criação, abertura, autenticação e conversão de compartilhamentos, sem expor o token em logs.

Logs não devem conter senha, token, segredo OAuth, planilha integral, telefone completo ou URL assinada. A política de retenção precisa abranger arquivos temporários, imagens órfãs e dados de auditoria.

## 5.16 Riscos já encontrados no código

Antes da expansão funcional, corrigir:

1. autenticação podendo inicializar antes das migrações;
2. validação atrasada de condomínio sobrescrevendo decisão humana;
3. moderação atrasada republicando conteúdo removido;
4. validação incompleta de endereço/CEP;
5. testes assíncronos sem sincronização confiável;
6. alertas de dependências que exigem triagem;
7. falha atual de formatação/lint do Biome.

## 5.17 Reserva de condomínio e cota local

Não calcular o limite apenas com duas consultas independentes, pois requisições simultâneas podem ultrapassá-lo. Usar uma representação transacional de ocupação por `(user_id, building_id)` com restrição única e serializar a reserva no escopo do usuário.

Na mesma transação que move a publicação para um estado contabilizável:

1. bloquear ou versionar o registro de capacidade do usuário;
2. criar/reutilizar a ocupação única do condomínio;
3. confirmar que o total de ocupações não excede 3/5/10;
4. contar/reservar a cota por `(user, building, type)`;
5. efetivar a transição.

Quando a última publicação ativa/em moderação sair do prédio, remover ou desativar a ocupação na mesma transação. Uma rotina de reconciliação pode corrigir divergências, mas não substitui a integridade transacional.

Rascunhos não criam ocupação. Para impedir crescimento abusivo, aplicar quantidade máxima configurável de rascunhos, expiração por inatividade e rate limit, sem transformá-los em cota comercial.

## 5.18 Identidade telefônica

### Dados

Campos conceituais da conta:

- `phoneEncrypted` para uso autorizado;
- `phoneIdentityHash` determinístico e indexado como único;
- `phoneLastDigits` para exibição mascarada;
- `phoneVerifiedAt`;
- `phoneVerificationDeadline`;
- `accountRestrictionReason`;
- versão/país usado na normalização.

O hash de identidade deve usar HMAC com segredo rotacionável ou mecanismo equivalente, não um hash simples vulnerável à enumeração de números. O número completo deve ser criptografado em repouso. A interface trabalha apenas com a forma mascarada fora dos pontos estritamente necessários.

### Número pendente e unicidade

Manter tentativas pendentes separadas da identidade confirmada. Informar um número não deve reservá-lo definitivamente, pois um atacante poderia bloquear o telefone de outra pessoa. Ao confirmar o OTP, uma transação:

1. bloqueia a tentativa válida e não consumida;
2. calcula a identidade normalizada;
3. verifica a restrição única;
4. associa o número à conta;
5. marca a tentativa como consumida;
6. remove a restrição de telefone, quando aplicável.

Conflito de unicidade produz uma resposta genérica e inicia um fluxo seguro de recuperação/vinculação, nunca mesclagem silenciosa.

### Código de verificação

- validade inicial recomendada: 10 minutos;
- uso único e armazenamento somente do hash;
- no máximo cinco tentativas por código;
- intervalo e limite configurável de reenvio;
- rate limit combinado por conta, telefone, IP e dispositivo;
- invalidação de códigos anteriores quando um novo for emitido;
- registro de provedor, entrega e resultado sem guardar o código.

O envio deve ficar atrás de uma interface de provedor. SMS é o canal inicial; outro canal só pode ser incluído sem reduzir a prova de posse.

### Bloqueio em cinco dias

Não depender apenas de um job. Um guard central compara `phoneVerifiedAt` e `phoneVerificationDeadline` em cada requisição autenticada. Um job idempotente atualiza o estado, envia avisos e facilita métricas, mas a autorização em tempo real impede a janela de abuso.

O bloqueio é uma sobreposição de conta, não uma mudança do estado de cada publicação. Consultas públicas excluem autores com `PHONE_VERIFICATION_BLOCKED`; cotas, expiração e auditoria continuam intactas. A verificação remove a sobreposição e torna novamente visível apenas o conteúdo ainda elegível.

Para contas existentes, uma migração define o prazo como cinco dias após a ativação da funcionalidade e inicia a comunicação. Reprocessar o job não duplica avisos nem muda o prazo.

### Integrações

- Better Auth continua responsável por sessão e métodos de login; telefone não se torna automaticamente um novo método de login.
- SSO com telefone coincidente não mescla contas sem autenticação segura da conta existente.
- Convites guardam a intenção enquanto o usuário verifica o número.
- WhatsApp do próprio anunciante usa o telefone verificado; a URL é gerada no servidor.
- Telefones de prestadores indicados ficam em estrutura separada, com consentimento e sem restrição global de unicidade.
