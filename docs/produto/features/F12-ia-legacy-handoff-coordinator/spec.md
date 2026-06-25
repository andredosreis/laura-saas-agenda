# SPEC — F12. IA↔Legacy Handoff Coordinator

> **Status:** Draft (2026-05-14)
> **PRD source:** `.claude/docs/Docs Arqueturais/PRD_Marcai_CRM_Leads.md` (Sections 1.1, 1.2, 1.3; F01.Experience steps 7–8; F06 Pause-AI semantics; F11 audit metadata)
> **Tier:** Required for Pro and Elite (Básico tenants exercise only the deterministic routes)
> **Complexity:** Medium (3–4 phases, 10–15 steps)

---

## 1. Overview

F12 is the deterministic routing coordinator that decides **which handler** processes every inbound WhatsApp message arriving at the Evolution webhook entry point. It is the runtime implementation of the *Message Routing Matrix* (PRD §1.1): every inbound is mapped to exactly one of six routes (legacy confirmation handler, IA Lead lifecycle, IA Client lifecycle pending stub, manual-silent, legacy fallback greeting, or ignore).

The coordinator does **not** generate replies, mutate Lead state, or call LLMs — it classifies + decides + delegates. All side-effects live in the handler each route resolves to (`processarConfirmacaoAsync`, `iaServiceClient.processLead`, `delegarParaIAAsync`, etc.). This separation makes the routing decision (a) testable in isolation, (b) cheap to log structurally, and (c) replaceable without rewriting the handlers.

The current implementation already encodes a routing tree, but the decision is **inlined** as `if/else` inside `webhookController.processarConfirmacaoWhatsapp` (567 lines). F12 extracts that decision into a pure module so the matrix becomes the explicit source of truth and each row gets one end-to-end test.

### Why now

- The PRD §1.1 matrix is a normative contract; the codebase encodes it implicitly. Drift between the two is currently invisible.
- F09 (auto-booking) and F11 (audit badge) shipped on top of the inlined routing. Subsequent features (Client lifecycle, birthday outreach in Phase 5) will multiply the branches if the decision stays inlined.
- The token-cost argument in PRD §1.1 (`naive plug-in-GPT is uneconomical`) depends on a deterministic gate before invoking Python — F12 is that gate, made explicit.

---

## 2. Scope

**Included in this SPEC:**

- A pure message classifier (`SIM`/`NÃO` patterns + free-text fallback) — extracted from the existing inline lists
- A routing decision module that maps `(classified_message, tenant_context, persisted_state)` → one of six `Route` values
- Refactor of `webhookController.processarConfirmacaoWhatsapp` to delegate the decision to the router
- `Lead.iaActive=false` guard moved into the router (Node side) — Python keeps the same check as defense-in-depth
- Structured Pino telemetry on every routing decision (one log line per inbound, tenant-correlated)
- Unit tests for the classifier
- Integration tests for the router with mocked state combinations
- One end-to-end test per row of PRD §1.1 Routing Matrix (6 tests minimum)

**Deferred to a follow-up SDD (Client lifecycle activation):**

- A real IA handler for Client-lifecycle inbounds (matrix rows 4 and 5). F12 v1 detects Client inbounds and routes them to `LEGACY_FALLBACK_GREETING` with explicit telemetry flag `client_inbound_pending_lifecycle`. The Python `ia-service` Client agent will subscribe to this route in a future SDD.

**Explicitly out of scope:**

- Outbound message routing (BullMQ reminders, birthday — they originate from cron/queue, never enter the webhook)
- BullMQ worker design (PRD §7 Phase 5)
- F05 endpoint redesign (router consumes the existing internal endpoints unchanged)
- Cross-turn webhook serialization per `(tenantId, telefone)` — covered by GAP-02 fix already shipped
- Slot conflict atomicity — covered by GAP-01 fix already shipped
- A configuration UI for tenants to tweak routing — the matrix is fixed Marcai-wide (PRD §1.1)
- Multi-instance Evolution per tenant (PRD §7 Phase 5)

---

## 3. Component Overview

### 3.1 New files

Per ADR-022, F12 introduces a new cross-cutting orchestrator module `src/modules/messaging/`. The `webhookController.js` is **relocated** from `src/modules/ia/` to `src/modules/messaging/controllers/` to reflect the architectural truth that the webhook is the entry point for all inbound WhatsApp traffic, not an IA concern.

| Path | Responsibility |
|---|---|
| `src/modules/messaging/controllers/webhookController.js` | Entry point `POST /webhook/evolution`. Relocated from `src/modules/ia/`. Validation guards + classify + state-fetch + route + dispatch + telemetry. After refactor, ≤250 lines. |
| `src/modules/messaging/routing/messageClassifier.js` | Pure function: classify inbound text into `{ kind: 'confirmation_yes' \| 'confirmation_no' \| 'free_text', original, normalized, matched? }`. Owns the `PALAVRAS_SIM` / `PALAVRAS_NAO` lists currently inlined in `webhookController.js`. No I/O, fully testable. |
| `src/modules/messaging/routing/messageRouter.js` | Pure routing decision: given a `RoutingInput` (classified message + tenant context + persisted state) returns one of seven `Route` values plus a structured `decision_reason`. No I/O, no DB calls — all state is passed in. The caller (webhook controller) is responsible for fetching state. |
| `src/modules/messaging/webhookState.js` | Helper `fetchRoutingState({ instanceName, telefoneNormalizado })` running the four `Promise.all` queries (tenant context, pending appointment, existing Client, existing Lead) and returning the `RoutingInput` partial passed to the router. |
| `src/modules/messaging/handlers/legacyConfirmation.js` | Existing `processarConfirmacaoAsync` extracted from `webhookController.js`. Pure relocation — no behavioural change. |
| `src/modules/messaging/handlers/iaLeadLifecycle.js` | Existing `processarMensagemLeadAsync` extracted from `webhookController.js`. Pure relocation. Calls `iaServiceClient` (in `src/utils/`). |
| `src/modules/messaging/handlers/legacyFallback.js` | Existing `delegarParaIAAsync` extracted from `webhookController.js`. Pure relocation. Used when IA is disabled or for the Client-lifecycle stub. |
| `src/modules/messaging/handlers/manualSilent.js` | New: persists the inbound `Mensagem` via direct tenant-DB write (same process owns the connection — no F05 internal HTTP round-trip needed), updates `Lead.lastInteraction`, sends no reply. Used when `Lead.iaActive=false`. |
| `src/modules/messaging/handlers/noPendingAppointmentReply.js` | New: handles the case "SIM/NÃO inbound from a phone with no pending Agendamento". Sends one configured message that acknowledges receipt without assuming intent (see §6.2 for exact copy). Used by §6.2 routing branch. |
| `src/utils/telefoneHash.js` | New helper: SHA-256 truncated to 8 hex chars for PII-safe phone correlation in logs (§4.3). |
| `eslint.config.js` (or `.eslintrc.json`) | Add `no-restricted-imports` rule enforcing ADR-022 boundary: domain modules cannot import from `src/modules/messaging/`. The messaging module itself is exempted via `overrides`. |
| `tests/message-classifier.test.js` | Unit tests for the classifier |
| `tests/message-router.test.js` | Integration tests for the router (mocked state combinations) |
| `tests/webhook-routing-matrix.test.js` | E2E tests — one per matrix row plus the additional scenarios listed in §7.3 |

### 3.2 Files changed

| Path | Change |
|---|---|
| `src/modules/ia/webhookController.js` | **Removed** — moved to `src/modules/messaging/controllers/webhookController.js`. Imports of this path across the codebase must be updated. |
| `src/app.js` (or wherever the route is mounted) | Update the `import` path for the webhook controller. |
| Any existing test referencing `src/modules/ia/webhookController.js` | Update import path. |

### 3.3 Files removed

The legacy `processarConfirmacaoAsync` / `processarMensagemLeadAsync` / `delegarParaIAAsync` function bodies move to `src/modules/messaging/handlers/*`. The original `src/modules/ia/webhookController.js` file is deleted (replaced by the relocated version in `src/modules/messaging/controllers/`).

### 3.4 Module dependency graph

```
src/modules/messaging/
└── controllers/webhookController.js
      ├─→ routing/messageClassifier.js              (pure, no domain imports)
      ├─→ routing/messageRouter.js                  (pure, consumes classifier output + state snapshot)
      ├─→ webhookState.js                           (orchestrates parallel state fetch)
      │     ├─→ src/models/Tenant.js                (ADR-002 model registry)
      │     ├─→ src/config/tenantDB.js              (DB-per-tenant, ADR-001)
      │     └─→ src/models/registry.js              (Lead, Cliente, Agendamento via tenant DB)
      └─→ handlers/                                 (one per Route value)
            ├─→ legacyConfirmation.js               → models/Agendamento (via registry), utils/evolutionClient
            ├─→ iaLeadLifecycle.js                  → utils/iaServiceClient
            ├─→ legacyFallback.js                   → utils/evolutionClient
            ├─→ manualSilent.js                     → models/Mensagem, models/Lead (via registry)
            └─→ noPendingAppointmentReply.js        → utils/evolutionClient
```

**Boundary invariant (enforced by ESLint rule per ADR-022):** no `src/modules/{agendamento,leads,clientes,financeiro,notificacoes,ia,historico,auth}/**` file imports from `src/modules/messaging/**`. The dependency arrow points one way only: messaging → domains, never the inverse.

---

## 4. API Contracts

No new public HTTP endpoints. F12 operates inside the existing webhook handler (`POST /webhook/evolution`). The contracts below are **internal** to the module.

### 4.1 `messageClassifier.classify(rawText: string) → ClassifiedMessage`

```ts
type ClassifiedMessage =
  | { kind: 'confirmation_yes'; original: string; normalized: string; matched: string }
  | { kind: 'confirmation_no';  original: string; normalized: string; matched: string }
  | { kind: 'free_text';        original: string; normalized: string };
```

Notes:
- `normalized` is `lowercase + NFD strip + trim` (same algorithm as today's inline normalization).
- `matched` is the keyword from `PALAVRAS_SIM` / `PALAVRAS_NAO` that fired (for telemetry).
- Order of evaluation: SIM first, then NÃO. A message matching both lists (theoretically impossible with current keyword design) resolves to SIM — documented in tests.

### 4.2 `messageRouter.decide(input: RoutingInput) → RoutingDecision`

```ts
type RoutingInput = {
  classified: ClassifiedMessage;
  telefoneNormalizado: string;
  messageId: string;
  timestamp: Date;
  instanceName: string | null;
  tenant: { _id: string; plano: { status: string }; limites: { leadsAtivo?: boolean } } | null;
  persistedState: {
    hasPendingAppointment: boolean;     // any non-cancelled Agendamento with confirmacao.tipo='pendente' in [now-2h, now+48h]
    existingClient:  { _id: string; etapaConversa?: string | null } | null;
    existingLead:    { _id: string; iaAtiva: boolean; status: string } | null;
  };
  env: {
    IA_SERVICE_ENABLED: boolean;
    IA_SERVICE_URL_CONFIGURED: boolean;
  };
};

type Route =
  | 'LEGACY_CONFIRMATION'        // matrix row 2
  | 'IA_LEAD'                    // matrix rows 3, 6 (free-text from lead-or-stranger)
  | 'CLIENT_LIFECYCLE_PENDING'   // matrix rows 4, 5 — stub: routes to LEGACY_FALLBACK in v1
  | 'MANUAL_SILENT'              // Lead.iaActive=false override
  | 'LEGACY_FALLBACK'            // IA disabled, plan inactive, or Client lifecycle stub
  | 'IGNORE';                    // tenant unresolvable, ambiguous, plan cancelled

type RoutingDecision = {
  route: Route;
  reason:                                // for telemetry — exactly one of:
    | 'confirmation_with_pending_appointment'
    | 'confirmation_without_pending_appointment'
    | 'lead_ia_active'
    | 'lead_ia_paused'
    | 'new_phone_capture'
    | 'client_inbound_pending_lifecycle'
    | 'ia_service_disabled'
    | 'leads_disabled_on_tenant'
    | 'plan_inactive'
    | 'tenant_unresolved';
};
```

Pure function. No I/O. The caller fetches all `persistedState` first (in parallel via `Promise.all`) and passes a frozen snapshot in. The router never reads the DB.

### 4.3 Telemetry event shape (Pino structured log)

One log line per routing decision, level `info` for normal routes, `warn` for `IGNORE`:

```json
{
  "level": "info",
  "msg": "webhook_routed",
  "route": "IA_LEAD",
  "reason": "lead_ia_active",
  "tenant_id": "695413fb6ce936a9097af750",
  "telefone_hash": "a3c7...",
  "message_id": "EVT-xxxxx",
  "message_kind": "free_text",
  "has_pending_appt": false,
  "has_existing_client": false,
  "has_existing_lead": true,
  "lead_ia_active": true,
  "tenant_plan_status": "ativo",
  "ia_service_enabled": true,
  "elapsed_ms": 12
}
```

- `telefone_hash` is SHA-256 truncated to 8 hex chars — avoids leaking raw phone numbers to logs while keeping a stable correlation key. Reverse lookup is not possible.
- Correlates with Python `structlog` traces via `message_id`.

**HMAC upgrade path (out of scope for v1, documented for future):** when debugging requires reverse lookup capability (e.g. operator types in a phone and wants to find the log line), upgrade `telefoneHash` from raw SHA-256 to **HMAC-SHA256 keyed by a tenant-scoped secret** (not a global secret). This way, only operators authorised for tenant T can reverse the hashes belonging to T's logs — preserving the multi-tenant isolation boundary in the observability surface. Keys would rotate annually and live in the tenant document (or a sealed KMS). Out of scope for v1; flagged here so the hash algorithm choice does not become irreversible.

---

## 5. Data Model

No new collections, no new fields. F12 consumes existing schema:

| Schema | Fields consumed | Read access |
|---|---|---|
| `Tenant` | `whatsapp.instanceName`, `plano.status`, `limites.leadsAtivo` | by `instanceName` (existing index) |
| `Lead` | `_id`, `telefone`, `iaAtiva`, `status` | by `(tenantId, telefone)` (existing unique index) |
| `Cliente` | `_id`, `telefone`, `etapaConversa` | by `(tenantId, telefone)` (existing index) |
| `Agendamento` | `_id`, `cliente`, `lead.telefone`, `confirmacao.tipo`, `dataHora`, `status` | by `(tenantId, dataHora)` + `(tenantId, lead.telefone)` (existing indexes) |

All four reads run in `Promise.all` from the webhook controller before calling `messageRouter.decide`. Worst case: 4 indexed point queries against the tenant DB (ADR-001 DB-per-tenant) — sub-50ms p95 on memory-resident working sets.

No migration required.

---

## 6. Requirements

### 6.1 Routing rules (PRD §1.1 matrix — implementation contract)

The router implements exactly seven `Route` values. Each row of the matrix maps to a `Route` plus a `reason` code:

| § Matrix row | Inbound condition | Route | Reason |
|---|---|---|---|
| 1 | Reminder 24h/1h/30min before appointment | (N/A — outbound, never reaches webhook) | — |
| 2 | `SIM`/`NÃO` reply with pending appointment | `LEGACY_CONFIRMATION` | `confirmation_with_pending_appointment` |
| 3 | Inbound from phone with no Lead and no Client | `IA_LEAD` | `new_phone_capture` |
| 4 | Inbound from existing Client booking new appointment | `CLIENT_LIFECYCLE_PENDING` → falls through to `LEGACY_FALLBACK` in v1 | `client_inbound_pending_lifecycle` |
| 5 | Inbound from existing Client asking reschedule/cancel | `CLIENT_LIFECYCLE_PENDING` → falls through to `LEGACY_FALLBACK` in v1 | `client_inbound_pending_lifecycle` |
| 6 | Birthday greeting (Phase 5) | (N/A — outbound) | — |
| Edge case (not a matrix row) | `SIM`/`NÃO` from a phone with **no** pending appointment | `NO_PENDING_APPOINTMENT_REPLY` | `confirmation_without_pending_appointment` |

Matrix rows 4 and 5 are not distinguished at the router level — both route to the same stub because the v1 behaviour is identical (fall through to greeting). When the Client lifecycle SDD ships, rows 4 and 5 will diverge based on the agent's tool selection inside Python.

The "edge case" row above is **not** a PRD matrix row but a real-world inbound shape: someone replies `SIM` or `NÃO` to nothing in particular. Routing this to `IA_LEAD` would burn LLM tokens on a confused agent ("sim a quê?"). Routing it to a deterministic acknowledgement (defined in §6.2) is cheaper, clearer for the user, and naturally falls into `IA_LEAD` on the **next** turn if the user follows up with substance.

### 6.2 Decision tree (executed top-down — first match wins)

```
RoutingDecision = (
  IF tenant is null OR tenant.plano.status NOT IN {ativo, trial}:
      → { route: IGNORE, reason: tenant_unresolved | plan_inactive }

  ELIF NOT env.IA_SERVICE_ENABLED OR NOT env.IA_SERVICE_URL_CONFIGURED:
      → { route: LEGACY_FALLBACK, reason: ia_service_disabled }

  ELIF tenant.limites.leadsAtivo === false:
      → { route: LEGACY_FALLBACK, reason: leads_disabled_on_tenant }

  ELIF classified.kind IN {confirmation_yes, confirmation_no} AND persistedState.hasPendingAppointment:
      → { route: LEGACY_CONFIRMATION, reason: confirmation_with_pending_appointment }

  ELIF classified.kind IN {confirmation_yes, confirmation_no} AND NOT persistedState.hasPendingAppointment:
      → { route: NO_PENDING_APPOINTMENT_REPLY, reason: confirmation_without_pending_appointment }
        # handler sends a specific deterministic message — does NOT invoke LLM. Next turn
        # (substantive free-text) falls naturally into IA_LEAD via the rules below.

  ELIF persistedState.existingLead !== null AND existingLead.status === 'convertido'
       AND persistedState.existingClient === null:
      → { route: LEGACY_FALLBACK, reason: client_conversion_inconsistency }
        # Data-integrity guard: Lead.status='convertido' MUST come with a non-null Lead.cliente
        # (F04 atomic transaction guarantees this). If this branch fires, F04 regressed —
        # fall through to greeting with a WARN log, NEVER silently route somewhere wrong.

  ELIF persistedState.existingClient !== null:
      → { route: CLIENT_LIFECYCLE_PENDING, reason: client_inbound_pending_lifecycle }
        (caller substitutes LEGACY_FALLBACK as the actual handler in v1)

  ELIF persistedState.existingLead !== null AND existingLead.iaAtiva === false:
      → { route: MANUAL_SILENT, reason: lead_ia_paused }

  ELIF persistedState.existingLead !== null AND existingLead.iaAtiva === true:
      → { route: IA_LEAD, reason: lead_ia_active }

  ELSE:  # no lead, no client, free-text
      → { route: IA_LEAD, reason: new_phone_capture }
)
```

**`NO_PENDING_APPOINTMENT_REPLY` handler message** (fixed copy, sent verbatim — not LLM-generated):

```
Olá! 😊 Recebi a sua mensagem, mas não encontrei nenhum agendamento pendente de confirmação.
Se quiser informações ou marcar algo, é só dizer-me como posso ajudar.
```

Properties this copy satisfies:
- **Acknowledges receipt** without assuming intent
- **Informs absence of pending appointment** (may be useful surprise for the user)
- **Opens door without directing** — does not push "want to book?"
- **Next message routes naturally** — if substantive, falls into `IA_LEAD`; if another bare confirmation, repeats this fallback without escalating

**Ordering rationale:**
- Guards (tenant + IA availability) evaluated first — they short-circuit everything else; cheap to check.
- Confirmation-with-pending-appointment evaluated before client/lead lookup — the most specific match for matrix row 2.
- Client lookup before Lead lookup — a converted Lead has both a `Cliente.cliente` ref and the original `Lead.cliente`; the Client is the authoritative identity for routing post-conversion.
- `iaActive=false` only meaningful for Leads in active stages (F03 disables the toggle for terminal stages); the router still honors it for safety.

### 6.3 Validation guards (executed before routing — already implemented, kept)

These remain in the webhook controller as pre-routing filters. They return `IGNORE` semantics without consulting the router:

| Guard | Behaviour |
|---|---|
| `event !== 'messages.upsert'` | `200 { message: 'Evento ignorado' }`, no routing |
| `remoteJid.endsWith('@g.us')` or `messageType === 'reactionMessage'` | `200`, group/reaction ignored |
| `msgData.key.fromMe === true` | `200`, own message ignored |
| Message age > 5 minutes | `200`, stale message ignored |
| `markMessageSeen(messageId)` returns `false` | `200`, replay ignored (anti-replay via `ProcessedMessage` unique index) |
| `remoteJid.endsWith('@lid')` | `200`, LID payload (defensive — Evolution v1 quirk) |

Only after all six guards pass does F12's classifier + router run.

### 6.4 Pause-AI (`Lead.iaActive=false`) semantics

PRD F06 states: "when `Lead.iaActive === false`, the orchestrator returns immediately without persisting any outbound message, without invoking the LLM, and without mutating Lead state; the inbound is still persisted by F05 so F03 can show it for manual handling."

F12 implements this **before** invoking Python (avoids the round-trip):
- Router emits `MANUAL_SILENT` when `existingLead.iaAtiva === false`.
- The `manualSilent` handler persists the inbound `Mensagem` via the tenant DB models directly (no F05 internal HTTP call needed — same Node process owns the DB connection).
- No Evolution reply is sent. No `Conversa` field is mutated. `Lead.lastInteraction` is touched so F03 reflects the new message.

**Defense-in-depth invariant — explicit contract between Node router and Python orchestrator:**

> The `iaActive=false` check is performed in the Node router for token economy. However, `lead_orchestrator.py` MUST retain its own check at the start of `run()`. The Node check is an *optimization*; the Python check is the *invariant*. If they diverge in behaviour, the Python check wins.

Implications:
- A future caller (BullMQ worker, internal test, third-party integration via F05) that bypasses F12 and calls `POST /process-lead` directly **MUST NOT** result in the agent replying to a paused lead.
- A regression in F12 (e.g., a refactor that loses the `iaActive` check) **MUST NOT** be able to wake a paused lead — Python catches it.
- The Node check exists only to avoid the HTTP round-trip + token cost; remove it freely if the trade-off changes. The Python check is load-bearing and must never be removed.

### 6.5 Error handling

| Failure mode | Router behaviour | Handler behaviour |
|---|---|---|
| Tenant lookup fails (DB error) | n/a — caller catches and returns `IGNORE` semantics with `tenant_unresolved` | Sentry-captured; webhook returns `200` to Evolution silently |
| State fetch (`hasPendingAppointment` / `existingClient` / `existingLead`) throws | Caller catches one-by-one; failed field treated as `null` / `false`; router still decides on partial state with degraded inputs | Telemetry includes `partial_state_warn: true` |
| `IA_SERVICE_URL` set but `ia-service` unreachable at handler time | Router has already emitted `IA_LEAD`; the handler (`iaLeadLifecycle`) catches the `axios` error and falls back to `delegarParaIAAsync` (existing behaviour) | Pino warn `ia_service_unreachable_fallback` |
| Classifier given empty string | Classifies as `free_text` with empty normalized | Router treats as `new_phone_capture` / `lead_ia_active` per state |
| `messageId` missing (Evolution payload corruption) | Validation guard catches at controller level → `400 { error: 'Dados incompletos' }` | n/a |
| `manualSilent` handler fails to persist | Sentry-captured; webhook still returned `200` upstream | F03 may miss this inbound on next refresh (acceptable degradation — message is in Evolution history) |
| Data-integrity inconsistency: `Lead.status='convertido'` but `Lead.cliente=null` | Router emits `LEGACY_FALLBACK` with `reason='client_conversion_inconsistency'` and Pino **WARN** log; never silent | Sentry alert at warn level so the F04 regression surfaces immediately. Sender receives the generic greeting (degraded but not broken). |

### 6.6 Concurrency

- Multiple inbounds from the **same phone** in rapid succession: Node serializes per process; router runs sequentially per request. Cross-process serialization is not required because:
  - Lead state mutations downstream of `IA_LEAD` are protected by GAP-02 atomic delta updates already shipped.
  - Confirmation state mutations are protected by Mongoose `markModified` + `save` patterns (existing).
  - The router itself is **stateless** — concurrent invocations cannot conflict with each other.
- Multiple inbounds from **different phones** of the same tenant: trivially parallel; no shared state.

### 6.7 Performance budget

- Routing decision: target <50ms p95 (4 parallel indexed point queries + pure function).
- Total webhook response time (validation + routing + handler delegation up to fire-and-forget): target <500ms p95 to comply with PRD F01 §Experience step 4.
- Telemetry emission is fire-and-forget (Pino async flush) — does not block the response.

---

## 7. Testing Strategy

### 7.1 Unit tests — `tests/message-classifier.test.js`

| Test | Input | Expected |
|---|---|---|
| accepts simple `sim` | `"sim"` | `kind: 'confirmation_yes', matched: 'sim'` |
| accepts capitalized + accented `Não` | `"Não"` | `kind: 'confirmation_no', matched: 'nao'` |
| accepts startsWith pattern `"sim, pode ser"` | `"sim, pode ser"` | `kind: 'confirmation_yes', matched: 'sim'` |
| treats `"simbolo"` (false-positive root) as free-text | `"simbolo"` | `kind: 'free_text'` (no exact match, no `sim ` prefix) |
| accepts `"OK"` as confirmation | `"OK"` | `kind: 'confirmation_yes', matched: 'ok'` |
| treats unrelated free-text as `free_text` | `"quero marcar para terça"` | `kind: 'free_text'` |
| handles empty string | `""` | `kind: 'free_text', normalized: ''` |
| strips accents and lowercase | `"NÃO POSSO"` | `kind: 'confirmation_no', matched: 'nao posso'` |
| `cancelar` matches NÃO | `"cancelar"` | `kind: 'confirmation_no'` |
| `1` matches SIM (legacy numeric option) | `"1"` | `kind: 'confirmation_yes', matched: '1'` |

### 7.2 Integration tests — `tests/message-router.test.js`

Mocked `persistedState` combinations. Each test constructs a `RoutingInput` and asserts the returned `RoutingDecision`. Pure function — no DB needed.

| Test | Setup (input) | Expected route | Expected reason |
|---|---|---|---|
| Tenant null | `tenant: null` | `IGNORE` | `tenant_unresolved` |
| Tenant plan cancelled | `tenant.plano.status='cancelado'` | `IGNORE` | `plan_inactive` |
| IA disabled (env) | `env.IA_SERVICE_ENABLED=false` | `LEGACY_FALLBACK` | `ia_service_disabled` |
| Leads disabled (tenant flag) | `tenant.limites.leadsAtivo=false` | `LEGACY_FALLBACK` | `leads_disabled_on_tenant` |
| SIM + pending appointment | `classified=yes, hasPendingAppointment=true` | `LEGACY_CONFIRMATION` | `confirmation_with_pending_appointment` |
| NÃO + pending appointment | `classified=no, hasPendingAppointment=true` | `LEGACY_CONFIRMATION` | `confirmation_with_pending_appointment` |
| SIM without pending appointment | `classified=yes, hasPendingAppointment=false` | `NO_PENDING_APPOINTMENT_REPLY` | `confirmation_without_pending_appointment` |
| NÃO without pending appointment | `classified=no, hasPendingAppointment=false` | `NO_PENDING_APPOINTMENT_REPLY` | `confirmation_without_pending_appointment` |
| Lead convertido but cliente null (data integrity bug) | `existingLead.status='convertido', existingLead.cliente=null, existingClient=null` | `LEGACY_FALLBACK` | `client_conversion_inconsistency` |
| Free-text + existing Client | `existingClient: {...}` | `CLIENT_LIFECYCLE_PENDING` | `client_inbound_pending_lifecycle` |
| Free-text + existing Lead with iaActive=true | `existingLead: {iaAtiva: true}` | `IA_LEAD` | `lead_ia_active` |
| Free-text + existing Lead with iaActive=false | `existingLead: {iaAtiva: false}` | `MANUAL_SILENT` | `lead_ia_paused` |
| Free-text + no Lead, no Client | all state null | `IA_LEAD` | `new_phone_capture` |
| Cliente present overrides Lead presence | both `existingClient` and `existingLead` non-null | `CLIENT_LIFECYCLE_PENDING` | `client_inbound_pending_lifecycle` (Client wins) |

### 7.3 End-to-End tests — `tests/webhook-routing-matrix.test.js`

One test per matrix row (PRD §1.1). Uses `mongodb-memory-server` + `supertest` + mocked `iaServiceClient.processLead` and mocked `sendWhatsAppMessage`. Each test posts a representative Evolution payload to `POST /webhook/evolution` and asserts:

1. HTTP response: `200` and structured ack body
2. The expected handler was invoked (mock spy)
3. The Pino log line includes the expected `route` and `reason`
4. Side effects (Mensagem persisted? Lead created? Agendamento status updated?) are correct

| Matrix row | Test name | Scenario built | Assertion |
|---|---|---|---|
| §1.1 row 2 (SIM/NÃO + pending appt) | `SIM with pending appointment → LEGACY_CONFIRMATION + appointment confirmed` | Create Tenant + Cliente + Agendamento(status=Agendado, confirmacao.tipo=pendente, dataHora=+24h). Post `"SIM"` webhook. | `processarConfirmacaoAsync` spy called once; Agendamento.status=`Confirmado`; outbound message contains "✅" template; log `route='LEGACY_CONFIRMATION', reason='confirmation_with_pending_appointment'` |
| §1.1 row 3 (no Lead, no Client) | `Unknown phone → IA_LEAD + new Lead created` | Tenant only. Post `"olá quero saber preços"`. | `iaServiceClient.processLead` spy called with `leadId=null` (Python will create idempotently); log `route='IA_LEAD', reason='new_phone_capture'` |
| §1.1 row 4 (existing Client, new booking) | `Existing Client → CLIENT_LIFECYCLE_PENDING + LEGACY_FALLBACK greeting (v1 stub)` | Tenant + Cliente (no Agendamento pending). Post `"olá quero marcar"`. | `delegarParaIAAsync` spy called once; outbound message is the 1×-greeting template; log `route='CLIENT_LIFECYCLE_PENDING', reason='client_inbound_pending_lifecycle'`; second post with same phone produces zero outbound (etapaConversa already set) |
| §1.1 row 5 (existing Client, reschedule/cancel) | `Existing Client asking cancel → same stub as row 4` | Same as row 4 with different message text (`"quero remarcar"`). | Identical assertions to row 4. v1 does not distinguish booking vs reschedule for Client lifecycle. |
| §1.1 row 1 (reminder outbound) | `Reminder is outbound — does not enter webhook` | n/a — documented as test note, not executed | Confirmed via inspection: `scheduleNotifications` in `scheduleNotifications.js` produces outbound only |
| §1.1 row 6 (birthday outbound — Phase 5) | `Birthday — out of scope` | n/a — Phase 5 | Confirmed via spec note |

Additional E2E tests beyond the matrix:

| Test | Scenario | Assertion |
|---|---|---|
| `Lead iaActive=false → MANUAL_SILENT + inbound persisted + no reply` | Tenant + Lead (iaActive=false). Post free-text. | `manualSilent` handler persists `Mensagem(geradoPorIA=false, origem='cliente')`; zero outbound; log `route='MANUAL_SILENT', reason='lead_ia_paused'` |
| `Plan cancelled → IGNORE silently` | Tenant with `plano.status='cancelado'`. Post any. | HTTP 200 silent; no handler invoked; no outbound; log `route='IGNORE', reason='plan_inactive'` |
| `IA service unreachable → IA_LEAD route + handler fallback to greeting` | Tenant + Lead (active). Mock `iaServiceClient.processLead` to throw. | `iaLeadLifecycle` handler catches and invokes `delegarParaIAAsync`; log `ia_service_unreachable_fallback` |
| `SIM/NÃO without pending appointment → NO_PENDING_APPOINTMENT_REPLY + deterministic copy` | Tenant + no Lead, no Cliente, no Agendamento. Post `"sim"`. | `noPendingAppointmentReply` handler invoked; outbound message equals the §6.2 verbatim copy; `iaServiceClient.processLead` is NOT called; log `route='NO_PENDING_APPOINTMENT_REPLY', reason='confirmation_without_pending_appointment'` |
| `Lead convertido but cliente=null → LEGACY_FALLBACK + warn log` | Tenant + Lead with `status='convertido'` and `cliente=null` (synthetic data-integrity bug). Post free-text. | `legacyFallback` handler invoked; Pino warn log with `reason='client_conversion_inconsistency'`; Sentry captures the inconsistency |

### 7.4 Cross-Feature Integration tests (from PRD §9)

These already exist or are touched by F12 and must remain green:

- **F02 ↔ F01** (Lead appears in Kanban within 10s): unchanged
- **F05 ↔ F01, F02** (internal endpoints respect transitions matrix): unchanged
- **F06 ↔ F03** (F12 honoring `iaActive=false` keeps the inbound persisted for F03 thread): new — covered by the `MANUAL_SILENT` E2E test above
- **F11 ↔ F06, F09** (audit badge increments after AI booking): unchanged — F12 only routes; F06/F09 handlers do the writes

### 7.5 Performance / load tests

Out of scope for v1. The PRD §1.1 token-cost guarantee is exercised by the deterministic gate itself; a separate load test will be added when Pro tenants exceed pilot volume.

---

## 8. Assumptions and Decisions

All decisions reviewed with the user on 2026-05-14. The six `[Auto-Accept]` candidates were either confirmed, adjusted, or upgraded with additional safeguards:

- ✅ **Client lifecycle stub in v1** — matrix rows 4 and 5 route to `CLIENT_LIFECYCLE_PENDING` then fall through to `LEGACY_FALLBACK`. Telemetry flag `client_inbound_pending_lifecycle` makes pending volume visible. Real Client agent ships in a follow-up SDD. *Confirmed.*

- ✅ **`iaActive=false` guard moved to Node** — replicated from Python to save one HTTP round-trip per paused inbound. *Confirmed with explicit invariant contract:* the Node check is an *optimization*; the Python check is the *invariant*. If they diverge in behaviour, the Python check wins. Python `lead_orchestrator.run()` MUST keep its own check. See §6.4 for the full statement.

- ✅ **Module location — `src/modules/messaging/` orchestrator module** — *upgraded from initial proposal.* The router and `webhookController` move into a new cross-cutting orchestrator module `src/modules/messaging/`. ADR-022 documents this decision formally. An ESLint `no-restricted-imports` rule prevents domain modules from importing `messaging/` — enforces ADR-011 boundary as an executable invariant, not a written promise. See §3 for paths and §3.4 for the boundary diagram.

- ✅ **Telemetry via Pino structured logs** — same logger and field shape as the rest of the codebase. `telefone_hash` (SHA-256 truncated to 8 hex chars) used instead of raw phone to limit PII exposure in logs. *Confirmed with future-upgrade note:* when reverse lookup becomes a debugging requirement, upgrade to HMAC-SHA256 keyed by **tenant-scoped secret** (not a global secret) so reverse-lookup capability is scoped to the tenant's authorised operators. Out of scope for v1; flagged in §4.3 so the choice does not become irreversible.

- ✅ **Confirmation without pending appointment → deterministic reply, not LLM** — *direction adjusted from initial proposal.* Routing this to `IA_LEAD` would burn tokens on a confused agent. Routing it to a new `NO_PENDING_APPOINTMENT_REPLY` handler with a fixed acknowledgement is cheaper, clearer, and lets the next substantive turn fall naturally into `IA_LEAD`. Exact copy specified verbatim in §6.2:
  > "Olá! 😊 Recebi a sua mensagem, mas não encontrei nenhum agendamento pendente de confirmação. Se quiser informações ou marcar algo, é só dizer-me como posso ajudar."

- ✅ **Cliente present overrides Lead present** — *confirmed with data-integrity defense.* A converted Lead has both records; the Client is the post-conversion authoritative identity. **Additional safeguard:** the routing also assumes `Lead.cliente` is correctly populated by F04's atomic conversion transaction. If `Lead.status='convertido'` but `Lead.cliente` is null (data-integrity bug from a future regression in F04), routing falls through to `LEGACY_FALLBACK` with WARN log `client_conversion_inconsistency` — never silent, never wrong route. The Lead lifecycle invariant becomes monotonically positive once converted (no un-conversion; see PRD §7 Out of Scope).

### Traceability — which PRD blocks informed which spec sections

| PRD / ADR source | Spec section |
|---|---|
| §1.1 Message Routing Matrix | §6.1 Routing rules + §7.3 E2E matrix tests |
| §1.2 Reminder Pipeline Principle | §2 Out of scope (outbound) |
| §1.3 Conversation Lifecycles | §6.1 (Client lifecycle stub) + §2 Deferred |
| F01 Experience steps 7–8 | §6.2 Decision tree + §6.3 Validation guards |
| F04 atomic conversion | §6.2 `client_conversion_inconsistency` branch + §6.5 |
| F06 Pause-AI semantics | §6.4 Pause-AI semantics + defense-in-depth invariant + `MANUAL_SILENT` E2E test |
| F11 audit metadata | §2 Out of scope (no new schema; handlers downstream of router still set `geradoPorIA`) |
| ADR-001 (DB-per-tenant) | §5 Data Model — state reads via `getTenantDB` |
| ADR-002 (model registry) | §3.4 — handlers use `req.models` pattern |
| ADR-006 (Evolution API) | §6.3 — `instanceName` resolution |
| ADR-007 (Two-Tier LLM) | §6.1 — routing is the gate enforcing the two-tier economy |
| ADR-011 (Modular Monolith) | §3.1 — `messaging/` is the exception (orchestrator), enforced by ESLint |
| **ADR-022 (Messaging Module as Cross-Cutting Orchestrator)** | §3 New module location + boundary invariant; written specifically for this SDD |
