# Transição da documentação

Data: 28/10/2026. Escopo: preparação documental na branch `chore/context-engineering`.

## Origem e preservação

- Repositório oficial: `/Users/leandromaciel/Projects/aquinopredio`.
- Pacote externo: `/Users/leandromaciel/Documents/ChatGPT/Aqui no Prédio/documentacao-definitiva`.
- Os 13 arquivos Markdown do pacote foram incorporados em `docs/product/`, com versões e datas originais preservadas.
- Os sete documentos antigos foram movidos sem alteração de conteúdo para `docs/current-state/`. O índice antigo foi preservado com um aviso histórico.
- A fonte externa permanece intacta. O pacote incorporado descreve o alvo, não comprova a implementação.

## Adaptações da cópia

- Referências `../documentacao-definitiva` e menções ao diretório foram adaptadas para `docs/product/`.
- Só espaço em branco (03/11/2026, para o `git diff --check` da entrega): linha em branco extra no fim de 10 arquivos removida; quebras de linha por dois espaços finais trocadas por `\` (mesma renderização em CommonMark). Texto inalterado.
- O guia 11 foi contextualizado para o Git existente, pasta oficial e branch atual; comandos de inicialização e commit/merge automático da preparação foram retirados.
- Commit, merge e push dependem de autorização explícita. Os comandos funcionais de fases futuras não foram executados.
- `AGENTS.md` aponta para o alvo e distingue convenções técnicas, referências históricas e evidência de implementação. `CLAUDE.md` permanece intacto.
- O README da raiz identifica sua lista anterior de capacidades como histórica e ainda não auditada.

## Correspondência de regras

Este mapa é temático, não uma renumeração automática. O texto definitivo prevalece; nenhuma equivalência implica conclusão de implementação.

| Referência histórica | Referência definitiva | Tratamento |
|---|---|---|
| RN-001, RN-004–005 | RN-AUTH-001–003 | Métodos e onboarding ampliados; Apple obrigatório no lançamento |
| RN-002–003 | RN-PHN | Telefone opcional anterior substituído por identidade verificada e carência de cinco dias |
| RN-020–030, RN-032–034 | RN-BLD; RN-GEO-007 | Endereço, evidências, duplicidade e cotas precisam seguir o novo texto; não transportar thresholds automaticamente |
| RN-035–041 | RN-PLAN-009–014; RN-GEO-004–006 | Vínculo não comprova residência; limite de vínculos anterior não equivale a condomínios de publicação |
| RN-050–056 | RN-ADS; RN-AI; RN-MOD | Criação, IA e moderação com novas condições e contabilização |
| RN-057–059, RN-070 | RN-GEO; RN-WNT | Separar alcance comum e alcance de Procuro pelo visitante |
| RN-061–068, RN-071 | RN-ADS; RN-PLAN-003–008 | Novas cotas e validade universal; subir anúncio e vantagem paga removidos |
| RN-080–085 | RN-COM; RN-GEO-008; RN-WNT-005–006 | Revalidar contato, acesso e continuidade; limites antispam antigos não são automaticamente aprovados |
| RN-088 | RN-SHR | Convite opaco concede exceção pontual; URL comum mantém autorização geográfica |
| RN-089 | RN-COM-004; RN-PLAN-003; RN-MOD; P10 | Indicação passa a cota própria, alcance comum, consentimento e validade definitivos |
| RN-090–096, RN-113 | RN-MOD | Política ampliada e proteção contra resultado obsoleto; falha em produção nunca aprova |
| RN-110–112 | RN-AI | Cota mensal por sucesso; segurança/validação separadas da franquia |
| RN-130–134, RNF-010–015 | Especificação técnica §§5.1, 5.10, 5.14–5.15, 5.18 | Preservar contexto de privacidade e segurança; verificar requisitos definitivos e implementação |
| RN-140–146 | RN-PLAN; RN-DWN; RN-ADS | Três planos e novos preços, cotas, validade e downgrade; sem destaque |
| Sem equivalente anterior | RN-VAR; RN-IMP; RN-BLD-009 | Variações, importação e convite de condomínio possuem especificação própria |

## Conteúdo histórico que requer investigação

Avaliações e recomendações de anúncios (RN-086–087), alertas de busca (RN-076), notificações (RN-120–122), selo e formas de verificação, PWA/offline e metas antigas permanecem preservados. Ausência de regra equivalente no pacote não autoriza remoção nem promoção a requisito comercial. Investigar por tarefa e pedir decisão quando necessário.

O modelo de dados, SQL, detalhes de OpenRouter, autenticação, uploads, geolocalização, realtime e configuração antigos são referências técnicas para investigação. Não copiar como verdade atual sem conferir código. Exemplos conhecidos de divergência interna histórica: consulta SQL que exclui anúncios próprios apesar da RN-074; uploads multipart versus URL pré-assinada; fluxos antigos com aprovação pelo admin do prédio apesar da remoção desse papel.

Os riscos de inicialização, callbacks atrasados, testes assíncronos, dependências e Biome do pacote definitivo são relatos do diagnóstico recebido. Sua reprodução e classificação pertencem ao diagnóstico P00.
