# Aqui no Prédio — documentação completa do produto

Versão do produto: 1.4\
Data: 26/10/2026\
Estado: escopo e regras de negócio aprovados; implementação pendente de adequação.\
Fonte de verdade: este documento e seus anexos no diretório `docs/product/`.

## 1. Resumo executivo

O Aqui no Prédio é uma plataforma brasileira de anúncios locais voltada a moradores de prédios e condomínios. Ela organiza as ofertas, pedidos e recomendações que normalmente ficam espalhados em grupos de WhatsApp.

A plataforma permite:

- anunciar produtos;
- oferecer serviços;
- publicar que está procurando um produto ou serviço;
- indicar um prestador de serviço;
- descobrir oportunidades no próprio condomínio e nas proximidades;
- conversar dentro da plataforma;
- disponibilizar contato por WhatsApp quando o autor tiver plano pago;
- compartilhar uma publicação ativa para trazer outra pessoa à plataforma.

Não existe checkout, pagamento entre usuários, entrega, frete ou controle de estoque. O produto aproxima as pessoas e fornece contexto, confiança, moderação e comunicação.

## 2. Objetivos

### 2.1 Objetivo principal

Facilitar negócios e indicações hiperlocais entre moradores e prestadores próximos, com uma experiência mais organizada e segura do que grupos de mensagens.

### 2.2 Objetivos operacionais

- identificar corretamente o condomínio do usuário;
- reduzir anúncios duplicados, ofensivos, ilegais ou enganosos;
- respeitar benefícios e limites de cada plano;
- proteger dados pessoais e o endereço dos usuários;
- permitir crescimento por convites de condomínio e compartilhamento de publicações;
- oferecer importação e variações sem assumir a complexidade de um e-commerce.

### 2.3 Indicadores a acompanhar

Ainda não existem metas numéricas aprovadas. A primeira versão deve medir, no mínimo:

- cadastros e conclusão do onboarding;
- condomínios solicitados, aprovados, duplicados e rejeitados;
- publicações criadas, aprovadas, rejeitadas, renovadas e expiradas;
- contatos por chat e WhatsApp;
- convites compartilhados, autenticações e interações originadas por eles;
- uso, falha e custo de IA;
- importações concluídas, erros e abandono;
- conversão e cancelamento dos planos.

## 3. Princípios do produto

1. O condomínio é a origem social e geográfica da experiência.
2. A plataforma deve ser simples o suficiente para um anúncio pequeno e rápido.
3. A API é a fonte de verdade para plano, cota, distância e autorização.
4. Conteúdo incerto não é aprovado automaticamente.
5. Recursos pagos não podem criar brechas de segurança ou ocultar regras comerciais.
6. Dados e imagens só permanecem pelo período necessário.
7. Toda exceção de acesso é explícita, limitada e auditável.
8. A plataforma não deve crescer para um e-commerce sem nova decisão de produto.

## 4. Perfis e atores

### Visitante não autenticado

Pode acessar as páginas institucionais e iniciar login/cadastro. Ao abrir convite de condomínio ou compartilhamento, não recebe o conteúdo privado; a intenção é preservada até a autenticação.

### Usuário autenticado

Possui perfil, um ou mais vínculos com condomínios e um condomínio ativo para navegação. Pode criar, visualizar e responder conteúdo dentro de suas permissões.

### Autor da publicação

É o usuário responsável pelo anúncio ou indicação. Seu plano determina cota, alcance dos anúncios comuns e possibilidade de habilitar WhatsApp.

### Visitante de uma publicação `Procuro`

Seu próprio plano determina até que distância pode descobrir e responder pedidos, salvo convite de compartilhamento válido.

### Moderador

Analisa casos incertos, recursos e conteúdo sinalizado. Sua decisão posterior prevalece sobre respostas automáticas atrasadas.

### Administrador

Gerencia catálogo oficial, parâmetros configuráveis, planos, políticas e ferramentas operacionais autorizadas.

### Processos automáticos

Executam moderação, validação de endereço, expiração, downgrade, limpeza, importação, notificações e contabilização. Devem ser idempotentes.

## 5. Escopo funcional

### 5.1 Incluído

- autenticação por e-mail/senha, Google e Apple;
- telefone pessoal único, obrigatório e verificado em até cinco dias;
- onboarding, aceite de termos, privacidade e confirmação de 18 anos;
- busca, solicitação, validação e vínculo com condomínio;
- convite de condomínio;
- planos Free, Pro e Business;
- Produto, Serviço, `Procuro` e Indicação de serviço;
- imagens, busca interna, favoritos e chat;
- contato do autor por WhatsApp para planos pagos;
- alcance geográfico e distância aproximada;
- compartilhamento de publicação ativa com retorno após login;
- moderação de texto e imagem;
- IA de apoio à criação para planos pagos;
- atributos e variações de produto em planos pagos;
- importação de produtos por XLSX/CSV e fotos por ZIP;
- expiração, renovação, upgrade e downgrade.

### 5.2 Não incluído

- indicação de produto;
- checkout, pagamento, comissão, frete, entrega ou garantia da negociação;
- estoque por produto ou variação;
- destaque pago ou impulsionamento;
- “subir anúncio”;
- publicação individual indexável em buscadores;
- atributos variáveis de serviço, `Procuro` ou indicação;
- catálogo global criado automaticamente por usuários;
- localização contínua por GPS;
- restauração automática de benefícios depois de upgrade.

## 6. Planos e benefícios

| Benefício | Free | Pro | Business |
|---|---:|---:|---:|
| Preço mensal | R$ 0,00 | R$ 29,90 | R$ 59,90 |
| Condomínios novos criados pela conta | 3 | 7 | 20 |
| Condomínios simultâneos de publicação | 3 | 5 | 10 |
| Produtos ativos ou em moderação, por condomínio | 1 | 20 | 50 |
| Serviços ativos ou em moderação, por condomínio | 1 | 20 | 50 |
| Indicações ativas ou em moderação, por condomínio | 1 | 20 | 50 |
| Publicações `Procuro` ativas ou em moderação, por condomínio | 1 | 10 | 25 |
| Usos mensais de IA pelo usuário | 0 | 10 | 30 |
| Importação XLSX/CSV | Não | Sim | Sim |
| Atributos e variações de produto | Não | Sim | Sim |
| Alcance máximo de anúncio comum | 1 km | 5 km | 10 km |
| Descoberta e resposta de `Procuro` | 1 km | 5 km | 10 km |
| Chat interno | Sim | Sim | Sim |
| Autor pode habilitar WhatsApp | Não | Sim | Sim |
| Compartilhar publicação ativa | Sim | Sim | Sim |
| Telefone pessoal verificado | Obrigatório | Obrigatório | Obrigatório |
| Foto de perfil | Sim | Sim | Sim |

Os limites ficam centralizados e são configuráveis. Alterações futuras de valor ou franquia exigem versionamento e atualização desta documentação.

Existem duas franquias de condomínio independentes:

- **criação:** quantos prédios novos a conta pode solicitar ao longo do tempo, em 3/7/20;
- **publicação:** em quantos prédios a conta pode manter conteúdo ativo ou em moderação simultaneamente, em 3/5/10.

As cotas de Produto, Serviço, Indicação e `Procuro` são aplicadas por condomínio. Por isso, um usuário Pro pode ter até 20 produtos contabilizáveis em cada um de seus cinco condomínios de publicação, sem transferir vagas não usadas entre categorias.

O teto teórico, usando todas as categorias em todos os prédios, é:

| Plano | Produtos | Serviços | Indicações | `Procuro` | Total |
|---|---:|---:|---:|---:|---:|
| Free | 3 | 3 | 3 | 3 | 12 |
| Pro | 100 | 100 | 100 | 50 | 350 |
| Business | 500 | 500 | 500 | 250 | 1.750 |

O total é consequência da matriz, não uma cota adicional. Deve ser monitorado para calibrar custo de moderação, arquivos e risco de spam.

## 7. Condomínios e localização

### 7.1 Identificação

CEP sozinho não identifica um condomínio. A validação usa:

- CEP;
- logradouro;
- número;
- cidade e estado;
- coordenadas e precisão da geocodificação;
- identificador do provedor, quando existir.

Essa composição trata municípios com CEP único e reduz associações ao número errado.

### 7.2 Solicitação e validação

Se não existir correspondência, o usuário pode solicitar um novo condomínio dentro da cota cumulativa 3/7/20. Vínculo com prédio existente, duplicidade identificada ou solicitação inválida rejeitada não consomem a cota permanentemente. Tentativas continuam sujeitas a controle de abuso.

O resultado da validação pode ser:

- aprovado;
- enviado para revisão humana;
- rejeitado com motivo.

Condomínio ainda não verificado só permite interação dentro do próprio prédio.

O vínculo é autodeclarado e não comprova residência. A interface não pode apresentar a pessoa como morador verificado. Entrar ou navegar em vários condomínios é permitido; o controle comercial ocorre quando a conta tenta colocar conteúdo em estado ativo ou em moderação.

### 7.3 Convite de condomínio

Um usuário autorizado pode gerar link específico, revogável e com validade. O convite:

- sobrevive a login, cadastro e onboarding;
- não revela dados privados antes da autenticação;
- não consome cota de criação do convidado;
- segue a política de entrada daquele condomínio.

## 8. Publicações

### 8.1 Tipos

#### Produto

Bem oferecido pelo autor. Pode ter preço, imagens e, em plano pago, variações.

#### Serviço

Serviço oferecido pelo autor ou seu negócio.

#### Procuro

Pedido de produto ou serviço. O autor não define raio; o alcance normal pertence ao visitante.

#### Indicação de serviço

Recomendação de prestador. Contato de terceiro exige declaração de autorização para divulgação.

### 8.2 Estados

- rascunho;
- aguardando moderação;
- ativo;
- pausado;
- expirado;
- rejeitado;
- removido;
- excluído.

Ativo e aguardando moderação consomem cota. Os demais não.

### 8.3 Validade

Todas as publicações expiram em 30 dias, independentemente do plano. A renovação é gratuita por mais 30 dias, mas exige vaga na cota local e, se necessário, uma vaga de condomínio de publicação. Alteração material, denúncia ou risco envia novamente à moderação.

### 8.4 Ordenação

O feed pode considerar proximidade, relevância, legitimidade e data real de ativação/renovação. Não existe prioridade paga oculta.

### 8.5 Cotas por condomínio

Cada publicação tem um único condomínio de origem. Ativo e em moderação consomem:

1. uma vaga da categoria naquele condomínio; e
2. uma vaga de condomínio da conta, caso seja a primeira publicação contabilizável naquele local.

Ao sair desses estados, a vaga da categoria é liberada. Se era a última publicação contabilizável do prédio, a vaga do condomínio também é liberada. Rascunhos não ocupam vagas, mas têm retenção e proteção contra abuso.

Copiar uma oferta para outro condomínio cria outra publicação, com nova contagem e moderação. Não existe ativação automática em massa na primeira versão.

## 9. Alcance e autorização geográfica

### 9.1 Anúncios comuns

Produto, Serviço e Indicação de serviço usam o condomínio da publicação como origem. O autor escolhe:

- mesmo condomínio;
- 0,5 km;
- 1 km;
- 2 km;
- 3 km;
- 5 km;
- 10 km.

O servidor limita a opção ao máximo do plano. O padrão é mesmo condomínio. O alcance efetivo é sempre o menor valor entre o raio salvo e o máximo do plano atual.

### 9.2 Contexto do visitante

O destino é o condomínio ativo escolhido pelo visitante. Vários vínculos não são combinados e a plataforma não seleciona automaticamente o mais próximo. Trocar o contexto recalcula feed e distância.

`No mesmo condomínio` depende da igualdade do identificador interno. Nos demais casos, a plataforma mostra distância aproximada em linha reta entre coordenadas dos prédios.

Sem coordenadas confiáveis, somente o mesmo condomínio é autorizado.

### 9.3 Regra especial de `Procuro`

O plano do autor limita somente a quantidade de publicações. O plano do visitante define até onde ele pode descobrir e iniciar uma resposta:

- Free: 1 km;
- Pro: 5 km;
- Business: 10 km.

Upgrade amplia novas descobertas imediatamente e downgrade as reduz. Conversa iniciada de forma válida permanece disponível.

### 9.4 Aplicação uniforme

Feed, busca, detalhe, favorito, chat, WhatsApp e URL comum usam a mesma política no servidor. Alterar a interface ou conhecer o ID do anúncio não contorna a distância.

## 10. Compartilhamento de publicação

### 10.1 Objetivo

Permitir que um usuário convide outra pessoa, especialmente pelo WhatsApp, para conhecer uma publicação ativa e entrar na plataforma.

### 10.2 Regra

- O botão `Compartilhar` aparece somente em publicação ativa.
- Está disponível nos três planos.
- Pode ser usado em Produto, Serviço, Indicação ou `Procuro`.
- Oferece WhatsApp, compartilhamento nativo e copiar link.
- O link é um convite opaco, diferente da URL comum.
- Sem autenticação, nenhum conteúdo do anúncio é revelado.
- Login, cadastro, OAuth, aceites e onboarding preservam o destino.
- Ao concluir a entrada, o convidado vai diretamente ao anúncio.
- O convite ignora a distância somente para aquela publicação.
- O convidado pode iniciar chat e responder `Procuro`.
- WhatsApp de contato só aparece quando o autor pago o habilitou.
- Produto variável continua exigindo combinação completa.
- O convite não dá vínculo ao condomínio nem libera seu feed.
- Ao deixar o estado ativo, os convites daquele período são revogados.

### 10.3 Segurança e privacidade

O token é aleatório, armazenado por hash, expira no máximo com o período ativo e é validado novamente depois do login. O acesso concedido é limitado a usuário + publicação + período ativo.

O convite não ignora:

- bloqueio entre usuários;
- moderação;
- estado da publicação;
- consentimento de contato;
- seleção da variação;
- demais regras de segurança.

A página de entrada usa `noindex`, prévia genérica e não expõe título, foto, autor, telefone ou condomínio. URLs inválidas não confirmam a existência da publicação.

## 11. Comunicação

### 11.1 Chat interno

Disponível para todos os planos quando há autorização para a publicação. Uma conversa válida continua acessível depois de mudança de plano ou distância.

### 11.2 WhatsApp do anunciante

É benefício do autor Pro ou Business. Quando ele habilita o contato, qualquer visitante autorizado pode clicar, mesmo sendo Free. Indicação com número de terceiro exige consentimento registrado.

Compartilhar por WhatsApp é outra função: envia um convite para a plataforma e está disponível em todos os planos.

### 11.3 Produto com variação

Antes de chat ou WhatsApp, o visitante seleciona a combinação completa. A conversa registra, por exemplo, `Camiseta — Azul / M`.

## 12. IA do usuário

- Free: sem uso;
- Pro: 10 resultados bem-sucedidos por mês;
- Business: 30 resultados bem-sucedidos por mês.

Gerar e melhorar conteúdo consomem uma unidade quando entregam resultado utilizável. Falha técnica é estornada. Repetição idempotente não cobra duas vezes.

Moderação, endereço, antifraude e antispam são custos internos e não reduzem essa franquia. `Procuro` não recebe geração por IA nesta primeira versão.

## 13. Atributos e variações

### 13.1 Disponibilidade

Somente Pro e Business criam ou editam produto variável. Um anúncio variável continua contando como um único produto.

### 13.2 Limites

- dois atributos por produto;
- dez valores por atributo;
- vinte combinações oferecidas;
- seis fotos gerais;
- duas associações de foto por variação;
- vinte arquivos únicos por produto;
- vinte atributos privados por usuário;
- cem valores privados por usuário.

### 13.3 Comportamento

Cada variação pode ter preço, fotos, estado, ordem e SKU opcional. Estoque não existe no MVP. Preço por variação só se aplica ao modo de preço fixo. Se os preços diferirem, o anúncio mostra `A partir de` com o menor valor ativo.

Imagens gerais são fallback. O mesmo arquivo pode ser associado a várias combinações sem duplicação física.

### 13.4 Catálogo

A plataforma oferece atributos oficiais por categoria. O usuário pode criar item privado quando não encontrar o necessário. Itens privados não aparecem para terceiros, não criam filtros globais e não se tornam oficiais automaticamente.

O anúncio guarda snapshot dos rótulos para não mudar retroativamente. O catálogo inicial completo está no anexo `09-catalogo-inicial-de-atributos.md`.

## 14. Importação em lote

### 14.1 Disponibilidade e limites

| Plano | Produtos por arquivo | Linhas de variação |
|---|---:|---:|
| Pro | 20 | 400 |
| Business | 50 | 1.000 |

Free não possui importação.

### 14.2 Formatos

- XLSX como formato principal, com instruções e catálogos auxiliares;
- CSV UTF-8 com BOM e `;` para Excel em português;
- sem XLS legado ou macro habilitada.

### 14.3 Identificação

Cada linha possui `codigo_produto` e `codigo_variacao`. Produto sem variação usa `UNICA`. A chave do produto é usuário + condomínio + código. Título nunca identifica atualização.

### 14.4 Fluxo

1. Escolher condomínio e baixar modelo.
2. Enviar arquivo.
3. Processar e validar de forma assíncrona.
4. Mostrar prévia de novos, atualizações, avisos, erros e duplicidades.
5. Confirmar de forma idempotente.
6. Criar ou atualizar somente rascunhos.
7. Associar fotos e revisar.
8. Enviar para moderação.
9. Ativar dentro da cota.

Ausência de linha nunca exclui conteúdo existente. Exclusão precisa de ação explícita.

### 14.5 Fotos por ZIP

Padrões:

- `CODIGOPRODUTO__GERAL__01.jpg`;
- `CODIGOPRODUTO__CODIGOVARIACAO__01.jpg`.

A prévia apresenta associados, órfãos e excedentes. O servidor protege contra caminhos maliciosos, expansão abusiva, tipo falso e excesso de arquivos, além de aplicar os limites de imagem do produto.

### 14.6 Retenção

- planilha original: apagar após processamento ou em até sete dias;
- sessão não confirmada: sete dias;
- rascunho importado abandonado: 30 dias com aviso;
- imagens órfãs: limpeza automática.

## 15. Moderação e segurança de conteúdo

### 15.1 Conteúdo analisado

Texto, imagens, atributos, variações, indicações e itens importados passam pela mesma política.

### 15.2 Resultados

- aprovado;
- revisão humana;
- proibido.

Baixo risco pode ser aprovado automaticamente. Rejeição automática é reservada a casos claros e de alta confiança. Ambiguidade ou falha do provedor em produção segue para revisão, nunca aprovação silenciosa.

### 15.3 Categorias proibidas

- sexual/adulto, exploração ou conteúdo 18+ impróprio;
- promoção político-partidária ou eleitoral;
- ódio, discriminação, assédio, ameaça ou ofensa grave;
- armas, drogas, contrabando, documento falso e outros bens ilegais;
- medicamentos controlados e alegações perigosas de saúde;
- fraude, pirâmide, empréstimo abusivo e jogo ilegal;
- falsificação e violação de propriedade intelectual;
- animais silvestres;
- dados pessoais de terceiros sem base válida;
- violência, ameaça, spam, conteúdo enganoso e evasão de regras.

Contexto político incidental ou caso ambíguo vai para revisão humana.

### 15.4 Concorrência

Cada análise carrega versão e hash do conteúdo. Antes de escrever, o sistema recarrega o registro e verifica se a resposta ainda é atual. Resultado atrasado não republica item excluído nem substitui decisão humana posterior.

Rejeição libera a cota e apresenta motivo curto, possibilidade de correção e recurso quando aplicável.

## 16. Autenticação

### 16.1 Métodos

- e-mail e senha;
- Google;
- Apple.

Sessões web usam cookies seguros e `httpOnly`; tokens sensíveis não ficam em armazenamento local.

### 16.2 Login social

Novo usuário social conclui os mesmos aceites e onboarding. Conta retornante deve acessar o mesmo usuário. O perfil oferece `Segurança > Métodos de acesso` e proíbe remover o último método.

Google e Apple verificados podem seguir vinculação segura. Sem e-mail utilizável, a plataforma orienta outro método e não cria endereço fictício.

### 16.3 Requisitos externos

- Google: credenciais OIDC válidas;
- Apple: Apple Developer, Service ID, Team ID, Key ID, chave privada, segredo rotacionável e domínio HTTPS.

Todos são obrigatórios no lançamento público, embora possam ficar ocultos em desenvolvimento sem credenciais.

### 16.4 Telefone único e verificado

Toda conta possui um telefone pessoal verificado, único na plataforma e normalizado no padrão internacional E.164. O telefone complementa a identidade da conta, mas não substitui automaticamente e-mail/senha ou SSO como método de login.

#### Prazo

- conta nova: cinco dias corridos desde a criação;
- conta existente na implantação: cinco dias desde a ativação da regra;
- durante a carência: funcionamento normal com aviso persistente e contagem regressiva;
- após o prazo: estado `PHONE_VERIFICATION_BLOCKED` até a confirmação.

O prazo é validado em toda requisição autenticada, e não apenas por rotina agendada.

#### Bloqueio

A conta bloqueada acessa somente verificação do telefone, segurança/recuperação permitida, suporte, informações legais e logout. Suas publicações ficam invisíveis e novos chats/contatos são impedidos.

O bloqueio não:

- exclui ou pausa formalmente publicações;
- libera cotas ou vagas de condomínio;
- interrompe a expiração normal;
- cancela assinatura;
- apaga conversas ou histórico.

Após a verificação, a restrição é removida imediatamente. Publicações ainda ativas e válidas voltam a aparecer sem nova moderação quando seu conteúdo não mudou.

#### Verificação e unicidade

O telefone somente se torna identidade da conta após a confirmação de um código temporário de uso único. Um número apenas digitado permanece pendente e não pode ser reservado indefinidamente contra o verdadeiro titular.

A confirmação usa operação atômica e índice único para impedir duas contas com o mesmo telefone. Conflito não gera mesclagem automática; a plataforma orienta recuperação segura da conta existente.

Os códigos possuem validade curta, limite de tentativas e reenvios, armazenamento por hash e proteção por conta, telefone, IP e dispositivo. Telefone completo e código não aparecem em URL, log ou analytics.

#### Troca e WhatsApp

Trocar telefone exige autenticação recente e verificação do novo número antes de remover o atual. O WhatsApp do próprio anunciante usa seu telefone verificado. Número de prestador indicado permanece separado, depende de consentimento e não participa da unicidade de identidade.

Convites de condomínio e de publicação preservam o destino durante a verificação obrigatória.

## 17. Downgrade

### 17.1 Publicações excedentes

Antes da data efetiva, o usuário pode escolher quais permanecem ativas dentro de cada cota. Sem escolha, ficam as mais recentemente ativadas; as demais são pausadas, não excluídas.

Se o downgrade reduzir os condomínios de publicação, a seleção ocorre em duas etapas: primeiro os prédios mantidos; depois as publicações por categoria dentro de cada um. Sem escolha, o sistema preserva os prédios com atividade publicável mais recente e então aplica a regra de recência às publicações.

### 17.2 Alcance

É reduzido e persistido imediatamente ao máximo do novo plano. Upgrade posterior não restaura o raio antigo.

### 17.3 Produtos com variações ao chegar ao Free

- ficam desativados, invisíveis e somente leitura;
- permanecem recuperáveis por 60 dias;
- geram avisos no início, 30 dias, 7 dias e 1 dia antes do fim;
- upgrade cancela exclusão, mas não reativa automaticamente;
- depois de 60 dias, produto, variações e imagens sem uso são apagados;
- permanece referência mínima para conversa e auditoria.

Jobs e notificações são idempotentes.

## 18. Modelo conceitual

Principais entidades:

| Entidade | Responsabilidade |
|---|---|
| Usuário | perfil, preferências, idade e onboarding |
| Conta de acesso | senha ou identidade Google/Apple |
| Identidade telefônica | número criptografado, identidade única, verificação e prazo |
| Sessão | autenticação web segura |
| Assinatura | plano, ciclo e estado de cobrança |
| Condomínio | endereço normalizado, coordenadas e verificação |
| Vínculo | relação usuário-condomínio e estado de acesso |
| Ocupação de publicação | reserva única do par usuário-condomínio enquanto houver conteúdo contabilizável |
| Solicitação de condomínio | criação, evidências e decisão |
| Convite de condomínio | token, validade, revogação e uso |
| Publicação | tipo, autor, origem, estado, alcance e validade |
| Variação | combinação, preço, SKU, estado e ordem |
| Catálogo de atributo | atributos/valores oficiais e categorias |
| Item privado | atributo/valor exclusivo do usuário |
| Arquivo de mídia | armazenamento, tipo, hash e referências |
| Conversa e mensagem | comunicação e contexto da variação |
| Caso de moderação | versão, evidência, resultado e recurso |
| Uso de IA | reserva, consumo, estorno e idempotência |
| Sessão de importação | arquivo, linhas, prévia e confirmação |
| Impacto de downgrade | seleção, execução, avisos e limpeza |
| Convite de publicação | compartilhamento, expiração e revogação |
| Permissão compartilhada | usuário, publicação e período ativo |

O esquema final deve seguir as convenções do monorepo e ser alterado somente por migrações versionadas.

## 19. Requisitos não funcionais

### Segurança

- autorização sempre no servidor;
- tokens aleatórios armazenados por hash;
- telefone criptografado, identidade por HMAC e OTP armazenado somente por hash;
- proteção contra enumeração e redirecionamento aberto;
- validação real de arquivos e imagens;
- nenhuma execução de fórmula ou macro;
- segredos fora do repositório;
- webhooks autenticados e idempotentes;
- logs sem senha, token, telefone completo ou URL assinada.

### Privacidade

- não usar GPS contínuo nem endereço da unidade;
- exibir apenas distância aproximada;
- restringir conteúdo antes da autenticação;
- retirar metadados sensíveis das imagens;
- definir retenção e limpeza dos arquivos;
- adequar termos, política de privacidade e processos à LGPD antes do lançamento.

### Confiabilidade

- transações e restrições únicas nas cotas e importações;
- jobs repetíveis sem efeitos duplicados;
- callbacks assíncronos com versão e comparação atômica;
- backup, restauração e rollback ensaiados;
- métricas e alertas para autenticação, moderação, pagamento, importação e jobs.

### Qualidade

- formatação, lint, tipos, testes e build em ambiente limpo;
- testes unitários, de integração e jornadas essenciais ponta a ponta;
- acessibilidade e mensagens compreensíveis;
- parâmetros comerciais centralizados.

## 20. Critérios gerais de aceite

A versão só está pronta para lançamento quando:

1. a matriz comercial exibida corresponde às validações da API;
2. concorrência não permite ultrapassar cota local nem o limite 3/5/10 de condomínios;
3. endereço com CEP único identifica corretamente rua e número;
4. URLs comuns não contornam distância;
5. convite compartilhado contorna somente a distância da publicação específica;
6. conteúdo proibido ou incerto não é publicado automaticamente;
7. resposta atrasada não desfaz exclusão ou decisão humana;
8. importação repetida não duplica dados;
9. ZIP malicioso é rejeitado;
10. downgrade é idempotente e preserva dados conforme a regra;
11. E-mail/senha, Google e Apple funcionam no domínio público;
12. convite de condomínio e compartilhamento sobrevivem a todos os métodos de login;
13. nenhum conteúdo individual de anúncio fica indexável publicamente;
14. todos os cenários detalhados do anexo `06-criterios-de-aceite.md` foram executados.

## 21. Ordem de implementação

1. Estabilizar migrações, autenticação, concorrência e testes.
2. Centralizar planos, cotas, validade, IA e downgrade.
3. Corrigir endereço, validação e convite de condomínio.
4. Completar moderação.
5. Implementar distância, `Procuro` e compartilhamento.
6. Implementar catálogo e variações.
7. Implementar XLSX/CSV.
8. Implementar ZIP de fotos.
9. Completar Apple e métodos de acesso.
10. Revisar indicação, WhatsApp e consentimento.
11. Executar auditoria e checklist de lançamento.

## 22. Situação do código recebido

A análise encontrou uma base substancial em Next.js/React, NestJS, TypeORM, PostgreSQL/PostGIS, Better Auth, Stripe, armazenamento S3, chat e IA. Ela não cumpre integralmente esta especificação.

Riscos prioritários já identificados:

1. autenticação podendo iniciar antes das migrações;
2. validação atrasada de condomínio sobrescrevendo decisão humana;
3. moderação atrasada republicando item removido;
4. validação incompleta de endereço;
5. testes assíncronos frágeis;
6. alertas de dependência sem triagem concluída;
7. formatação/lint atualmente falhando.

A primeira intervenção no código deve ser a estabilização, não a adição imediata de funcionalidades comerciais.

## 23. Insumos externos para o lançamento

Não são novas decisões de negócio, mas precisam existir operacionalmente:

- domínio HTTPS definitivo;
- credenciais Google e Apple;
- produtos e preços mensais no Stripe;
- provedor de endereço/geocodificação e suas chaves;
- provedor de IA e limites de custo;
- armazenamento de arquivos e política de retenção;
- textos jurídicos e política de conteúdo;
- processo humano de moderação e recurso;
- canais de notificação;
- monitoramento, alertas, backup e suporte.

Como a plataforma ainda não foi lançada, espera-se que não existam assinantes reais nos preços antigos. Isso deve ser confirmado antes de substituir produtos do Stripe.

## 24. Decisões encerradas

- Pro e Business são mensais.
- Cota de criação de prédio é cumulativa em 3/7/20.
- Condomínios simultâneos de publicação são limitados em 3/5/10.
- Cotas de publicação são separadas por tipo e por condomínio.
- Um vínculo com o prédio não é prova de residência e não ocupa cota até existir conteúdo ativo ou em moderação.
- Moderação consome vaga; rejeição libera.
- Só existe indicação de serviço.
- WhatsApp de contato é benefício do autor.
- IA começa em 10/30 usos mensais.
- Downgrade pausa excedentes conforme escolha ou recência.
- Importação aceita XLSX e CSV e cria/atualiza.
- ZIP de fotos entra na primeira versão.
- SKU manual é opcional; códigos de importação são obrigatórios.
- Variação precisa ser selecionada antes do contato.
- Catálogo inicial foi aprovado.
- Destaque, “subir anúncio” e SEO público foram removidos.
- Todas as publicações expiram em 30 dias.
- E-mail/senha, Google e Apple entram desde o lançamento.
- Telefone pessoal verificado é único e obrigatório; a falta de confirmação bloqueia a conta após cinco dias.
- Compartilhamento de publicação ativa ignora somente o raio daquela publicação.

Não há pendência comercial conhecida na versão 1.4.

## 25. Anexos oficiais

- [Índice e controle](README.md)
- [Visão e escopo](01-visao-e-escopo.md)
- [Planos e limites](02-planos-e-limites.md)
- [Regras de negócio numeradas](03-regras-de-negocio.md)
- [Fluxos funcionais](04-fluxos-funcionais.md)
- [Especificação técnica](05-especificacao-tecnica.md)
- [Critérios de aceite](06-criterios-de-aceite.md)
- [Roadmap](07-roadmap-de-implementacao.md)
- [Prompts para Claude Code](08-prompts-claude-code.md)
- [Catálogo inicial](09-catalogo-inicial-de-atributos.md)
- [Matriz de rastreabilidade](10-matriz-de-rastreabilidade.md)
- [Guia de implementação com Context Engineering, VS Code e Claude Code](11-guia-context-engineering-vscode-claude-code.md)
