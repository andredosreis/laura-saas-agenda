# ADR-022: Messaging Module as Cross-Cutting Orchestrator

**Status:** ✅ Accepted — Implementação Phase 1 do F12 SDD
**Data:** 2026-05-14
**Módulo:** Messaging / Cross-cutting
**Autor:** André dos Reis
**Score de Impacto:** 75 (Médio-Alto)

> **Nota sobre numeração:** O F12 SDD inicialmente propôs este ADR com o número 014, mas esse número já está atribuído à migração Z-API → Evolution API. Foi reatribuído para o próximo número disponível na sequência.

---

## Contexto

O sistema Marcai segue o padrão **Modular Monolith** estabelecido pelo ADR-011, no qual o código de domínio vive em `src/modules/<domain>/` (auth, clientes, leads, agendamento, financeiro, notificacoes, ia, historico) e cada módulo é internamente coeso. O princípio acordado é que **módulos de domínio não importam directamente uns dos outros** — a comunicação cruza fronteiras através de modelos partilhados (ADR-002 model registry) ou de chamadas explícitas via `services/`/`utils/`.

### O problema concreto

O F12 SDD (`docs/F12-ia-legacy-handoff-coordinator/spec.md`) define um router determinista que decide, para cada mensagem WhatsApp inbound, qual dos seis handlers a processa: confirmação legacy (Agendamento), IA Lead lifecycle (Leads + IA), Client lifecycle pending (Clientes), manual silent (Leads + Mensagens), fallback legacy (saudação genérica), ou ignore.

Implementar este router naturalmente exige:

- **Ler `Tenant`, `Lead`, `Cliente`, `Agendamento`** para tomar a decisão de routing
- **Chamar `iaServiceClient`** quando a rota é `IA_LEAD`
- **Escrever `Mensagem`** quando a rota é `MANUAL_SILENT`
- **Mutar `Agendamento.confirmacao`** quando a rota é `LEGACY_CONFIRMATION`

Ou seja: o router toca, directa ou indirectamente, em **quatro domínios distintos**. Qualquer localização dentro de um único módulo de domínio (`src/modules/ia/`, `src/modules/agendamento/`, etc.) cria um importador que viola o princípio acordado.

Adicionalmente, o `webhookController.js` está hoje em `src/modules/ia/` por acidente histórico — foi criado quando o webhook só servia a IA legacy. A realidade actual é que o webhook é o **único entry point de mensagens WhatsApp inbound**, independentemente de irem para IA, legacy, ou serem ignoradas. Não é uma responsabilidade do módulo IA.

### Alternativas avaliadas

**A) Manter status quo (`src/modules/ia/`).** Aceita a violação modular existente, minimiza refactor, mas multiplica imports cross-module sempre que um handler novo aparece. Tornou-se insustentável com a chegada de F12.

**B) Criar módulo orquestrador `src/modules/messaging/`.** Move o webhookController, classifier, router e handlers para um módulo dedicado, declarando explicitamente que estas peças são cross-cutting. Os módulos de domínio nunca importam de `messaging/`; o `messaging/` é o único autorizado a coordenar entre domínios.

**C) Router puro central + handlers distribuídos pelos módulos de domínio.** Cada handler vive no módulo do domínio que mais escreve (`legacyConfirmation` em agendamento/, `iaLeadLifecycle` em leads/, etc.). Cada handler vive perto da sua expertise, mas o webhookController continua a importar de N módulos, e o fluxo end-to-end fragmenta-se entre vários ficheiros distribuídos.

---

## Decisão

**Adopta-se a Opção B.** Criar um novo módulo `src/modules/messaging/` como **orquestrador cross-cutting** com os seguintes componentes:

```
src/modules/messaging/
├── controllers/
│   └── webhookController.js              # entry point /webhook/evolution (movido de modules/ia/)
├── routing/
│   ├── messageClassifier.js              # pure: classifica SIM/NÃO/free-text
│   └── messageRouter.js                  # pure: decide(input) → RoutingDecision
├── handlers/
│   ├── legacyConfirmation.js             # SIM/NÃO + pending appointment
│   ├── iaLeadLifecycle.js                # delega para iaServiceClient
│   ├── legacyFallback.js                 # saudação genérica 1×
│   ├── manualSilent.js                   # iaActive=false: persiste, sem reply
│   └── noPendingAppointmentReply.js      # SIM/NÃO sem agendamento (F12 §6.2)
└── webhookState.js                       # parallel state fetch helper
```

### Regras de boundary que este ADR codifica

1. **`messaging/` é o único módulo autorizado a importar de múltiplos módulos de domínio simultaneamente.** É um orquestrador, não um domínio.
2. **Módulos de domínio (`agendamento/`, `leads/`, `clientes/`, `financeiro/`, `notificacoes/`, `ia/`, `historico/`, `auth/`) NÃO importam de `messaging/`.** Inverter a dependência transformaria messaging num "domínio escondido" e perderia a propriedade que justifica a sua existência.
3. **`messaging/` pode importar:**
   - `src/models/` (schemas via ADR-002 registry — artefacto partilhado, não domínio)
   - `src/utils/` (helpers cross-cutting como `iaServiceClient`, `evolutionClient`, `logger`)
   - `src/services/` (serviços externos)
   - `src/middlewares/` (rate-limiting, auth, validate)
4. **`messaging/` NÃO importa `controllers/` de outros módulos.** Se um handler precisa de funcionalidade de domínio (ex.: criar Cliente), o módulo de domínio expõe-na via `services/` (função pura) ou via endpoint interno (F05). Reuso por chamada de controller HTTP-style é desencorajado.

### Enforcement automático

Para prevenir regressão, adiciona-se uma regra ESLint `no-restricted-imports` no `eslint.config.js` (ou `.eslintrc.json`) com mensagem clara:

```js
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['**/modules/messaging/**', '../messaging/**', '../../messaging/**'],
          message: 'Domain modules (agendamento, leads, clientes, etc.) MUST NOT import from src/modules/messaging/. Messaging is a cross-cutting orchestrator: the dependency goes one way (messaging → domains), never the inverse. See ADR-022.',
        },
      ],
    }],
  },
  overrides: [
    {
      // messaging/ é o módulo orquestrador — não sujeito à regra acima
      files: ['src/modules/messaging/**/*.js'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
}
```

A regra arquitectural fica codificada onde será encontrada por qualquer developer (linter falha no PR), não numa promessa escrita.

---

## Consequências

### Positivas

- **Reconhece a verdade arquitectural** que o webhook + routing são cross-cutting. Esconder isto em `modules/ia/` era dívida técnica acumulada desde antes do ia-service Python existir.
- **Cria um ponto natural para futuras features cross-cutting:** Client lifecycle handler (SDD futura), birthday outreach (Phase 5), inbox manual reply pipeline — todos encaixam em `messaging/handlers/` sem violar boundaries.
- **ADR-011 reforçado, não enfraquecido.** A regra "módulos de domínio não se importam uns aos outros" mantém-se integralmente. Adiciona-se uma camada superior explícita (orquestrador) que sempre existiu de facto no `webhookController.js` mas estava mascarada como "módulo IA".
- **ESLint enforcement** transforma uma promessa em invariante executável.

### Negativas / custos

- **Refactor de 1 ficheiro grande** (`webhookController.js`, 567 → ≤250 linhas) com mudança de path. Imports nos testes precisam de actualização.
- **Mais um directório raiz dentro de modules/.** O onboarding mental para novos devs ganha uma categoria ("orquestradores") além de "domínios".
- **Pressão futura para criar mais orquestradores.** Há risco de developers questionarem "porque não há também um módulo `notifications/` orquestrador para BullMQ?". Resposta correcta: BullMQ é outbound deterministic; cabe num módulo de domínio (`notificacoes/` ou `agendamento/`) porque escreve num único domínio. `messaging/` existe porque é a fronteira do sistema com WhatsApp inbound e routes para múltiplos domínios.

### Riscos mitigados

- **Regressão da boundary:** sem ESLint rule, seria uma promessa em prosa. Com a rule, é uma invariante executável.
- **"Messaging vira god module":** mitigado pelo princípio "messaging coordena, não implementa". Cada handler é fino — delega a lógica de domínio para o domínio respectivo via models/services/utils.

---

## Implementação

Implementação faseada conforme `docs/F12-ia-legacy-handoff-coordinator/plan.md`:

- **Phase 1 (Setup)** — Criar estrutura `src/modules/messaging/`, adicionar ESLint rule, criar este ADR
- **Phase 2** — Extrair classifier puro
- **Phase 3** — Extrair router puro
- **Phase 4** — Mover handlers + criar `noPendingAppointmentReply` + `manualSilent`
- **Phase 5** — Refactor `webhookController.js` + adicionar telemetria + correr matrix E2E tests

---

## Referências

- ADR-011 — Modular Monolith (`docs/adrs/generated/ADR-011-modular-monolith-agendamento-financeiro.md`) — princípio que este ADR formaliza a excepção
- ADR-002 — Model Registry Factory Pattern — explica porque `models/` é partilhado
- ADR-006 — Evolution API Integration — entry point do canal
- ADR-021 — Evolution Instance Per Tenant — tenant resolution patterns reutilizados pelo router
- F12 SDD — `docs/F12-ia-legacy-handoff-coordinator/spec.md` (§3, §8)
- PRD §1.1 — Message Routing Matrix (`.claude/docs/Docs Arqueturais/PRD_Marcai_CRM_Leads.md`)
