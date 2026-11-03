# 3. Regras de negócio

Os códigos abaixo são estáveis e devem ser usados em tarefas, testes e registros de decisão.

## Planos e cotas

- **RN-PLAN-001:** existem os planos Free, Pro mensal e Business mensal, conforme a matriz comercial.
- **RN-PLAN-002:** todo benefício é validado no servidor; a interface apenas antecipa o resultado.
- **RN-PLAN-003:** as cotas de publicação são separadas por produto, serviço, indicação de serviço e `Procuro`, e são calculadas individualmente em cada condomínio de origem.
- **RN-PLAN-004:** estados ativo e em moderação consomem simultaneamente a cota da categoria naquele condomínio e, quando forem a primeira publicação contabilizável do local, uma vaga de condomínio de publicação; estados não publicáveis não consomem.
- **RN-PLAN-005:** a plataforma deve reservar de forma atômica tanto a vaga da categoria quanto a vaga do condomínio para impedir operações simultâneas acima de qualquer limite.
- **RN-PLAN-006:** valores e limites comerciais devem ser configuráveis e auditáveis.
- **RN-PLAN-007:** indicação de produto não existe na primeira versão.
- **RN-PLAN-008:** destaque, “subir anúncio” e exposição especial em buscadores não integram os planos.
- **RN-PLAN-009:** a conta pode manter publicações ativas ou em moderação em até 3 condomínios no Free, 5 no Pro e 10 no Business.
- **RN-PLAN-010:** criar ou vincular-se a um condomínio e navegar por ele não ocupa vaga de condomínio de publicação.
- **RN-PLAN-011:** um condomínio ocupa uma vaga quando possui ao menos uma publicação do usuário ativa ou em moderação e libera a vaga quando não possui nenhuma publicação nesses estados.
- **RN-PLAN-012:** cada publicação possui exatamente um condomínio de origem; republicar a mesma oferta em outro condomínio cria outra publicação e consome a cota local correspondente.
- **RN-PLAN-013:** rascunhos não ocupam a cota nem a vaga de condomínio, mas permanecem sujeitos a retenção e controles de abuso.
- **RN-PLAN-014:** a plataforma não deve afirmar que o vínculo autodeclarado comprova residência ou exibir selo de morador verificado sem validação específica.
- **RN-PLAN-015:** a primeira versão não oferece ativação automática em massa da mesma publicação em vários condomínios.

## Condomínios

- **RN-BLD-001:** a busca e validação utilizam CEP, logradouro, número, cidade e estado; CEP sozinho não identifica o prédio.
- **RN-BLD-002:** endereços são normalizados e geocodificados antes da decisão de duplicidade.
- **RN-BLD-003:** endereço confirmado como duplicado reaproveita o condomínio existente.
- **RN-BLD-004:** a criação cumulativa por conta respeita 3/7/20 para Free/Pro/Business.
- **RN-BLD-005:** vínculo com condomínio existente não consome criação.
- **RN-BLD-006:** tentativa inválida ou duplicada não consome permanentemente a cota, sem prejuízo de limite de tentativas.
- **RN-BLD-007:** prédio não verificado fica restrito a interações internas ao próprio condomínio.
- **RN-BLD-008:** toda decisão automática pode resultar em aprovado, revisão humana ou rejeitado; incerteza não é aprovação.
- **RN-BLD-009:** convite identifica o condomínio e mantém esse contexto após autenticação e onboarding.

## Publicações e ciclo de vida

- **RN-ADS-001:** publicação nova começa como rascunho ou em moderação; nunca fica pública antes das validações exigidas.
- **RN-ADS-002:** publicação aprovada expira 30 dias após ativação ou renovação.
- **RN-ADS-003:** renovação é gratuita, adiciona 30 dias e requer vaga na cota daquela categoria e, se o prédio não estiver ocupado pela conta, uma vaga de condomínio de publicação.
- **RN-ADS-004:** edição material, denúncia ou sinal de risco envia o conteúdo novamente à moderação.
- **RN-ADS-005:** exclusão, pausa e renovação devem ser idempotentes.
- **RN-ADS-006:** a ordenação considera proximidade, relevância, legitimidade e data real de publicação/renovação, sem vantagem paga oculta.

## Distância de anúncios comuns

- **RN-GEO-001:** produto e serviço têm origem no condomínio escolhido na publicação.
- **RN-GEO-002:** o autor escolhe entre mesmo condomínio, 0,5 km, 1 km, 2 km, 3 km, 5 km e 10 km, limitado ao plano.
- **RN-GEO-003:** o padrão é somente o próprio condomínio.
- **RN-GEO-004:** o destino do cálculo é o condomínio ativo selecionado pelo visitante.
- **RN-GEO-005:** vários vínculos não são combinados; trocar o condomínio ativo recalcula os resultados.
- **RN-GEO-006:** mesmo condomínio é igualdade de identificador do prédio, não proximidade geográfica.
- **RN-GEO-007:** sem coordenadas confiáveis ou com origem não verificada, só é permitido o mesmo condomínio.
- **RN-GEO-008:** feed, busca, detalhe, favorito, contato e link direto comum aplicam a mesma autorização geográfica; somente o convite de compartilhamento válido descrito em RN-SHR concede exceção pontual.
- **RN-GEO-009:** a distância é aproximada, em linha reta entre prédios, e não utiliza localização da unidade ou GPS contínuo.
- **RN-GEO-010:** o alcance efetivo nunca supera o menor valor entre alcance salvo e máximo do plano atual.

## Regra especial de `Procuro`

- **RN-WNT-001:** o autor de `Procuro` não escolhe raio.
- **RN-WNT-002:** o plano do visitante determina até onde ele pode descobrir e iniciar contato: 1/5/10 km.
- **RN-WNT-003:** o plano do autor limita a quantidade simultânea de publicações `Procuro` em 1/10/25 por condomínio, além do limite geral de 3/5/10 condomínios de publicação.
- **RN-WNT-004:** a origem é o condomínio da publicação; o destino é o condomínio ativo do visitante.
- **RN-WNT-005:** a regra é aplicada no feed, busca, detalhe, favoritos, chat, WhatsApp e links diretos comuns; um convite RN-SHR válido libera somente a publicação compartilhada.
- **RN-WNT-006:** uma conversa já iniciada permanece acessível após mudança de plano ou distância.
- **RN-WNT-007:** upgrade amplia imediatamente novas descobertas; downgrade reduz imediatamente novas descobertas e novos contatos.
- **RN-WNT-008:** WhatsApp em `Procuro` continua dependente do plano e da escolha do autor, não do plano do visitante.

## Chat e WhatsApp

- **RN-COM-001:** chat interno está disponível em todos os planos, desde que a publicação esteja acessível.
- **RN-COM-002:** o autor Pro ou Business pode habilitar WhatsApp na publicação.
- **RN-COM-003:** qualquer visitante autorizado pode clicar no WhatsApp habilitado, independentemente do próprio plano.
- **RN-COM-004:** indicação com contato de terceiro exige declaração explícita de autorização.
- **RN-COM-005:** produto com variação exige a seleção completa antes de abrir chat ou WhatsApp.
- **RN-COM-006:** a seleção da variação é gravada como contexto da conversa.

## Compartilhamento e aquisição de usuários

- **RN-SHR-001:** toda publicação ativa de Produto, Serviço, Indicação de serviço ou `Procuro` exibe o botão `Compartilhar` aos usuários autenticados que possam visualizá-la legitimamente.
- **RN-SHR-002:** o compartilhamento está disponível em todos os planos e oferece WhatsApp; a interface também pode oferecer a função nativa do dispositivo e copiar link.
- **RN-SHR-003:** o link compartilhado contém um convite opaco e não equivale à URL comum do detalhe.
- **RN-SHR-004:** visitante não autenticado não vê o conteúdo do anúncio; é encaminhado a login ou cadastro com a intenção de destino preservada.
- **RN-SHR-005:** após concluir autenticação, onboarding e aceites obrigatórios, o usuário é levado diretamente à publicação compartilhada.
- **RN-SHR-006:** convite válido ignora a regra de distância somente para visualizar e interagir com aquela publicação, incluindo iniciar chat e, quando o autor tiver habilitado, abrir WhatsApp.
- **RN-SHR-007:** o convite não concede vínculo com o condomínio, acesso ao feed local ou acesso a qualquer outra publicação fora do raio normal.
- **RN-SHR-008:** somente publicação atualmente ativa pode ser compartilhada ou aberta pela exceção. Pausa, expiração, moderação, rejeição, remoção ou exclusão revogam os convites existentes.
- **RN-SHR-009:** o convite não contorna bloqueios entre usuários, moderação, consentimento de contato, seleção obrigatória de variação nem qualquer regra de segurança diferente da distância.
- **RN-SHR-010:** convite inválido, expirado ou revogado apresenta indisponibilidade sem revelar dados privados e permite seguir para a experiência normal da plataforma.
- **RN-SHR-011:** a página anterior à autenticação e o link de convite não devem expor o conteúdo a mecanismos de busca nem reintroduzir a feature de SEO removida.
- **RN-SHR-012:** criação, abertura e conversão do convite são auditáveis e sujeitas a limite de abuso, sem registrar conteúdo sensível na URL.

## IA do usuário

- **RN-AI-001:** Pro recebe 10 e Business 30 usos mensais; Free não possui o benefício.
- **RN-AI-002:** gerar e melhorar conteúdo consomem uma unidade quando houver entrega bem-sucedida.
- **RN-AI-003:** falha técnica não consome unidade e repetição idempotente não duplica consumo.
- **RN-AI-004:** chamadas internas de segurança, endereço e fraude são contabilizadas separadamente.
- **RN-AI-005:** o contador reinicia no ciclo mensal definido pela plataforma.

## Atributos e variações

- **RN-VAR-001:** somente Pro e Business podem criar ou editar produto com variações.
- **RN-VAR-002:** um produto tem no máximo dois atributos variáveis e dez valores por atributo.
- **RN-VAR-003:** somente combinações oferecidas são persistidas, até 20 variações por produto.
- **RN-VAR-004:** cada variação pode ter preço, ordem, estado, fotos e SKU opcional.
- **RN-VAR-005:** não existe estoque por variação na primeira versão.
- **RN-VAR-006:** um anúncio possui até seis fotos gerais, duas associações de foto por variação e vinte arquivos de imagem únicos no total.
- **RN-VAR-007:** a mesma imagem física pode ser associada a várias variações sem duplicação do arquivo.
- **RN-VAR-008:** sem foto própria, a variação usa as fotos gerais.
- **RN-VAR-009:** preço idêntico é exibido normalmente; preços diferentes exibem `A partir de` com o menor preço ativo.
- **RN-VAR-010:** preço por variação só é permitido no modo de preço fixo; outros modos valem para o produto inteiro.
- **RN-VAR-011:** atributos oficiais vêm de catálogo por categoria; atributo ou valor ausente pode ser criado de forma privada pelo usuário.
- **RN-VAR-012:** itens privados não aparecem para outros usuários nem viram filtro global automaticamente.
- **RN-VAR-013:** cada conta pode manter até 20 atributos privados e 100 valores privados.
- **RN-VAR-014:** rótulos usados no anúncio são preservados em snapshot para não mudar retroativamente.
- **RN-VAR-015:** no máximo um atributo define o agrupamento principal de fotos.

## Importação em lote

- **RN-IMP-001:** somente Pro e Business importam produtos.
- **RN-IMP-002:** o usuário escolhe o condomínio e baixa modelo XLSX ou CSV.
- **RN-IMP-003:** XLSX é o formato principal; CSV é UTF-8 com BOM e separador compatível com Excel em português.
- **RN-IMP-004:** Pro aceita até 20 produtos e 400 linhas de variação por arquivo; Business aceita 50 e 1.000.
- **RN-IMP-005:** cada linha representa uma variação; linhas com o mesmo `codigo_produto` formam um anúncio.
- **RN-IMP-006:** `codigo_produto` e `codigo_variacao` são obrigatórios e estáveis na importação; produto sem variação usa `codigo_variacao = UNICA`.
- **RN-IMP-007:** o código identifica o produto no escopo usuário + condomínio; título nunca é chave de atualização.
- **RN-IMP-008:** a prévia distingue novo, atualização, erro e duplicidade antes da confirmação.
- **RN-IMP-009:** linha ausente não exclui conteúdo existente; exclusão requer ação explícita.
- **RN-IMP-010:** confirmar novamente a mesma sessão não cria duplicatas.
- **RN-IMP-011:** produtos válidos entram como rascunho; só ficam públicos após fotos, revisão e moderação.
- **RN-IMP-012:** ZIP de fotos aceita nomes por produto e por variação e passa por validação contra arquivos maliciosos.
- **RN-IMP-013:** a planilha original é apagada após processamento ou, no máximo, em sete dias; sessão não confirmada expira em sete dias.
- **RN-IMP-014:** rascunho importado e abandonado expira em 30 dias, com aviso e limpeza de imagens órfãs.

## Moderação

- **RN-MOD-001:** textos, imagens, atributos, variações, indicações e itens importados passam pela mesma política de segurança.
- **RN-MOD-002:** o resultado é aprovado, revisão humana ou proibido.
- **RN-MOD-003:** falha do provedor em produção nunca significa aprovação automática.
- **RN-MOD-004:** rejeição libera a cota e apresenta motivo curto, correção e recurso quando aplicável.
- **RN-MOD-005:** são proibidos conteúdo sexual/adulto, exploração, promoção político-partidária, ódio, ameaça, assédio, ilegalidades, armas, drogas, fraude, pirâmide, jogo ilegal, falsificação, violação de propriedade intelectual, dados pessoais de terceiros e conteúdo enganoso.
- **RN-MOD-006:** contexto político incidental e situações ambíguas seguem para revisão humana.
- **RN-MOD-007:** uma resposta atrasada de IA não pode republicar conteúdo excluído nem sobrescrever decisão humana posterior.
- **RN-MOD-008:** quando as denúncias abertas de usuários distintos atingem o limite configurável de ocultação, a publicação não volta ao ar automaticamente — nem por moderação automática (IA ou regras), nem por reativação, nem por renovação — e aguarda revisão humana. Vale também para a denúncia admitida com a publicação ativa que só termina depois de edição, pausa ou expiração: publicação pausada ou expirada fica marcada para revisão sem mudar de estado, e a que estiver em moderação recebe o aviso de ocultação. Denúncia nunca altera publicação excluída ou removida, mas permanece registrada. Limite, elegibilidade para denunciar e resolução pelo admin não mudam; a aprovação do admin continua encerrando todas as denúncias abertas. (Aprovada pelo proprietário em 29/10/2026, P00-B1-F8.)

## Autenticação

- **RN-AUTH-001:** o lançamento oferece e-mail/senha, Google e Apple.
- **RN-AUTH-002:** a sessão web utiliza cookie seguro e `httpOnly`; token não fica exposto em armazenamento local.
- **RN-AUTH-003:** novo usuário social conclui os mesmos aceites e onboarding exigidos dos demais, incluindo a confirmação de idade mínima de 18 anos.
- **RN-AUTH-004:** o perfil oferece gerenciamento dos métodos de acesso.
- **RN-AUTH-005:** o último método de acesso não pode ser removido.
- **RN-AUTH-006:** contas Google e Apple verificadas podem seguir as regras seguras de vinculação definidas pela plataforma.
- **RN-AUTH-007:** sem e-mail utilizável, a plataforma não cria endereço fictício; orienta o uso de outro método.
- **RN-AUTH-008:** Google ou Apple podem ficar ocultos em desenvolvimento sem credenciais, mas ambos são obrigatórios em produção.

## Identidade e verificação de telefone

- **RN-PHN-001:** toda conta deve possuir exatamente um telefone pessoal verificado para permanecer plenamente ativa após o período de carência.
- **RN-PHN-002:** o telefone é normalizado no formato internacional E.164 antes de comparação, armazenamento ou envio de código.
- **RN-PHN-003:** um telefone verificado só pode pertencer a uma conta ativa por vez; a vinculação é garantida atomicamente no servidor.
- **RN-PHN-004:** cadastrar um número pendente não comprova posse nem deve impedir que o verdadeiro titular o verifique em outra conta; a unicidade definitiva é adquirida somente na confirmação do código.
- **RN-PHN-005:** o prazo de cinco dias corridos começa na criação da conta. Contas existentes recebem cinco dias a partir da ativação da regra em produção.
- **RN-PHN-006:** durante a carência, a conta funciona normalmente, mas exibe aviso persistente, prazo e ação para reenviar ou alterar o número.
- **RN-PHN-007:** vencido o prazo sem verificação, a conta entra em `PHONE_VERIFICATION_BLOCKED` independentemente da execução do job; toda requisição protegida deve validar o prazo.
- **RN-PHN-008:** a conta bloqueada só pode acessar verificação do telefone, segurança/recuperação permitida, suporte, informações legais e encerramento da sessão.
- **RN-PHN-009:** enquanto a conta estiver bloqueada, suas publicações não aparecem em feed, busca ou compartilhamento, e novas mensagens ou contatos ficam impedidos; os registros não são excluídos e continuam seguindo sua expiração normal.
- **RN-PHN-010:** após a verificação, a conta é desbloqueada imediatamente e publicações ainda ativas, não expiradas e não removidas voltam a ser elegíveis para exibição sem nova moderação se o conteúdo não mudou.
- **RN-PHN-011:** o telefone usado como contato direto do próprio anunciante deve ser o telefone verificado da conta; telefone de terceiro em Indicação de serviço segue a regra específica de consentimento e não precisa ser único.
- **RN-PHN-012:** trocar o telefone exige autenticação recente e verificação do novo número antes de substituir o atual; o telefone antigo permanece válido até a confirmação.
- **RN-PHN-013:** encontrar o mesmo telefone em outra conta nunca provoca mesclagem automática; o usuário recebe orientação segura para acessar ou recuperar a conta existente.
- **RN-PHN-014:** códigos de verificação são temporários, de uso único, protegidos contra tentativa repetida e nunca armazenados ou registrados em texto puro.
- **RN-PHN-015:** envio e validação de código têm limites por conta, telefone, IP e dispositivo, com mensagens que evitam confirmar a existência de outra conta.
- **RN-PHN-016:** telefone, código e estado de verificação são dados sensíveis; logs, URLs, analytics e mensagens de erro não podem expô-los integralmente.
- **RN-PHN-017:** convites de condomínio e de publicação preservam o destino durante a verificação; conta já bloqueada conclui a verificação antes de seguir ao destino.
- **RN-PHN-018:** bloqueio por telefone não libera cotas nem vagas de condomínio, não interrompe cobrança e não altera o estado persistido das publicações.

## Downgrade e retenção

- **RN-DWN-001:** antes do downgrade, o usuário pode escolher quais condomínios de publicação permanecem e quais publicações ficam ativas por tipo dentro deles.
- **RN-DWN-002:** sem escolha, permanecem primeiro os condomínios com atividade publicável mais recente e, dentro deles, as publicações ativadas mais recentemente até cada novo limite.
- **RN-DWN-003:** excedentes são pausados, não excluídos.
- **RN-DWN-004:** alcance é reduzido e persistido imediatamente, sem restauração automática em upgrade posterior.
- **RN-DWN-005:** produto com variações em plano Free fica bloqueado e invisível por 60 dias.
- **RN-DWN-006:** upgrade dentro da janela cancela a exclusão, mas não ativa o produto automaticamente.
- **RN-DWN-007:** expiração da janela exclui dados específicos e imagens sem uso, preservando referência mínima para auditoria e conversa.
- **RN-DWN-008:** notificações e rotinas de downgrade são idempotentes.
