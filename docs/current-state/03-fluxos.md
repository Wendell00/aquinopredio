# 3. Fluxos do Usuário

## 3.1 Cadastro e onboarding

```mermaid
flowchart TD
    A[Landing / Instalar PWA] --> B[Criar conta<br/>e-mail, link mágico ou Google/Apple]
    B --> C[Nome de exibição + aceite de termos + 18+]
    C --> D{Localizar prédio}
    D -->|Busca por nome/CEP/endereço<br/>ou 'perto de mim'| E{Encontrou?}
    E -->|Sim| F[Seleciona prédio + informa unidade]
    F --> G{Política do prédio}
    G -->|automática| H[Vínculo ativo]
    G -->|aprovação admin| I[Vínculo pendente<br/>acesso limitado]
    E -->|Não| J[Criar prédio]
    J --> K[CEP → endereço → geocodificação → pino no mapa]
    K --> L{Duplicidade?<br/>raio 100 m / mesmo CEP+nº}
    L -->|Candidatos| M["'Seu prédio é um destes?'"]
    M -->|Sim| F
    M -->|Não| N[Validação por IA]
    L -->|Nenhum| N
    N -->|score ≥ 0,80| O[Prédio verificado]
    N -->|0,50–0,79| P[Pendente de revisão<br/>uso liberado com raio 0]
    N -->|< 0,50| Q[Rejeitado + motivo<br/>corrigir e reenviar 1x]
    Q --> J
    O --> H
    P --> H
    H --> R[Confirmar telefone<br/>pode ser adiado até 1º anúncio]
    R --> S[Permitir notificações push]
    S --> T[Feed]
```

Estados do usuário: `onboarding_pendente` → `ativo` (com pelo menos um vínculo ativo ou pendente em prédio não rejeitado) → `suspenso` / `banido` / `excluido`.

## 3.2 Criação de anúncio com IA

```mermaid
sequenceDiagram
    actor U as Usuário
    participant W as PWA (web)
    participant A as API (NestJS)
    participant IA as Serviço de IA
    U->>W: Toca em "Anunciar" → "Criar com IA"
    U->>W: Escreve texto livre + anexa até 6 fotos
    W->>W: Comprime imagens, remove EXIF
    W->>A: POST /ads/ai-drafts (texto, imagens, prédio)
    A->>A: Verifica limite diário (RN-110)
    A->>IA: Prompt de geração (texto + imagens + categorias)
    IA-->>A: JSON {titulo, descricao, tipo, categoria, preco, tags, alertas}
    A-->>W: Rascunho
    W->>U: Mostra prévia editável
    alt Quer ajustar
        U->>W: Edita campos / pede "regerar" ou muda tom
    end
    U->>W: Define raio (0–5 km), contato, disponibilidade
    U->>W: Publicar
    W->>A: POST /ads
    A->>IA: Moderação (texto + imagens)
    IA-->>A: aprovado | revisar | proibido
    A-->>W: Status do anúncio
    W->>U: "Anúncio publicado!" / "Em análise" / "Recusado: motivo"
```

## 3.3 Criação de anúncio manual

1. "Anunciar" → "Criar manualmente".
2. Preenche campos (RN-052). Botão opcional **"Melhorar texto com IA"** (RN-055).
3. Escolhe raio e contato → Publicar → moderação (RN-062).

## 3.4 Consumo (feed → contato)

1. Feed com anúncios visíveis (RN-058) ordenados (RN-071).
2. Filtra/busca → abre o anúncio (fotos, descrição, preço, prédio de origem, distância, selo, perfil do anunciante).
3. Ações: **Conversar** (chat interno), **WhatsApp** (se habilitado), **Favoritar**, **Compartilhar** (link que exige login), **Denunciar**.

## 3.5 Administrador do prédio

*(Removido em 17/10/2026.)* Prédios não têm administrador: o vizinho entra na hora (RN-037) e a moderação é da IA e da plataforma (3.6).

## 3.6 Admin da plataforma (painel)

- Fila de prédios `pendente_revisao` com o relatório da IA (score, justificativa, evidências, mapa, foto).
- Fila de anúncios `em_moderacao` e denúncias.
- Gestão de usuários (suspender, banir, histórico de infrações).
- Configurações (limites, raios, categorias, thresholds de IA).
- Métricas: prédios, usuários ativos, anúncios por categoria, uso/custo de IA.
