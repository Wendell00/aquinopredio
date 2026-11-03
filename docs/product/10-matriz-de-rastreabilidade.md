# 10. Matriz de rastreabilidade

Esta matriz liga cada domínio às regras, fluxos, especificação, critérios de aceite, fase e prompt de implementação.

| Domínio | Regras | Fluxos | Técnica | Aceite | Roadmap | Prompt |
|---|---|---|---|---|---|---|
| Planos, cotas locais e condomínios de publicação | RN-PLAN | 4.4, 4.6, 4.7, 4.15 | 5.2, 5.3, 5.17 | 6.1 | Fase 1 | P01 |
| Condomínio e endereço | RN-BLD | 4.2 | 5.5 | 6.2 | Fase 2 | P03 |
| Convite de condomínio | RN-BLD-009 | 4.3 | 5.6 | 6.2 | Fase 2 | P03 |
| Ciclo da publicação | RN-ADS | 4.4, 4.11 | 5.3 | 6.1, 6.11 | Fase 1 | P01 |
| Distância comum | RN-GEO | 4.8 | 5.4 | 6.3 | Fase 4 | P05 |
| `Procuro` | RN-WNT | 4.6 | 5.4 | 6.4 | Fase 4 | P05 |
| Chat e WhatsApp | RN-COM | 4.4–4.8 | 5.4 | 6.3–6.5 | Fases 4 e 5 | P05, P10 |
| Compartilhamento | RN-SHR | 4.14 | 5.14 | 6.13 | Fase 4 | P05, P09 |
| IA do usuário | RN-AI | 4.4 | 5.11 | 6.9 | Fase 1 | P01 |
| Variações | RN-VAR | 4.5 | 5.8 | 6.5 | Fase 5 | P06 |
| Catálogo | RN-VAR-011–015 | 4.5 | 5.8 | 6.5 | Fase 5 | P06 |
| Importação XLSX/CSV | RN-IMP-001–011, 013–014 | 4.9 | 5.9 | 6.6 | Fase 6 | P07 |
| Fotos por ZIP | RN-IMP-012 | 4.10 | 5.10 | 6.7 | Fase 6 | P08 |
| Moderação | RN-MOD | 4.13 | 5.7 | 6.8 | Fase 3 | P04 |
| Login e SSO | RN-AUTH | 4.1 | 5.13 | 6.10 | Fase 7 | P09 |
| Telefone e bloqueio em cinco dias | RN-PHN | 4.16 | 5.18 | 6.14 | Fase 7 | P09 |
| Downgrade | RN-DWN | 4.12 | 5.12 | 6.11 | Fases 1 e 5 | P02, P06 |
| Qualidade e lançamento | todas | todas | 5.1, 5.15, 5.16 | 6.12 | Fase 8 | P00, P11 |

## Cobertura dos prompts

| Prompt | Entrega principal | Dependência |
|---|---|---|
| P00 | estabilização da base | nenhuma |
| P01 | planos, cotas, validade e IA | P00 |
| P02 | downgrade | P01 |
| P03 | endereço, condomínio e convite | P00, P01 |
| P04 | moderação completa | P00, P01 |
| P05 | distância, `Procuro` e compartilhamento | P03, P04 |
| P06 | catálogo e variações | P01, P04 |
| P07 | XLSX e CSV | P06 |
| P08 | ZIP de fotos | P07 |
| P09 | Apple e métodos de acesso | P00; integrar com P03/P05 |
| P10 | indicação, WhatsApp e consentimento | P01, P04, P05 |
| P11 | auditoria e lançamento | todos os anteriores |

## Regra de conclusão

Uma área só pode ser marcada como concluída quando:

1. regras correspondentes estiverem implementadas no servidor;
2. interface refletir a mesma capacidade;
3. migrações forem aplicáveis em base limpa e base existente;
4. critérios de aceite automatizáveis estiverem cobertos;
5. cenários manuais tiverem evidência;
6. documentação e prompt permanecerem coerentes com a entrega.
