# F05 — Backend Availability Enforcement (optional) — Spec

**PRD:** `docs/produto/PRD-disponibilidade-unificada.md` (F05)
**ADR:** `docs/adrs/generated/ADR-028-disponibilidade-fonte-unica-painel-ia.md` (Fase 4 — Enforcement no backend + "Estratégia de enforcement")
**Complexity:** medium
**Module:** `src/modules/agendamento/` (migrated module — `createAgendamento` + schemas) + `src/models/Agendamento.js` (extend) — reuses `resolveAvailableSlots` (F03) and `ScheduleException` (F02) — backend, tenant-scoped

---

## 1. Scope

> **🔗 Dependency:** F05 is the **last** feature and ships **only after F03 and F04** — i.e. after the panel UI (F01/F02), the AI (F03) and the manual-booking slot picker (F04) all read availability from the **same source**. Until F05 the booking path is **permissive** (free bookings, no expediente check — the enforcement block in `createAgendamento` is currently commented out, see ADR §"Estado detalhado"). F05 turns availability into a **rule**, with an explicit **override** escape hatch for real operational `encaixes`. F05 reuses, unchanged, the shared **`resolveAvailableSlots`** helper extracted in **F03** (the same per-day slot calculation the AI and the panel read) and the **`ScheduleException`** precedence added in **F02** — it does **not** re-implement slot math (ADR principle 5; the whole point of ADR-028 is one source, many readers, including the enforcer).

**Included:**
- **Reactivate** the commented availability validation in `createAgendamento` (`src/modules/agendamento/agendamentoController.js`): a booking whose `dataHora` falls **outside the resolved availability** for that date is **rejected with 400** and a clear reason. "Resolved availability" = base weekday `Schedule` (F01) + `ScheduleException` precedence (F02, `fechado` → closed; `horas-extra`/`horario-especial` → exception window) − existing bookings/pause — computed by the shared **`resolveAvailableSlots`** helper (F03), so the enforced rule equals what the AI/panel offer.
- **Explicit override:** an **`admin`** may pass an override flag (`forcarEncaixe: true`) to force an `encaixe` outside hours; the booking is created and the override is **recorded** on the `Agendamento` (who authorised it + optional reason + when) for traceability.
- Override by a **non-admin** role (`gerente`/`recepcionista`/`terapeuta`) → **403** (booking-creation roles are unchanged; only the *override* is gated to `admin`).
- **Enforcement must cover ALL live booking-write paths, not only `createAgendamento`** (corrected 2026-06-25 after code verification — see the ⚠️ box below). Concretely:
  1. `createAgendamento` (`src/modules/agendamento/agendamentoController.js`) — the manual-panel path.
  2. **`leadInternalRoutes` `POST /:id/agendamento`** and **`clienteInternalRoutes` `POST /:id/agendamentos`** — the **live AI/Python booking path** (the Python `ia-service` books through these `X-Service-Token` internal routes, which call `models.Agendamento.create(...)` directly and **bypass `createAgendamento`**). These must apply the **same `resolveAvailableSlots` enforcement** before creating. The AI **never overrides** (`forcarEncaixe` is not accepted on the internal routes) — it only books real slots it read from the same source (F03), so enforcement is a transparent safety net there.
- The shared `resolveAvailableSlots` (F03) is the single enforcement helper used by all three paths, so the rule is identical everywhere (ADR-028's "one source, many readers" — here, many *enforcers*).

> **⚠️ Verificação de caminhos de escrita (2026-06-25, confirmado no código):** existem três formas de criar um `Agendamento`:
> 1. `createAgendamento` (painel) — **coberto** aqui.
> 2. **Rotas internas** `leadInternalRoutes.js:382` (`POST /:id/agendamento`) e `clienteInternalRoutes.js` (`POST /:id/agendamentos`) — usadas pela **IA Python viva** (Evolution → `webhookController` → `ia-service` → estas rotas). Fazem `models.Agendamento.create(...)` com `getModels(getTenantDB(tenantId))` (isolamento OK) mas **fora do `createAgendamento`** → **TÊM de receber o mesmo enforcement** (incluído acima).
> 3. `src/modules/ia/functionDispatcher.js:46` (`schedule_appointment`) — **CÓDIGO MORTO** da era Z-API (só alcançável pela rota legada `/whatsapp/webhook`, já não alimentada pela Evolution). **Fora do âmbito da F05.** ⚠️ Bónus achado: este caminho cria `Agendamento`/`Cliente` **sem `tenantId`** na conexão default — landmine. Recomendação: **remover o caminho Node legado** (`functionDispatcher`, `langchainTools`, `openaiHelper`, `whatsappController.zapiWebhook` + a rota `/whatsapp/webhook`) num cleanup à parte (não é ADR-028). Confirmar com o André antes de apagar.

**Provides (to later features):** none — F05 is the terminal feature of this PRD wave.

**Deferred (out of scope):** slot calculation (owned by F03 `resolveAvailableSlots`), the exceptions model/UI (F02), the manual slot picker UI (F04). F05 adds **no new endpoint and no new page** — it hardens an existing mutation. Surfacing the override toggle in the panel UI is a thin follow-up on F04's picker and is **not** required for F05 (the backend contract — flag + recorded override — is the deliverable). See `[Auto-Accept] D7`.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/modules/agendamento/agendamentoController.js` | edit | Reactivate the enforcement block **inline** in `createAgendamento`: resolve the day's slots via `resolveAvailableSlots`, reject `dataHora` outside availability (400) unless a valid override is supplied; apply the override only for `admin` (else 403) and stamp the `encaixe` record on the new document. Import `resolveAvailableSlots` from `scheduleController.js`. |
| `src/models/Agendamento.js` | edit | Add an optional `encaixe` sub-document (`{ forcado, motivo, autorizadoPor, autorizadoEm }`) to record forced out-of-hours bookings. No new index. |
| `src/modules/agendamento/agendamentoSchemas.js` | edit | Add `forcarEncaixe` (boolean, optional, default `false`) and `motivoEncaixe` (string, optional, ≤280) to `createAgendamentoSchema` (`.strict()`). |
| `src/modules/leads/leadInternalRoutes.js` | edit | Apply `resolveAvailableSlots` enforcement in `POST /:id/agendamento` (live AI/Python path) **before** `models.Agendamento.create`; reject out-of-availability; no override on this route (AI never overrides). Keep its `{ success, data }` shape. |
| `src/modules/clientes/clienteInternalRoutes.js` | edit | Same enforcement in `POST /:id/agendamentos` (live AI/Python path) before create. |
| `src/controllers/scheduleController.js` | reuse (no edit) | Source of the exported pure helper `resolveAvailableSlots({ Schedule, ScheduleException, Agendamento, tenantId, date, duration })` (extracted in **F03**). F05 consumes it; it must not be re-implemented here. |
| `src/models/ScheduleException.js` | reuse (no edit) | Per-date exception model (**F02**) consumed transitively by `resolveAvailableSlots`. |
| `tests/agendamento-enforcement.test.js` | new | Integration tests (Jest ESM + supertest + `mongodb-memory-server`) for enforcement, override, role gate, exception precedence, parity-with-F04, and tenant isolation. |

Pattern references: `src/modules/agendamento/agendamentoController.js` (the commented enforcement block, the existing conflict/`{ message }` rejection idiom, the `DateTime`/`Europe/Lisbon` handling, raw-document success response), `src/controllers/scheduleController.js` (F03 `resolveAvailableSlots`, weekday `0=Dom`↔Luxon `1=Seg…7=Dom` mapping), `src/middlewares/auth.js` (`req.user.role`, `authorize`, `superadmin` bypass), `src/models/ScheduleException.js` (F02), `src/middlewares/validate.js` (`.strict()` body validation, strips server-managed keys).

> **⚠️ Contract note (legacy endpoint shape):** `createAgendamento` does **not** use the canonical `{ success, data }` envelope on this code path — it returns the **raw** `Agendamento` document on success (`res.status(201).json(novoAgendamento)`) and `{ message }` on its rejections (e.g. the 409 slot conflict, the original commented out-of-hours block). To avoid breaking the existing booking UI / F04 slot-picker error handling, F05's enforcement, override and override-permission rejections **keep the endpoint's existing `{ message }` shape** rather than introducing `{ success, error }` on this one handler. See `[Auto-Accept] D6`.

---

## 3. Data Model — `Agendamento` (tenant DB) — extend

F05 introduces **no new collection**. It adds one optional sub-document to the existing `Agendamento` schema to make a forced `encaixe` auditable:

```js
// src/models/Agendamento.js — new field on agendamentoSchema
encaixe: {
  forcado:       { type: Boolean, default: false },          // true → created outside resolved availability via override
  motivo:        { type: String, default: null, maxlength: 280 }, // optional reason supplied by the admin
  autorizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // req.user._id of the admin
  autorizadoEm:  { type: Date, default: null },              // when the override was applied
},
```

- The sub-document stays at its defaults (`forcado: false`, the rest `null`) for every normal in-hours booking.
- It is populated **only** when an `admin` creates a booking with a valid `forcarEncaixe: true` outside resolved availability. `autorizadoPor` is server-derived from `req.user._id` (never from the body); `autorizadoEm` is `DateTime.now().setZone('Europe/Lisbon')`.
- No new index (the field is written on create and read for audit only; it is not a query key). See `[Auto-Accept] D3`.

No other `Agendamento` fields change; the existing partial-unique slot index (`tenant_datahora_ocupaslot_unique`) and `ocupaSlot` derivation are untouched.

---

## 4. API Contracts

F05 changes the **behaviour** of an existing route; it adds **no new route**.

### POST /agendamentos  /  POST /v1/agendamentos — create booking (existing, now enforced)
Mounted on the existing agendamento router behind `authenticate` + `authorize('admin','gerente','recepcionista')` + `validate(createAgendamentoSchema)` (unchanged). Two new optional body fields:

Request (normal, in-hours):
```json
{ "tipo": "Sessao", "cliente": "665...", "dataHora": "2026-07-01T10:00:00", "servicoTipo": "avulso", "servicoAvulsoNome": "Limpeza" }
```

Request (admin override / encaixe outside hours):
```json
{ "tipo": "Sessao", "cliente": "665...", "dataHora": "2026-07-01T20:30:00",
  "forcarEncaixe": true, "motivoEncaixe": "encaixe pedido pela cliente, fora de horas" }
```

- `forcarEncaixe` — optional boolean, default `false`. Honoured **only** for `admin` (and `superadmin`); any other role sending `true` → **403** (`{ message }`).
- `motivoEncaixe` — optional string (≤280). Stored in `encaixe.motivo`. Ignored when `forcarEncaixe` is not `true`.
- Server sets `encaixe.autorizadoPor` (`req.user._id`) and `encaixe.autorizadoEm`; never from the body.

Success `201` — **raw `Agendamento` document** (existing legacy shape, now including the `encaixe` sub-document):
```json
{ "_id": "...", "tipo": "Sessao", "cliente": "665...", "dataHora": "2026-07-01T19:30:00.000Z",
  "status": "Agendado", "ocupaSlot": true,
  "encaixe": { "forcado": true, "motivo": "encaixe pedido pela cliente, fora de horas",
               "autorizadoPor": "501...", "autorizadoEm": "2026-06-30T..." } }
```

**Resolution logic added to `createAgendamento`** (after the existing past-date and *before* the existing conflict checks):
1. Derive `date = agendamentoDateTime.toFormat('yyyy-MM-dd')` and `time = agendamentoDateTime.toFormat('HH:mm')` (`Europe/Lisbon`).
2. `const slots = await resolveAvailableSlots({ Schedule, ScheduleException, Agendamento, tenantId: req.tenantId, date, duration: 60 })` (60 min — the duration `createAgendamento` already assumes; `[Auto-Accept] D2`).
3. If the tenant has **no `Schedule`** configured → enforcement is **skipped** (permissive — same as today, no expediente to honour). See `[Auto-Accept] D4`.
4. If `time` **is in** `slots` → proceed (normal booking, `encaixe.forcado:false`).
5. If `time` **is not in** `slots` (out of hours, in pause, occupied, or a `fechado` date):
   - `forcarEncaixe !== true` → **400** `{ message: '<availability reason>' }` (e.g. `"Horário fora da disponibilidade configurada."` / `"O salão está fechado nesta data."`).
   - `forcarEncaixe === true` **and** role is not `admin`/`superadmin` → **403** `{ message: 'Apenas um admin pode forçar um encaixe fora de horas.' }`.
   - `forcarEncaixe === true` **and** role is `admin`/`superadmin` → proceed, stamping `encaixe = { forcado:true, motivo: motivoEncaixe ?? null, autorizadoPor: req.user._id, autorizadoEm: now }`.

The existing 60-min **conflict** check (409 `slot_taken`) and the partial-unique index still run after enforcement — an override forces *out-of-hours*, it does **not** bypass a hard double-booking of the same `dataHora` (`[Auto-Accept] D8`).

---

## 5. Requirements / Business Rules

- **R1.** A booking whose `dataHora` falls **outside the resolved availability** for its date (out of expediente, in the pause, or on a `fechado` exception date) and **without** a valid override → **400** with the availability reason; **no** `Agendamento` is created.
- **R2.** "Resolved availability" is computed **only** by the shared **`resolveAvailableSlots`** helper (F03) — base `Schedule` + `ScheduleException` precedence (F02) − existing bookings/pause. F05 does **not** duplicate or fork slot logic; the rule the backend enforces equals what the AI (F03) and the panel/F04 picker offer (PRD §9 cross-feature: "an out-of-hours time the slot picker hid is the same time enforcement rejects").
- **R3.** A `fechado` exception date yields no slots → any booking on that date without override → **400** (PRD F05 error handling).
- **R4. Override is admin-only.** `forcarEncaixe: true` is honoured for `admin` (and `superadmin`); any other authenticated role sending it → **403**, no booking created. Normal (non-override) booking-creation roles are unchanged (`admin`/`gerente`/`recepcionista`).
- **R5. Override is recorded.** A forced booking persists `encaixe = { forcado:true, motivo, autorizadoPor, autorizadoEm }`; `autorizadoPor`/`autorizadoEm` are server-derived (from `req.user` / `Europe/Lisbon` now), never from the body (no mass-assignment — `validate.js` already strips server-managed keys and `.strict()` rejects unknown body keys).
- **R6. AI / automated paths are enforced, never override.** Any path calling `createAgendamento` is subject to R1; the AI does not send `forcarEncaixe` and could not satisfy R4 (it is not an `admin` JWT), so it only books real slots — which it already reads from the same `resolveAvailableSlots` source (F03). Enforcement is a transparent safety net for the AI. (The legacy `functionDispatcher.schedule_appointment` writes directly to the model and does **not** pass through `createAgendamento`; it is therefore **not** covered by F05 — see `[Auto-Accept] D5`.)
- **R7. Tenant-scoped.** Enforcement reads `Schedule`/`ScheduleException`/`Agendamento` only for `req.tenantId` (via `resolveAvailableSlots`); one tenant's availability never affects another's enforcement decision.
- **R8. Permissive when unconfigured / on or before F05.** A tenant with no `Schedule` is not blocked (R for graceful rollout — matches the pre-F05 default and F03's `scheduleConfigured:false`). Enforcement is the only behavioural change F05 introduces; everything else on the create path (past-date, conflict, plan, RBAC) is unchanged.
- **R9. Non-destructive ordering.** F05 ships after F03 + F04; before it, bookings are free. Reverting F05 (removing the enforcement branch) restores the permissive default with no data migration.

**UX flow:** A normal out-of-hours booking is rejected with a clear message (the panel surfaces it like the existing conflict message). An `admin` who really needs an `encaixe` re-submits with the override (and optionally a reason); the booking is created and the override is recorded for later audit.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| `dataHora` outside resolved availability, no override | 400 | `{ message: 'Horário fora da disponibilidade configurada.' }` |
| Booking on a `fechado` exception date, no override | 400 | `{ message: 'O salão está fechado nesta data.' }` |
| `forcarEncaixe: true` by a non-`admin` role | 403 | `{ message: 'Apenas um admin pode forçar um encaixe fora de horas.' }` |
| `motivoEncaixe` > 280 chars | 400 | `{ success:false, error:'motivoEncaixe: <msg>' }` (from `validate()` — pre-handler) |
| Same exact `dataHora` already occupied (override or not) | 409 | `{ message: 'Já existe um agendamento para este horário.', code:'slot_taken' }` (existing) |
| `dataHora` in the past / invalid | 400 | `{ message: '...' }` (existing checks, unchanged) |
| No token / invalid token | 401 | handled by `authenticate` |
| Role not allowed to create at all | 403 | handled by `authorize('admin','gerente','recepcionista')` (existing) |
| Unexpected | 500 | `{ message: 'Erro interno ao criar agendamento.' }` (existing) |

> The enforcement/override rejections use the handler's existing `{ message }` shape (D6); only the *pre-handler* Zod failure on `motivoEncaixe` uses the canonical `{ success, error }` (that is `validate.js`, unchanged).

---

## 7. Testing Strategy

`tests/agendamento-enforcement.test.js` (Jest ESM + supertest + `mongodb-memory-server`; external services — push, Evolution/WhatsApp, notifications — mocked per `.claude/rules/testing.md`). Seed a base `Schedule` (e.g. a weekday active 09:00–18:00, pause 13:00–14:00) and, where relevant, a `ScheduleException`, then drive `POST /agendamentos`.

**Acceptance (from PRD §9 F05):**
- `out-of-hours booking without override → 400 with the reason, no Agendamento created` (e.g. 20:30 on an active day ending 18:00).
- `in-hours booking → 201` (a time present in `resolveAvailableSlots`, `encaixe.forcado:false`).
- `admin override → 201, booking created and the override recorded` (`encaixe.forcado:true`, `autorizadoPor` = admin id, `motivo` round-trips, `autorizadoEm` set).
- `booking on a fechado date without override → 400` (exception precedence flows through F02/F03; even though the weekday is active).
- `override by a non-admin (gerente/recepcionista) → 403, no booking created`.
- `pause-time booking without override → 400` (13:30 inside 13:00–14:00 pause).

**Parity / single-source (PRD §9 cross-feature):**
- `enforcement rejects exactly the times resolveAvailableSlots omits` — for a given date/duration, a time **in** the helper's slots is accepted and a time **absent** is rejected (the same set F04's picker shows / F03's endpoint returns).
- `a horas-extra exception opens the extra window` — a time inside the F02 `horas-extra` window is accepted without override even if the base weekday would have rejected it.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant A's Schedule/fechado exception does not affect Tenant B's enforcement` — same wall-clock time accepted for B while rejected for A.
- `Tenant B cannot create a booking against Tenant A's data` — tenant context comes from the JWT; cross-tenant references resolve to 400/404, never another tenant's slots.

**Backwards-compat / rollout:**
- `tenant with no Schedule configured → booking is permitted (permissive, no 400)` — graceful pre-config behaviour (R8).
- `existing normal create flow (notifications scheduled, raw document returned) is unchanged for in-hours bookings`.

**Cross-feature note (already verified upstream):** the slot math, exception precedence and parity with the AI/panel are F02/F03/F04 concerns; F05 only asserts that enforcement *uses* that same source and that the override path records correctly. Not re-tested beyond the parity assertions above.

---

## Assumptions / Decisions

- **[Auto-Accept] D1 — Enforcement is reactivated inline in `createAgendamento`, not a separate middleware.** The ADR says explicitly "Reactivar a validação no `createAgendamento`". The check needs `req.models`, the parsed `dataHora`, the resolved slots, and the override/role/record logic intertwined with document creation; a middleware would re-derive the same state and split the override-recording across two places. Inline (where the commented block already lives) is the minimal, faithful reactivation.
- **[Auto-Accept] D2 — Enforce against a 60-min duration.** `createAgendamento` already assumes `agendamentoDurationMinutes = 60` for its conflict window; F05 resolves slots with `duration: 60` for consistency with that conflict check and with the panel's default service duration. Membership of the requested `HH:mm` in `resolveAvailableSlots(...)` is the rule (slots are duration-stepped, so a valid booking lands on a slot start — exactly what F04's picker offers).
- **[Auto-Accept] D3 — Override recorded as an `encaixe` sub-document on `Agendamento`.** The PRD requires "the override is recorded (who/why)". A typed sub-document (`forcado`/`motivo`/`autorizadoPor`/`autorizadoEm`) keeps the audit trail co-located with the booking it justifies, is queryable later ("show forced encaixes"), and needs no new collection or `AuditLog` coupling. No index (audit-read only, not a hot query key).
- **[Auto-Accept] D4 — No `Schedule` configured → permissive (skip enforcement).** Mirrors today's behaviour and F03's `scheduleConfigured:false` graceful-empty principle: a clinic that has not set hours yet must not be locked out of booking. Enforcement only bites once a `Schedule` exists. Keeps the rollout non-destructive (PRD objective "keep the rollout non-destructive").
- **[Auto-Accept] D5 — Override flag `forcarEncaixe` (boolean) + `motivoEncaixe` (string); the AI opts out by never sending it and not being `admin`.** PRD/ADR do not name the flag. Portuguese, intent-revealing names matching the domain term `encaixe`. Override is gated to `admin` role inside the handler (not via `authorize`, since `recepcionista`/`gerente` may still *create* normal bookings). The AI/automated path is not an `admin` JWT and does not send the flag, so it is always enforced and only books real slots — satisfying "the AI never overrides". Known gap: the legacy `functionDispatcher.schedule_appointment` writes the model directly and bypasses `createAgendamento`; it is out of F05's scope and flagged for a follow-up to route AI bookings through the enforced path.
- **[Auto-Accept] D6 — Enforcement/override rejections keep the handler's legacy `{ message }` shape.** `createAgendamento` returns the raw document on success and `{ message }` on its rejections (the 409 conflict, the original commented out-of-hours block). Introducing `{ success, error }` on only the new branches would make a single endpoint self-inconsistent and risks breaking the existing booking UI / F04 picker error handling, which already parse `{ message }` from this route. (The pre-handler Zod failure on `motivoEncaixe` stays `{ success, error }` because that is `validate.js`, untouched.) Consistent with F02 D6 (legacy schedule endpoints keep their shapes).
- **[Auto-Accept] D7 — F05 is backend-only; the panel override toggle is a thin follow-up, not a deliverable here.** PRD lists F05 as "Backend Availability Enforcement"; the contract (reject out-of-hours, admin override recorded) is fully exercisable via the API. Wiring a "forçar encaixe" checkbox onto F04's slot picker is a small UI add that depends on F04 and can land alongside or just after; it is noted but not required for F05's acceptance.
- **[Auto-Accept] D8 — Override forces *out-of-hours*, not *double-booking*.** The existing 60-min conflict check and the `tenant_datahora_ocupaslot_unique` partial index still run after enforcement; `forcarEncaixe` lets an `admin` book outside expediente but does not let two bookings occupy the same exact `dataHora` (that stays a 409). Override semantics are intentionally narrow.
- **[Auto-Accept] D9 — `resolveAvailableSlots` is imported from `scheduleController.js`.** F03 extracts and exports the helper there (a non-migrated shared subsystem). The migrated agendamento module importing it is an accepted cross-module import while the `Schedule` subsystem awaits its own module (ADR-011 migration in progress); it guarantees the parity the PRD demands without duplicating math. If F03 instead places the helper in a shared util, F05 imports it from there — the contract (same single source) is what matters.
