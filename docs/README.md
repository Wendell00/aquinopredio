# Documentação — Aqui no Prédio

## Fonte de verdade e precedência

A [especificação definitiva v1.4](product/README.md), consolidada em 26/10/2026, define o produto desejado. Em conflito com documentos anteriores, **prevalece `docs/product/`**. Mudanças comerciais exigem decisão explícita do proprietário e atualização dos documentos relacionados.

| Diretório | Finalidade |
|---|---|
| [product/](product/README.md) | Produto aprovado: visão, planos, regras, fluxos, técnica, aceite, roadmap e catálogo |
| [current-state/](current-state/README.md) | Especificação anterior preservada como histórico; não é auditoria do código atual |
| [implementation/STATUS.md](implementation/STATUS.md) | Andamento, evidências, checks, pendências e próxima ação |
| [implementation/DOCUMENTATION-TRANSITION.md](implementation/DOCUMENTATION-TRANSITION.md) | Origem dos arquivos, adaptações e correspondência entre regras antigas e definitivas |

## Como consultar

1. Confira o [estado de implementação](implementation/STATUS.md).
2. Localize o domínio na [matriz de rastreabilidade](product/10-matriz-de-rastreabilidade.md).
3. Leia apenas regras, critérios de aceite e seções técnicas relevantes à tarefa.
4. Investigue código e testes antes de declarar capacidade implementada.

`CLAUDE.md` permanece com `@AGENTS.md`. Não carregar a documentação completa como contexto permanente. O [guia operacional](product/11-guia-context-engineering-vscode-claude-code.md) orienta entregas incrementais; fases 0–8 e prompts P00–P11 possuem numerações diferentes.

As referências RN numéricas e RNF existentes em código, testes e histórico não foram renumeradas nesta preparação. Novas entregas devem citar os códigos definitivos do domínio e critérios de aceite. Correspondências parciais não equivalem a regras idênticas.
