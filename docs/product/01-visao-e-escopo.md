# 1. Visão e escopo

## 1.1 Visão do produto

O Aqui no Prédio organiza, em uma plataforma própria, as trocas que hoje acontecem de maneira dispersa em grupos de WhatsApp de prédios e condomínios brasileiros.

Um morador poderá:

- vender um produto;
- oferecer um serviço;
- publicar que está procurando algo;
- indicar um prestador de serviço;
- descobrir oportunidades no próprio condomínio e nas proximidades;
- conversar com outros usuários com privacidade e contexto.

A proposta não é criar um e-commerce completo. A plataforma aproxima pessoas; pagamento, frete, estoque, checkout, comissão e garantia da transação não fazem parte da primeira versão.

## 1.2 Princípios

1. **Local primeiro:** o condomínio é a origem geográfica e social das publicações.
2. **Simplicidade:** publicar e responder deve exigir poucos passos.
3. **Privacidade:** endereços de unidades, dados pessoais e contatos não devem ser expostos desnecessariamente.
4. **Confiança:** prédios e conteúdos passam por validações automáticas e, quando necessário, humanas.
5. **Limites claros:** benefícios de plano devem ser aplicados no servidor e explicados antes de bloquear uma ação.
6. **Sem complexidade de e-commerce:** variações existem para representar opções do produto, sem controle de estoque ou compra dentro da plataforma.
7. **Crescimento responsável:** atributos privados, importação e imagens têm limites para evitar uma base desnecessariamente grande.

## 1.3 Tipos de publicação

### Produto

Oferta de um bem. Pode ter preço, fotos e, nos planos pagos, atributos e variações.

### Serviço

Oferta de um serviço prestado pelo próprio anunciante ou por seu negócio.

### Procuro

Pedido de produto ou serviço. O autor informa o que busca; quem visualiza pode responder se estiver dentro do alcance permitido pelo próprio plano.

### Indicação de serviço

Recomendação de um prestador. Se o contato for de terceiro, o publicador deve confirmar que possui autorização para divulgá-lo.

### Fora do escopo

- indicação de produto;
- compra, pagamento ou entrega dentro da plataforma;
- estoque por variação;
- publicidade pública indexável em Google e outros buscadores;
- destaque pago e “subir anúncio”;
- atributos e variações para serviços, `Procuro` ou indicações.

## 1.4 Condomínios

O usuário busca seu condomínio por endereço. A identificação não pode depender somente do CEP, pois existem municípios com CEP único.

O conjunto mínimo para validação é:

- CEP;
- logradouro;
- número;
- cidade e estado;
- coordenadas quando obtidas de fonte confiável.

Se o condomínio ainda não existir, o usuário pode solicitar seu cadastro dentro do limite cumulativo de seu plano. A plataforma deve verificar duplicidade, existência do endereço e indícios de que o local é realmente residencial/coletivo. Casos incertos seguem para revisão.

Depois do cadastro, o usuário poderá gerar um convite específico daquele condomínio. O destino do convite deve ser preservado durante login, cadastro e onboarding.

O vínculo informado pelo usuário não comprova que ele reside no local. A plataforma pode permitir vínculo e navegação em vários condomínios, mas limita quantos deles podem conter publicações ativas ou em moderação ao mesmo tempo: Free 3, Pro 5 e Business 10. A interface não deve chamar o usuário de `morador verificado` sem uma futura validação específica.

## 1.5 Experiência de descoberta

O usuário navega a partir de um condomínio selecionado. Para anúncios comuns, o autor escolhe um alcance permitido por seu plano. Para `Procuro`, o alcance é determinado pelo plano de quem está visualizando e pretende responder.

Cada publicação possui um único condomínio de origem. Publicar a mesma oferta em outro prédio cria outra publicação, consome a cota daquele prédio e passa novamente pelas regras de moderação. O alcance é sempre calculado a partir da origem daquela publicação.

A interface informa:

- `No mesmo condomínio`, quando a origem e o contexto selecionado forem o mesmo prédio;
- a distância aproximada, nos demais casos.

Links diretos nunca podem contornar as mesmas regras aplicadas ao feed e à busca.

A exceção é o link de compartilhamento gerado pelo botão `Compartilhar` de uma publicação ativa. Ele funciona como convite específico para aquela publicação: exige autenticação, preserva o destino durante login ou cadastro e libera o detalhe independentemente da distância. Não concede vínculo com o condomínio nem acesso a outras publicações fora do raio.

## 1.6 Autenticação e entrada

Desde o lançamento público, a plataforma aceita:

- e-mail e senha;
- Google;
- Apple.

Um novo usuário social ainda deve concluir onboarding, aceitar termos e política de privacidade, confirmar idade mínima de 18 anos e selecionar ou solicitar seu condomínio.

Toda conta deve cadastrar um telefone pessoal e comprová-lo por código de uso único. O telefone verificado é único na plataforma e funciona como identificador adicional da pessoa, sem substituir os métodos de login. A conta recebe cinco dias de carência; depois do prazo, permanece restrita até concluir a verificação.

Quando a entrada ocorrer por compartilhamento, a intenção original deve sobreviver a todo esse fluxo e levar o usuário à publicação assim que as etapas obrigatórias forem concluídas.

## 1.7 Estado atual e objetivo

A base atual já contém boa parte da estrutura para anúncios, chat, autenticação, planos, geolocalização, moderação e arquivos. A documentação aqui descreve o **estado desejado**. O roadmap define a ordem segura para adaptar a base existente sem reescrevê-la integralmente.
