# 4. Fluxos funcionais

## 4.1 Entrada, autenticação e onboarding

1. O visitante escolhe e-mail/senha, Google ou Apple.
2. A plataforma autentica e procura uma conta vinculada de forma segura.
3. Se for conta nova, solicita os dados mínimos ainda ausentes.
4. O usuário aceita termos, política de privacidade e confirma a idade mínima.
5. Se veio por convite, o condomínio convidado permanece selecionado.
6. Caso contrário, o usuário pesquisa seu condomínio por endereço.
7. O vínculo com o condomínio segue as regras de validação e aprovação.
8. O usuário entra no feed com aquele condomínio como contexto ativo.

Retorno por login social nunca deve pular aceite obrigatório nem criar duas contas silenciosamente.

## 4.2 Encontrar ou cadastrar condomínio

1. Usuário informa CEP e número; complementa ou confirma logradouro, cidade e estado.
2. O sistema normaliza o endereço e consulta provedores de endereço/geocodificação.
3. O sistema procura correspondência por componentes normalizados e proximidade das coordenadas.
4. Se encontrar condomínio existente, oferece vínculo ou solicitação de acesso.
5. Se não encontrar, verifica a cota cumulativa de criação e o controle de tentativas.
6. A solicitação é criada como pendente.
7. Validações determinísticas e assistidas por IA produzem:
   - aprovação;
   - revisão humana;
   - rejeição com motivo.
8. Apenas após aprovação o prédio pode habilitar alcance externo ao próprio condomínio.

## 4.3 Convite para condomínio

1. Usuário autorizado solicita um link de convite.
2. O servidor cria token aleatório, com validade e vínculo a um único condomínio.
3. O convidado abre o link.
4. Se não estiver autenticado, faz login ou cadastro sem perder o convite.
5. Conclui onboarding e confirma o pedido de vínculo.
6. O sistema aplica a política de entrada daquele condomínio.
7. Token expirado, revogado ou já utilizado de forma incompatível não concede acesso.

O convite não revela dados privados do prédio antes da autenticação além do mínimo necessário à identificação.

## 4.4 Criar publicação comum

1. Usuário escolhe Produto ou Serviço e o condomínio de origem.
2. A plataforma informa se o condomínio já ocupa uma vaga de publicação e exibe as vagas disponíveis de prédios e daquela categoria no local.
3. Usuário preenche conteúdo, preço quando aplicável, fotos e alcance.
4. O alcance oferecido é limitado pelo plano atual e começa em `Mesmo condomínio`.
5. Autor Pro/Business pode habilitar WhatsApp.
6. O servidor valida dados, plano, cota por categoria e condomínio, endereço e arquivos.
7. Em uma operação atômica, o servidor reserva a vaga local da categoria e, se for a primeira publicação contabilizável naquele prédio, a vaga de condomínio; a publicação entra em moderação.
8. Conteúdo aprovado fica ativo por 30 dias; rejeitado libera a vaga.
9. Próximo ao vencimento, a plataforma oferece renovação gratuita.

## 4.5 Criar produto com variações

1. Usuário Pro/Business ativa `Este produto tem opções`.
2. Escolhe até dois atributos oficiais sugeridos para a categoria ou privados próprios.
3. Seleciona/cria valores e marca, opcionalmente, um atributo como definidor de foto.
4. Seleciona somente as combinações realmente oferecidas, até 20.
5. Informa preço e fotos por combinação quando diferirem do geral.
6. A plataforma valida combinações únicas, limites de imagens e modo de preço.
7. A prévia exibe o preço exato ou `A partir de`.
8. O produto inteiro segue para moderação como uma publicação.

Para conversar, o visitante escolhe todos os atributos. A mensagem inicial registra a combinação selecionada.

## 4.6 Criar `Procuro`

1. Autor escolhe o condomínio e descreve o que procura.
2. A plataforma valida a cota `Procuro` naquele condomínio e a disponibilidade de uma vaga de condomínio de publicação.
3. Não existe campo de alcance.
4. A publicação passa pela moderação e, se aprovada, fica ativa por 30 dias.
5. Para cada visitante, o servidor calcula a distância entre o condomínio ativo dele e a origem.
6. O visitante descobre e responde somente se a distância estiver no limite de seu próprio plano.
7. Link direto e favorito aplicam a mesma regra.
8. Conversa já iniciada continua acessível mesmo que plano ou distância mudem depois.

## 4.7 Criar indicação de serviço

1. Usuário escolhe categoria, condomínio e descreve a experiência.
2. Se divulgar telefone/WhatsApp de terceiro, confirma autorização explícita.
3. O servidor valida a cota de indicação naquele condomínio, a vaga de condomínio e modera texto, imagens e contato.
4. A publicação aprovada segue alcance e expiração definidos para anúncios comuns.
5. O contato direto só aparece se permitido pelas regras de plano e consentimento.

## 4.8 Descobrir e abrir uma publicação

1. Usuário seleciona um de seus condomínios como contexto ativo.
2. Feed e busca filtram conteúdo pelo tipo e pela autorização geográfica.
3. Mesma origem exibe `No mesmo condomínio`.
4. Origem diferente exibe distância aproximada.
5. Ao abrir o detalhe, o servidor revalida estado, plano, distância e acesso.
6. Ao favoritar, iniciar chat ou abrir WhatsApp, a autorização é revalidada novamente.

Nenhuma decisão sensível depende apenas de informação enviada pela interface.

## 4.9 Importar produtos por planilha

1. Usuário pago seleciona o condomínio.
2. Baixa modelo XLSX ou CSV compatível com sua categoria e os códigos do catálogo.
3. Preenche uma linha por variação e envia o arquivo.
4. Processamento assíncrono valida formato, limite, códigos, conteúdo, duplicidades e cota.
5. A prévia agrupa linhas por produto e mostra novo, atualização, avisos e erros.
6. Usuário corrige o arquivo ou confirma somente o conjunto válido.
7. Confirmação idempotente cria/atualiza rascunhos, nunca publicações ativas.
8. Usuário pode enviar ZIP de fotos e revisar a associação automática.
9. Completa imagens obrigatórias, revisa cada produto e envia para moderação.
10. Produtos aprovados podem ser ativados até a cota disponível.

Atualizar não remove variação, foto ou produto que não apareceu no arquivo. Toda exclusão é explícita.

## 4.10 Importar fotos por ZIP

Padrões aceitos:

- geral: `CODIGOPRODUTO__GERAL__01.jpg`;
- variação: `CODIGOPRODUTO__CODIGOVARIACAO__01.jpg`.

O sistema:

1. rejeita caminhos internos, executáveis, extensões e tipos incompatíveis;
2. limita quantidade e tamanho comprimido/descomprimido;
3. associa arquivos aos códigos já importados;
4. mostra encontrados, não associados e excedentes;
5. só persiste a associação após confirmação.

## 4.11 Renovar publicação

1. Sistema avisa sobre proximidade do vencimento.
2. Usuário solicita renovação.
3. Servidor verifica propriedade, estado, cota local da categoria e vaga de condomínio caso aquele prédio não esteja mais entre os locais ocupados.
4. Se houve alteração material ou denúncia, volta à moderação.
5. Se não houve, pode usar validação simplificada.
6. Após aprovação, define nova expiração em 30 dias e registra o evento.

## 4.12 Downgrade

1. Assim que o cancelamento/downgrade é agendado, a plataforma calcula impactos.
2. Antes da data efetiva, o usuário escolhe publicações a manter por tipo.
3. Na data efetiva, uma rotina transacional:
   - atualiza o plano;
   - limita e persiste os raios;
   - mantém primeiro os condomínios escolhidos dentro do novo limite;
   - mantém as publicações escolhidas dentro da cota de cada tipo em cada prédio preservado;
   - pausa excedentes;
   - bloqueia produtos com variações ao entrar no Free;
   - agenda a janela de 60 dias;
   - registra auditoria e envia resumo uma única vez.
4. Sem escolha válida, usa a data de ativação mais recente.
5. Upgrade posterior interrompe exclusão agendada, mas exige reativação manual e nova verificação de cota.

## 4.13 Moderação e recurso

1. Validações locais rejeitam arquivo inválido, texto vazio e padrões proibidos evidentes.
2. Texto e imagens seguem para análise automática versionada.
3. Baixo risco aprova; alto risco inequívoco rejeita; incerteza segue para revisão humana.
4. Antes de aplicar a resposta, o servidor verifica a versão atual do conteúdo e seu estado.
5. Decisão humana posterior tem precedência.
6. O autor recebe estado e motivo curto.
7. Quando permitido, pode corrigir e reenviar ou apresentar recurso.

## 4.14 Compartilhar publicação por WhatsApp

1. Um usuário autenticado abre uma publicação ativa que está autorizado a visualizar.
2. A interface exibe `Compartilhar` e oferece WhatsApp, compartilhamento nativo ou cópia do link.
3. O servidor gera um convite opaco vinculado à publicação ativa e ao usuário que compartilhou.
4. A mensagem do WhatsApp contém um texto curto e o link, sem endereço privado nem telefone do anunciante.
5. Ao abrir sem sessão, o convidado vê somente a entrada da plataforma e escolhe login ou cadastro; o conteúdo do anúncio continua oculto.
6. O destino é preservado durante autenticação, aceites e onboarding obrigatório.
7. Concluída a entrada, o servidor valida novamente convite, publicação, moderação e bloqueios.
8. Se válido, o usuário chega diretamente ao detalhe, mesmo que seu condomínio esteja fora do raio normal.
9. A exceção permite interagir somente com aquela publicação; chat continua disponível e WhatsApp de contato depende de o autor tê-lo habilitado.
10. Produto com variação ainda exige escolha completa antes do contato.
11. Publicação que deixou de estar ativa invalida o convite e mostra uma mensagem genérica de indisponibilidade.

Abrir a URL comum do detalhe, sem convite válido ou acesso previamente concedido por ele, continua sujeito às regras normais de distância.

## 4.15 Gerenciar condomínios de publicação

1. A conta pode vincular-se e navegar em condomínios sem ocupar a franquia de publicação.
2. Ao enviar a primeira publicação de um prédio para moderação, o servidor tenta reservar uma vaga de condomínio.
3. Se a conta já utiliza 3/5/10 prédios conforme o plano, a ativação é recusada antes de iniciar a moderação e a interface mostra quais prédios ocupam as vagas.
4. Para trocar de prédio, o usuário pausa ou cancela todas as publicações ativas/em moderação de um dos prédios atuais.
5. Quando a última publicação contabilizável sai desses estados, a vaga é liberada.
6. Rascunhos podem ser preparados sem reservar vaga, respeitando retenção e proteção antispam.
7. Uma cópia da mesma oferta em outro prédio é uma publicação distinta e consome a cota daquele prédio.
8. A plataforma nunca apresenta o vínculo como prova de residência.

Reservar a vaga do prédio e a cota da categoria deve ser uma única operação: se qualquer uma falhar, nenhuma é consumida.

## 4.16 Cadastrar e verificar telefone

1. Na criação da conta, o sistema define o prazo de verificação para cinco dias corridos e solicita o telefone pessoal.
2. O número é interpretado, confirmado pelo usuário e normalizado para E.164.
3. O servidor envia um código temporário por um provedor de verificação, inicialmente SMS, sem considerar o telefone comprovado.
4. O usuário informa o código dentro da validade e do limite de tentativas.
5. Em uma operação atômica, o servidor valida o código, confirma que o telefone ainda não pertence a outra conta e grava a identidade verificada.
6. Durante a carência, um aviso persistente mostra o prazo, permite reenviar o código e alterar o número.
7. Ao completar cinco dias sem sucesso, o servidor restringe a sessão ao próprio fluxo de verificação, segurança permitida, suporte e saída.
8. Publicações do titular deixam de aparecer e novos contatos são bloqueados, sem alterar seus estados ou liberar cotas.
9. Ao verificar, a restrição é removida imediatamente e o destino pendente de convite é retomado, se existir.
10. Publicações que continuam ativas e válidas voltam a aparecer; conteúdo expirado, removido ou rejeitado não é restaurado.

Para trocar o telefone, o usuário se autentica novamente, verifica primeiro o novo número e só então substitui o anterior. Se o número já estiver associado a outra conta, não há mesclagem automática.
