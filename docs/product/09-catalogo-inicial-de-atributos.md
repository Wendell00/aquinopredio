# 9. Catálogo inicial de atributos de produto

Estado: aprovado para a primeira versão.

## Princípios

O catálogo contém opções reais do mesmo produto que podem alterar preço ou foto. Ele não transforma a plataforma em e-commerce.

- Aplica-se somente a Produto.
- Sugestões variam por categoria e não são obrigatórias.
- O anúncio usa até dois atributos variáveis e apenas um pode definir o agrupamento principal de fotos.
- Atributos oficiais possuem código estável e rótulo editável.
- Combinações são únicas.
- Usuários podem criar atributos e valores privados dentro dos limites do plano.
- Marca, condição, conservação, modelo geral e estoque não são eixos de variação no MVP.

## Valores oficiais reutilizáveis

| Atributo | Valores iniciais |
|---|---|
| Cor | Preto, Branco, Cinza, Prata, Dourado, Marrom, Bege, Vermelho, Rosa, Laranja, Amarelo, Verde, Azul, Roxo, Transparente, Multicolorido |
| Tamanho de roupa | PP, P, M, G, GG, XGG, Único |
| Numeração de calçados | inteiros de 15 a 48 |
| Voltagem | 110/127 V, 220 V, Bivolt |
| Quantidade no kit | 1, 2, 3, 4, 5, 6, 10, 12, 24 unidades |
| Volume | 30, 50, 100, 200, 250, 300, 500, 750 ml; 1, 2, 5 L |
| Peso | 50, 100, 250, 500 g; 1, 2, 5 kg |
| Armazenamento | 8, 16, 32, 64, 128, 256, 512 GB; 1, 2 TB |
| Memória RAM | 2, 4, 6, 8, 12, 16, 32, 64 GB |
| Porte | PP, P, M, G, GG |
| Material | Algodão, Poliéster, Couro, Sintético, Madeira, MDF, Metal, Alumínio, Aço inox, Plástico, Vidro, Cerâmica, Silicone |
| Fragrância | Sem fragrância, Floral, Cítrica, Frutal, Doce, Amadeirada, Herbal, Fresca |
| Acabamento | Fosco, Brilhante, Acetinado, Metálico, Transparente |
| Idioma | Português, Inglês, Espanhol, Francês, Bilíngue |
| Nível | Iniciante, Intermediário, Avançado |
| Formato | Físico, Digital, Kit físico + digital |
| Conectividade | USB, USB-C, Bluetooth, Wi-Fi, P2/3,5 mm, HDMI, Sem fio |
| Faixa etária infantil | 0–3, 3–6, 6–9, 9–12 meses; 1, 2, 3, 4, 5, 6+ anos |

## Sugestões por categoria

| Categoria | Atributos oficiais sugeridos |
|---|---|
| Alimentação | Sabor, Tamanho da porção, Peso, Volume, Quantidade no kit |
| Beleza e Estética | Cor/Tonalidade, Volume, Fragrância, Acabamento, Quantidade no kit |
| Saúde e Bem-estar | Tamanho, Sabor, Peso, Volume, Quantidade no kit |
| Aulas e Educação | Idioma, Nível, Formato |
| Reparos e Manutenção | Voltagem, Medida, Diâmetro/Bitola, Cor, Quantidade no kit |
| Limpeza e Organização | Fragrância, Volume, Peso, Quantidade no kit |
| Pets | Porte, Sabor, Peso, Cor, Quantidade no kit |
| Crianças e Babás | Faixa etária, Tamanho de roupa, Numeração, Cor, Quantidade no kit |
| Tecnologia | Cor, Armazenamento, Memória RAM, Conectividade, Voltagem |
| Moda e Acessórios | Cor, Tamanho de roupa, Numeração de calçados, Material, Estampa |
| Casa e Decoração | Cor, Tamanho/Medida, Material, Voltagem, Quantidade no kit |
| Eletrônicos | Cor, Voltagem, Armazenamento, Capacidade, Potência, Conectividade |
| Veículos e Vagas de Garagem | Aro, Medida, Lado/Posição, Cor, Voltagem |
| Eventos e Festas | Cor, Tema, Tamanho, Material, Quantidade no kit |
| Transporte e Caronas | Nenhum atributo variável oficial no MVP |
| Outros | Cor, Tamanho, Material, Voltagem, Quantidade no kit |

## Valores abertos, mas privados

Começam com exemplos pesquisáveis e permitem valor particular:

- Sabor: Chocolate, Baunilha, Morango, Limão, Coco, Doce de leite;
- Estampa: Lisa, Floral, Listrada, Xadrez, Animal print;
- Tema: festas, personagens, cores e temas personalizados;
- Tamanho/Medida, Diâmetro/Bitola, Capacidade e Potência: número com unidade compatível;
- Tonalidade: cor básica mais nome do fabricante;
- Lado/Posição: Dianteiro, Traseiro, Esquerdo, Direito e combinações;
- Aro: 12 a 22, com valor privado fora da faixa;
- Modelo/Versão: apenas quando diferencia opções do mesmo produto.

Um valor privado não se torna oficial automaticamente. Promoção futura exige curadoria administrativa.

## Administração e persistência

- O catálogo oficial fica no banco, não fixo no formulário.
- Um seed idempotente cria os códigos iniciais.
- A administração pode ativar, desativar, ordenar e relacionar itens a categorias.
- Desativar impede novo uso, sem quebrar anúncio existente.
- O anúncio guarda origem e snapshot do rótulo.
- Valores equivalentes são normalizados para evitar `Preto`, `preto` e ` PRETO ` como itens distintos.
- Valores numéricos exigem unidade compatível.

## Relação com fotos

Um dos dois atributos pode definir fotos, normalmente Cor, Tonalidade, Estampa, Tema ou Sabor. Combinações que compartilham esse valor podem reutilizar a mesma imagem.

Exemplo: `Cor = Azul` define a galeria e `Tamanho = P/M/G` pode alterar preço sem repetir arquivos. Uma combinação específica ainda pode ter sua própria associação, dentro dos limites gerais.

## Limites consolidados

- 2 atributos variáveis por produto;
- 10 valores por atributo;
- 20 combinações persistidas;
- 6 fotos gerais;
- 2 associações de foto por variação;
- 20 arquivos únicos por produto;
- 20 atributos privados por usuário;
- 100 valores privados por usuário.

## Validação pós-lançamento

Medir quais valores privados aparecem com frequência e revisar o catálogo periodicamente. Não importar a complexidade integral de grandes marketplaces sem evidência de necessidade.
