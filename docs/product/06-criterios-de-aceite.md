# 6. Critérios de aceite

Os cenários abaixo compõem a validação funcional mínima da primeira versão. Cada entrega deve adicionar testes automatizados proporcionais e registrar evidências dos cenários manuais que não puderem ser automatizados.

## 6.1 Planos e cotas

- Free, Pro e Business exibem preços e benefícios exatamente conforme a matriz.
- Uma criação simultânea além da cota resulta em apenas uma operação aceita.
- Uma ativação simultânea no 4º/6º/11º condomínio é recusada no Free/Pro/Business sem consumir parcialmente nenhuma vaga.
- Cotas de tipos diferentes e de condomínios diferentes não interferem entre si.
- Free consegue manter 1 publicação de cada tipo em cada um de até 3 prédios.
- Pro consegue manter 20/20/20/10 por prédio em até 5 prédios.
- Business consegue manter 50/50/50/25 por prédio em até 10 prédios.
- Publicação em moderação ocupa vaga; rejeição libera.
- Rejeitar ou pausar a última publicação contabilizável libera a vaga daquele condomínio.
- Criar rascunho, vincular-se ou navegar em um prédio não ocupa vaga de publicação.
- Uma publicação sempre possui uma única origem; copiá-la para outro prédio cria nova contagem.
- Produto com vinte variações ocupa uma vaga de produto.
- A API rejeita benefício pago mesmo que uma interface adulterada tente liberá-lo.
- Destaque, “subir anúncio”, produto indicado e SEO público não aparecem no produto.

## 6.2 Condomínios e convites

- Um CEP municipal único não causa associação automática ao número errado.
- Mesmo endereço com diferenças de caixa, acento e abreviação é sinalizado como possível duplicidade.
- Entrar em condomínio existente não reduz a cota de criação.
- Solicitação inválida rejeitada não reduz permanentemente essa cota.
- Condomínio não verificado só permite alcance interno.
- Convite sobrevive a login, cadastro e onboarding e chega ao prédio correto.
- Token expirado ou revogado não concede vínculo.

## 6.3 Alcance de anúncios comuns

- Free nunca publica ou mantém alcance acima de 1 km; Pro acima de 5 km; Business acima de 10 km.
- O padrão de novo anúncio é mesmo condomínio.
- Trocar o condomínio ativo altera feed e distância.
- Dois prédios próximos continuam diferentes; o rótulo de mesmo condomínio depende do ID.
- Sem coordenadas, um usuário externo não visualiza nem contata a publicação.
- Link direto, favorito e endpoint de chat bloqueiam o mesmo conteúdo que o feed bloqueia.
- Downgrade reduz e persiste o alcance; upgrade não o restaura.

## 6.4 `Procuro`

- O formulário não apresenta raio ao autor.
- Um visitante Free enxerga até 1 km, Pro até 5 km e Business até 10 km.
- Mudar apenas o plano do autor não aumenta o alcance de quem visualiza.
- Upgrade do visitante amplia a descoberta imediatamente; downgrade a reduz.
- Link direto comum fora do raio não permite detalhe nem novo contato; somente convite RN-SHR válido cria a exceção documentada.
- Conversa iniciada legalmente permanece acessível depois.
- WhatsApp só aparece se o autor pago o habilitou.

## 6.5 Variações

- Free não cria nem edita variações.
- Não é possível salvar terceiro atributo, 21ª combinação, 11º valor no eixo ou 21ª imagem única.
- Combinação duplicada é rejeitada independentemente da ordem dos valores.
- Imagem geral aparece quando a variação não possui foto própria.
- Arquivo reutilizado não é armazenado novamente.
- Preços diferentes mostram `A partir de` com o menor valor ativo.
- Chat e WhatsApp exigem combinação completa e gravam seu rótulo.
- Alterar o catálogo oficial não muda o rótulo já publicado.
- Atributo privado de um usuário não aparece para outro.

## 6.6 Importação

- Free não baixa modelo nem envia arquivo de importação.
- Pro é bloqueado acima de 20 produtos/400 linhas; Business acima de 50/1.000.
- O mesmo código em outro condomínio ou usuário não colide.
- Arquivo repetido e confirmação repetida não duplicam produto.
- Alterar título mantendo código atualiza o produto correto.
- Título igual com código diferente cria produtos distintos.
- Item ausente do arquivo não é excluído.
- Erros são apresentados por linha e produtos válidos não ficam públicos automaticamente.
- XLSX, CSV com acentos e arquivo aberto no Excel em português preservam os dados.
- Fórmulas/macros não são executadas.
- Arquivo e sessão expiram nos prazos definidos.

## 6.7 ZIP de fotos

- Fotos gerais e de variação são associadas pelos nomes definidos.
- Arquivo desconhecido aparece como não associado e não some silenciosamente.
- ZIP com `../`, caminho absoluto, tipo falso, excesso de arquivos ou expansão abusiva é rejeitado.
- A prévia permite conferir e corrigir associações antes de confirmar.
- Imagens órfãs de importação abandonada são eliminadas.

## 6.8 Moderação

- Conteúdo proibido de texto e imagem não fica público.
- Conteúdo ambíguo segue para revisão humana.
- Falha do provedor em produção não aprova publicação.
- Resposta atrasada não reativa item excluído nem desfaz decisão humana.
- Edição durante análise invalida o resultado da versão antiga.
- Denúncias abertas de usuários distintos no limite de ocultação impedem publicação automática, reativação e renovação diretas, em qualquer ordem entre a denúncia e a edição, pausa, expiração ou análise (RN-MOD-008).
- Rejeição apresenta motivo compreensível e libera cota.
- Chamadas de moderação não reduzem a franquia de IA do usuário.

## 6.9 IA do usuário

- Free não acessa geração/melhoria.
- Pro bloqueia o 11º sucesso mensal; Business bloqueia o 31º.
- Falha técnica estorna a reserva.
- Repetir a mesma solicitação idempotente não cobra duas vezes.
- Mudança de ciclo permite a nova cota sem apagar histórico.

## 6.10 Login social

- Em produção aparecem Google e Apple, além de e-mail/senha.
- Novo login social conclui aceites e seleção de condomínio.
- Conta retornante acessa o mesmo usuário.
- Apple funciona com e-mail relay e ausência posterior de nome.
- Google e Apple retornam à mesma conta quando previamente vinculados pelo fluxo seguro.
- Usuário não consegue remover o último método de acesso.
- Cookies de sessão são seguros e não há token sensível em armazenamento local.

## 6.11 Expiração e downgrade

- Todas as publicações expiram em 30 dias, sem diferença por plano.
- Renovação sem vaga é recusada antes de consumir qualquer recurso.
- Escolhas válidas de downgrade são respeitadas por tipo.
- Sem escolha, ficam ativas as publicações mais recentemente ativadas.
- Se o downgrade reduzir 10→5 ou 5→3 condomínios, a escolha de prédios é aplicada antes das cotas locais; sem escolha, prevalece a atividade mais recente.
- Excedentes ficam pausados e editáveis conforme as demais permissões.
- Produto variado ao cair para Free fica invisível e somente leitura por 60 dias.
- Avisos são enviados uma única vez em cada marco.
- Upgrade cancela a exclusão, mas não ativa automaticamente.
- Após 60 dias, a limpeza é idempotente e preserva referência mínima de conversas.

## 6.12 Qualidade de lançamento

- Migrações executam antes da inicialização do módulo de autenticação.
- Testes unitários, de integração e principais jornadas ponta a ponta passam.
- Formatação, lint, tipos e build passam em ambiente limpo.
- Dependências críticas conhecidas foram atualizadas ou têm risco formalmente aceito.
- Segredos e credenciais de produção não estão no repositório.
- Jobs podem ser repetidos sem duplicar notificações, consumo, publicação ou exclusão.
- Métricas e alertas cobrem autenticação, moderação, importação, pagamentos e jobs.

## 6.13 Compartilhamento por WhatsApp

- O botão aparece somente em publicação ativa e para usuário autenticado com acesso válido a ela.
- Free, Pro e Business podem compartilhar Produto, Serviço, Indicação e `Procuro`.
- A opção WhatsApp abre uma mensagem com link funcional; copiar link funciona como alternativa.
- Visitante anônimo não recebe título, descrição, foto ou endereço do anúncio antes de autenticar.
- Login por e-mail ou social retorna diretamente ao anúncio, sem perder o destino.
- Cadastro novo conclui os passos obrigatórios e segue para o anúncio, não para o feed.
- Usuário autenticado fora do raio abre e inicia chat naquela publicação pelo convite válido.
- `Procuro` compartilhado pode ser respondido pelo convidado mesmo fora do limite 1/5/10 km.
- WhatsApp de contato continua invisível quando o autor não tem o benefício ou não o habilitou.
- Produto variável continua exigindo a seleção da combinação.
- O convite não libera o feed do condomínio nem outra publicação fora do raio.
- URL comum sem convite continua bloqueada pela distância.
- Publicação pausada, expirada, moderada, rejeitada, removida ou excluída não abre pelo convite antigo.
- Token inventado, revogado ou expirado não revela se a publicação existe.
- O fluxo não gera página indexável nem conteúdo público para buscadores.

## 6.14 Telefone único e verificado

- Conta nova recebe prazo exatamente cinco dias após a criação.
- Conta existente recebe prazo cinco dias após a ativação da regra, sem usar retroativamente sua data antiga de cadastro.
- Durante a carência, a conta funciona e mostra aviso persistente com prazo e ação de verificação.
- O mesmo número em formatos brasileiros diferentes é normalizado para a mesma identidade E.164.
- Informar o telefone sem confirmar o código não o reserva contra seu verdadeiro titular.
- Duas confirmações concorrentes do mesmo telefone resultam em apenas uma associação bem-sucedida.
- Código expirado, reutilizado ou acima do limite de tentativas é rejeitado.
- Reenvios excessivos são limitados sem revelar se o telefone pertence a outra conta.
- No instante do prazo, uma requisição protegida é bloqueada mesmo que o job ainda não tenha executado.
- Conta bloqueada só acessa verificação, recuperação/segurança permitida, suporte, informações legais e logout.
- Publicações do bloqueado desaparecem do feed, busca, detalhe compartilhado e novos contatos.
- Bloqueio não muda o estado das publicações, não libera cotas, não interrompe expiração e não cancela assinatura.
- Verificação desbloqueia imediatamente e devolve visibilidade somente às publicações ainda ativas e válidas.
- Troca mantém o telefone atual até o novo ser confirmado.
- Telefone já pertencente a outra conta não provoca mesclagem automática.
- WhatsApp do próprio autor usa somente o telefone verificado.
- Número de prestador indicado pode coincidir com telefone de usuário e continua sujeito ao consentimento, não à unicidade de identidade.
- Logs, URLs e analytics não contêm número completo nem OTP.
- Convite de condomínio ou publicação retoma o destino depois da verificação obrigatória.
