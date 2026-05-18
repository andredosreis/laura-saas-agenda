# PLAN — F12. IA↔Legacy Handoff Coordinator

> **Spec:** `docs/F12-ia-legacy-handoff-coordinator/spec.md`
> **ADR:** `docs/adrs/generated/ADR-022-messaging-module-cross-cutting-orchestrator.md`
> **Complexity:** Medium — 5 phases, 16 steps
> **Estimated effort:** 7–11 hours
> **Risk:** Low (refactor + new pure modules; no schema changes; legacy handlers relocated verbatim; ESLint enforces architectural boundary)

---

## Prerequisites

- PRD `PRD_Marcai_CRM_Leads.md` Sections 1.1, 1.2, 1.3 read and internalised.
- ADR-001, ADR-002, ADR-006, ADR-007, ADR-011 reviewed; no conflict found. ADR-022 created as part of Phase 1 to formalise the new `messaging/` orchestrator boundary.
- GAP-01 (slot atomicity) and GAP-02 (score atomicity) shipped — both green in CI.
- `webhookController.js` current state (567 lines) understood end-to-end.
- Pino logger conventions and `tenant_id` correlation pattern in place.

---

## Phase 1 — Architectural foundations (ADR + boundary enforcement)

Goal: lock the architectural decision before any code moves. The ADR + ESLint rule together codify the `messaging/` orchestrator boundary so subsequent phases cannot accidentally violate it.

### 1. Create ADR-022 — Messaging Module as Cross-Cutting Orchestrator

Already drafted at `docs/adrs/generated/ADR-022-messaging-module-cross-cutting-orchestrator.md`. The ADR documents why `messaging/` is the only module authorised to coordinate across domains, why domain modules cannot import from it, and the ESLint rule that enforces the boundary. Reference §3.1 and §8 of the spec.

### 2. Scaffold `src/modules/messaging/` directory tree

Create the empty directory structure: `controllers/`, `routing/`, `handlers/`. No files yet — just folders + a `README.md` at `src/modules/messaging/README.md` that points to ADR-022 and the spec. Anyone landing in this directory should immediately understand the boundary contract.

### 3. Add ESLint `no-restricted-imports` rule

Add the rule from ADR-022 §"Enforcement automático" to `eslint.config.js` (or `.eslintrc.json` depending on the existing config flavour). The rule blocks domain modules from importing `src/modules/messaging/**` and includes a message pointing to ADR-022. The `overrides` block exempts `src/modules/messaging/**` itself. Run `npm run lint` to confirm zero violations against the current codebase (there should be none — messaging doesn't exist yet).

---

## Phase 2 — Extract the message classifier (pure)

Goal: pure, testable classification of inbound text inside the new `messaging/` module. Zero behaviour change vs the inline lists in `webhookController.js`.

### 4. Module `src/modules/messaging/routing/messageClassifier.js`

Create the pure function `classify(rawText)` returning `{ kind, original, normalized, matched? }`. Move `PALAVRAS_SIM` and `PALAVRAS_NAO` lists out of the legacy `webhookController.js` into this file as frozen module-level constants. Normalize the input the same way the controller does today (lowercase + NFD strip + trim). Evaluation order is SIM first then NÃO; document in a code comment. Reference spec §4.1.

### 5. Unit tests `tests/message-classifier.test.js`

Add the 10 unit tests listed in spec §7.1. The classifier has no I/O — tests run synchronously without `mongodb-memory-server`. Fast feedback loop for keyword tuning.

---

## Phase 3 — Extract the routing decision module (pure)

Goal: a pure router that the controller calls after fetching state. No DB access inside the router.

### 6. Module `src/modules/messaging/routing/messageRouter.js`

Implement `decide(input)` matching the `RoutingInput → RoutingDecision` shape in spec §4.2. The function is a single ordered chain of guards (spec §6.2 decision tree, now including the `client_conversion_inconsistency` branch and the `NO_PENDING_APPOINTMENT_REPLY` branch). Export the `Route` and `Reason` string-literal enums as frozen objects so handlers can switch on them.

### 7. Integration tests `tests/message-router.test.js`

Implement the 14 mocked-state combinations from spec §7.2 (12 original + 2 new for `NO_PENDING_APPOINTMENT_REPLY` and `client_conversion_inconsistency`). Each test builds a `RoutingInput` literal and asserts `route` + `reason`. No `mongodb-memory-server` needed — the router is pure.

### 8. Documented invariants

In a JSDoc block at the top of `messageRouter.js`, list the invariants the function guarantees: (a) returns exactly one Route, (b) returns exactly one Reason matching the Route, (c) `IGNORE` only on tenant/plan failures, (d) `MANUAL_SILENT` only when `existingLead.iaAtiva === false`, (e) `client_conversion_inconsistency` fires when `Lead.status='convertido' && Lead.cliente === null && existingClient === null` — a data-integrity guard that never silently mis-routes.

---

## Phase 4 — Create handlers + state-fetch helper

Goal: move the existing legacy handler bodies into the new module verbatim, and create the two new handlers (`manualSilent`, `noPendingAppointmentReply`).

### 9. Relocate existing handlers to `src/modules/messaging/handlers/`

Move `processarConfirmacaoAsync` body to `handlers/legacyConfirmation.js`, `processarMensagemLeadAsync` body to `handlers/iaLeadLifecycle.js`, `delegarParaIAAsync` body to `handlers/legacyFallback.js`. Each becomes a named default export `handle(input)` taking the same context shape. Pure relocation — no behaviour change. Imports of `iaServiceClient` and `evolutionClient` remain pointing to `src/utils/` (utilities are not domain modules, per ADR-022).

### 10. New handler `src/modules/messaging/handlers/manualSilent.js`

Persist the inbound `Mensagem` via the tenant DB models directly (no internal HTTP call — same Node process owns the DB connection), update `Lead.lastInteraction`, return without sending any reply. Reference spec §6.4. Persistence uses `getTenantDB(tenantId)` + `getModels(db)` per ADR-001/002.

### 11. New handler `src/modules/messaging/handlers/noPendingAppointmentReply.js`

Send one configured WhatsApp message (verbatim copy in spec §6.2 — does NOT invoke the LLM) acknowledging receipt without assuming intent. Mark the inbound as processed but do not create a Lead unless one already exists. The handler is intentionally deterministic — it exists precisely to avoid spending tokens on `SIM`/`NÃO` with no context.

### 12. State-fetch helper `src/modules/messaging/webhookState.js`

Extract the parallel state fetch (tenant context, pending appointment, existing Client, existing Lead) into a single helper `fetchRoutingState({ instanceName, telefoneNormalizado })`. Returns the `RoutingInput` partial that the controller passes to the router. Encapsulates the four `Promise.all` queries cleanly.

---

## Phase 5 — Refactor the controller + telemetry + E2E tests

Goal: relocate the webhook controller into `messaging/`, replace the inline if/else tree with the router + handler dispatch, add structured telemetry, and validate everything end-to-end against the PRD matrix.

### 13. Relocate `webhookController.js` to `src/modules/messaging/controllers/`

Move the file from `src/modules/ia/webhookController.js` to `src/modules/messaging/controllers/webhookController.js`. Update the import path in `src/app.js` (or wherever the route is mounted). Update any test that imported from the old path. Run the full Lead + Agendamento + IA suite to confirm no regression at this purely-path-change step.

### 14. New helper `src/utils/telefoneHash.js`

Implement `telefoneHash(phone)` returning the first 8 hex chars of SHA-256 of the normalized phone. Used by the structured log payload (spec §4.3). Includes the future-upgrade note about HMAC keyed by tenant secret as a JSDoc comment so the choice does not become irreversible.

### 15. Refactor `webhookController.processarConfirmacaoWhatsapp`

Replace the current 200-line body (post-validations) with: (a) `classify(mensagem)`, (b) `fetchRoutingState(...)`, (c) `messageRouter.decide(...)`, (d) `switch (decision.route)` invoking the named handler, (e) emit Pino structured log matching spec §4.3. Keep validation guards exactly where they are (spec §6.3). Document the dispatch with inline comments mapping each `case` to its PRD matrix row.

The dispatch wires `CLIENT_LIFECYCLE_PENDING` to the `legacyFallback` handler in v1, preserving the telemetry reason `client_inbound_pending_lifecycle` for future visibility. When the Client lifecycle SDD ships, only this single dispatch line changes.

### 16. E2E tests `tests/webhook-routing-matrix.test.js`

Implement the 6 matrix tests plus the 5 additional E2E tests from spec §7.3 (`MANUAL_SILENT`, plan cancelled, ia-service unreachable, `NO_PENDING_APPOINTMENT_REPLY`, `client_conversion_inconsistency`). Use the existing `setup.js` + `mongodb-memory-server` harness. Mock `iaServiceClient.processLead` and `sendWhatsAppMessage` via `jest.mock` so the tests exercise the routing decision deterministically without hitting Evolution or Python. Each test asserts: (a) HTTP 200 ack body, (b) which handler was invoked, (c) the Pino log line shape, (d) the resulting DB state. Run the full project test suite — every existing test must remain green.

---

## Out of scope (deferred to follow-up SDDs or Phase 5 of the PRD)

- Client lifecycle real IA handler (replaces the v1 stub for matrix rows 4 and 5)
- Per-`(tenantId, telefone)` webhook serialization via BullMQ (PRD §7 Phase 5)
- Multi-instance Evolution per tenant (PRD §7 Phase 5)
- Birthday outreach (PRD §7 Phase 5)
- A routing-config UI for tenants
- HMAC-SHA256 phone hashing keyed by tenant secret (documented in spec §4.3 as future upgrade)

---

## Acceptance check before merging

- [ ] ADR-022 committed and referenced from the spec
- [ ] ESLint rule active — `npm run lint` passes; deliberately attempting an import from `src/modules/agendamento/` to `src/modules/messaging/` fails with the ADR-022 message
- [ ] All 10 classifier unit tests green
- [ ] All 14 router integration tests green (12 original + 2 new)
- [ ] All 11 E2E webhook tests green (6 matrix rows + 5 additional including `NO_PENDING_APPOINTMENT_REPLY` and `client_conversion_inconsistency`)
- [ ] All pre-existing Lead + Agendamento suites green (zero regression)
- [ ] Pino log lines visible in dev for each route with the field shape from spec §4.3, using `telefoneHash` (never raw phone)
- [ ] `src/modules/ia/webhookController.js` deleted; new location at `src/modules/messaging/controllers/webhookController.js` ≤ 250 lines
- [ ] `src/modules/messaging/README.md` exists and points to ADR-022 + this spec
- [ ] Python `lead_orchestrator.py` still has the `iaActive=false` early-return (defense-in-depth invariant per spec §6.4)
