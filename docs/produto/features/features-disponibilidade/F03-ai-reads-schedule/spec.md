# F03 — AI Reads Availability from Schedule — Spec

**PRD:** `docs/produto/PRD-disponibilidade-unificada.md` (F03)
**ADR:** `docs/adrs/generated/ADR-028-disponibilidade-fonte-unica-painel-ia.md` (Fase 2 — A IA lê o `Schedule`; + nota de migração)
**Complexity:** complex
**Module:** `src/routes/` + `src/controllers/scheduleController.js` (non-migrated subsystem) + new `src/routes/disponibilidadeInternalRoutes.js` + `src/migrations/` (backend) **and** `ia-service/src/ia_service/services/` (Python) — cross-service, tenant-scoped via service token

---

## 1. Scope

> **🔗 Dependency:** F03 depends on **F02** (Date Exceptions & Note on Schedule), which added the `ScheduleException` model and made `getAvailableSlots` honor exceptions (a `fechado` date → no slots; `horas-extra`/`horario-especial` → the exception window, precedence over the base weekday). F03 does **not** change the slot math — it exposes the F02-extended calculation over a single internal endpoint and points the AI at it. F03 also depends on F01 (the reopened `Schedule` subsystem). The `Schedule` subsystem is **not modular** (ADR-011): it lives in `src/controllers/` + `src/routes/` and is extended in place.

**Included:**
- New **backend internal endpoint** `GET /api/internal/disponibilidade`, guarded by the existing `X-Service-Token` middleware (`requireServiceToken`, NOT JWT), mounted under `/api/internal/*` (not versioned). Params: `tenantId` + `date` and/or `from`/`to` range (or a `days` window) + service `duration`.
- The endpoint returns the slots computed by the **F02-extended `getAvailableSlots` logic** (base weekday `Schedule` + `ScheduleException` precedence + existing bookings + pause). **The single slot calculation stays in the backend.** To guarantee parity, the per-day slot computation is extracted into a shared helper (`resolveAvailableSlots`) reused by both the legacy `getAvailableSlots` handler and the new internal endpoint.
- The endpoint uses the canonical **`{ success, data }`** envelope (it is a *new* internal route; the legacy `/schedules/*` endpoints keep their raw shapes per F02 D6).
- **Graceful, flagged empty set:** a tenant with no `Schedule` configured returns `scheduleConfigured: false` with empty slots (HTTP 200, **not** an error), so the AI never invents times.
- **Rewire the ia-service:** `mongo_reader.find_available_slots` is changed to **call this endpoint over HTTP (httpx)** instead of reading `agent_business_rules.py`. Its signature and return shape are preserved so the lead/client agent tools (`get_available_slots` in `lead_tools.py`, reused by `client_tools.py`) need no change. `RULES_PER_TENANT` / `DATE_OVERRIDES_PER_TENANT` stop being the source.
- **Graceful degradation in the AI:** if the endpoint is unreachable/errors, `find_available_slots` returns an empty list and logs — the AI's existing empty-slots fallback ("recepcionista entra em contacto") covers it. The AI does **not** invent slots.
- **One-off migration** (`src/migrations/seedScheduleFromAgentRules.js`): seeds each tenant's base `Schedule` (7 weekday docs) + `ScheduleException` from the current hardcoded Python values, so flipping the AI over does not regress behavior. Dry-run by default, idempotent, reversible.

**Provides (to later features):**
- A single availability read used by the AI today and available to any other reader (F05 enforcement aligns to the same source).

**Deferred (other features):** slot picking in manual booking (F04, reuses `getAvailableSlots` directly in-panel) and backend enforcement on booking creation (F05) are out of scope here. F03 only unifies the AI's data source and ships the migration.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/controllers/scheduleController.js` | edit | Extract the per-day slot math into an exported pure helper `resolveAvailableSlots({ Schedule, ScheduleException, Agendamento, tenantId, date, duration })` (the F02-extended logic: weekday doc + exception precedence + bookings + break). Refactor `getAvailableSlots` to call it (response shape unchanged). Add `getDisponibilidadeInterna` handler that resolves tenant context from the query and returns the canonical envelope. |
| `src/controllers/disponibilidadeInternalController.js` | new (optional) | If preferred over co-locating, host `getDisponibilidadeInterna` here; resolves tenant context (mirrors `clienteInternalRoutes.resolveTenantContext`) and calls `resolveAvailableSlots` per day across the window. See `[Auto-Accept] D9`. |
| `src/routes/disponibilidadeInternalRoutes.js` | new | `router.use(requireServiceToken)`; `GET /` → internal disponibilidade handler. |
| `src/app.js` | edit | Mount `app.use('/api/internal/disponibilidade', disponibilidadeInternalRoutes)` next to the existing `/api/internal/clientes` / `/api/internal/leads` mounts (NOT in `apiResources`, NOT under `/api/v1`). |
| `src/migrations/seedScheduleFromAgentRules.js` | new | One-off seed of base `Schedule` + `ScheduleException` per tenant from a JS snapshot of the hardcoded Python rules. Dry-run default, `--apply`, `--rollback`; idempotent upserts. |
| `ia-service/src/ia_service/services/marcai_client.py` | edit | Add a **synchronous** `fetch_available_slots(tenant_id, *, date=None, from_=None, to=None, days=7, duration=60)` using `httpx.Client` + `x-service-token` header (the agent tool is sync). Returns the parsed `data` payload. |
| `ia-service/src/ia_service/services/mongo_reader.py` | edit | Rewire `find_available_slots(...)` to call `marcai_client.fetch_available_slots` and **reshape** the response into the existing `list[{date,time,weekday,iso}]` contract; on transport/HTTP error or `scheduleConfigured: false`, return `[]` (graceful). Stop importing `agent_business_rules`. |
| `ia-service/src/ia_service/services/agent_business_rules.py` | edit (deprecate) | No longer the source for `find_available_slots`. Keep the file with a deprecation note (physical deletion is a follow-up to avoid breaking other imports/tests). See `[Auto-Accept] D11`. |
| `tests/disponibilidade-internal.test.js` | new | Jest + supertest + mongodb-memory-server — endpoint behavior, `X-Service-Token` 401, tenant isolation, exception precedence, empty-but-flagged, parity with legacy `getAvailableSlots`. |
| `ia-service/tests/test_find_available_slots.py` | new | pytest + `pytest_httpx`/`respx` (already installed) — `find_available_slots` against a mocked endpoint; degradation on error; `scheduleConfigured:false` → `[]`. No real cross-service calls. |

Pattern references: `src/modules/clientes/clienteInternalRoutes.js` (internal-route + `resolveTenantContext` idiom), `src/middlewares/requireServiceToken.js` (`x-service-token`, fail-closed 401), `src/controllers/scheduleController.js` (F02-extended slot math), `ia-service/.../marcai_client.py` (httpx + `_auth_headers`), `ia-service/.../mongo_reader.py` (current `find_available_slots`), `src/migrations/createLauraTenant.js` (migration script shape).

---

## 3. Data Model

F03 introduces **no new schema**. It reads `Schedule` (F01) and `ScheduleException` (F02) from the tenant DB via `getModels(getTenantDB(tenantId))`. The migration only **writes seed rows** into those existing collections.

**Migration weekday/field mapping (Python → Mongo).** The Python convention is `0=Monday … 6=Sunday`; the Mongoose `Schedule.dayOfWeek` is `0=Domingo … 6=Sábado` (per `initializeSchedules` and the Luxon→Mongoose conversion in `getAvailableSlots`). Mapping:

| Python `DayRule` | Mongo `Schedule` |
|---|---|
| `monday`(0) → `1`, `tuesday`(1) → `2`, `wednesday`(2) → `3`, `thursday`(3) → `4`, `friday`(4) → `5`, `saturday`(5) → `6`, `sunday`(6) → `0` | `dayOfWeek` |
| `start` / `end` | `startTime` / `endTime` |
| `break_start` / `break_end` (optional) | `breakStartTime` / `breakEndTime` |
| `None` (closed) | `isActive: false` |
| a `DayRule` present | `isActive: true` |

| Python `DATE_OVERRIDES_PER_TENANT[date]` | Mongo `ScheduleException` (`data` = `"YYYY-MM-DD"`) |
|---|---|
| `None` (closed that date) | `{ tipo: 'fechado', inicio: null, fim: null }` |
| `{start, end[, break]}` | `{ tipo: 'horario-especial', inicio: start, fim: end }` |

---

## 4. API Contracts

### GET /api/internal/disponibilidade — available slots for the AI (service token)

**Auth:** `X-Service-Token: <INTERNAL_SERVICE_TOKEN>` (via `requireServiceToken`). Missing/invalid → **401** `{ success:false, error:'Não autenticado' }`. No JWT. Not exposed under `/api/v1`.

**Query params:**
- `tenantId` (required) — tenant whose availability to read. Invalid/missing → 400; tenant not found → 404; plan inactive → 403 (reuses the `resolveTenantContext` policy of the other internal routes).
- `date` (`YYYY-MM-DD`, optional) — single day.
- `from` / `to` (`YYYY-MM-DD`, optional) — inclusive date range.
- `days` (int, optional, default `7`, max `30`) — window of days from today when neither `date` nor `from`/`to` is given.
- `duration` (int minutes, optional, default `60`) — service duration for slot stepping.

Resolution: `date` → that single day; else `from`/`to` → that range; else today..today+`days`. See `[Auto-Accept] D1`.

Response `200` (slots present):
```json
{
  "success": true,
  "data": {
    "tenantId": "695413fb6ce936a9097af750",
    "timezone": "Europe/Lisbon",
    "duration": 60,
    "scheduleConfigured": true,
    "days": [
      { "date": "2026-07-01", "weekday": "Terça",  "isException": false, "exceptionType": null,       "slots": ["09:00", "10:00", "11:00"] },
      { "date": "2026-07-02", "weekday": "Quarta", "isException": true,  "exceptionType": "fechado",  "slots": [] }
    ]
  }
}
```

Response `200` (tenant with no `Schedule` — empty-but-flagged, NOT an error):
```json
{ "success": true, "data": { "tenantId": "...", "timezone": "Europe/Lisbon", "duration": 60, "scheduleConfigured": false, "days": [] } }
```

- Per-day `slots` are the **exact** output of `resolveAvailableSlots` for that `(tenantId, date, duration)` — identical to what the legacy `getAvailableSlots` returns for the same date (parity guarantee). `[Auto-Accept] D2`, `D3`.
- `isException` / `exceptionType` expose whether a `ScheduleException` drove the day (diagnostic; the AI may ignore them).

### ia-service consumption (not an HTTP contract, but the wiring)

`mongo_reader.find_available_slots(tenant_id, dias_a_frente=7, slot_duration_min=60, timezone_name="Europe/Lisbon")` is rewired to:
1. Call `marcai_client.fetch_available_slots(tenant_id, days=dias_a_frente, duration=slot_duration_min)` (base URL from `settings.marcai_api_url`, header `x-service-token`).
2. Reshape `data.days[*].slots[]` into the existing `list[{date, time, weekday, iso}]` (one entry per slot; `iso` = naive local ISO `f"{date}T{time}:00"`), preserving chronological order.
3. On any transport/HTTP error, or `scheduleConfigured: false`, return `[]` (graceful degradation — no invented slots). Signature & return shape are unchanged, so `lead_tools.get_available_slots` / `client_tools` need no edits.

---

## 5. Requirements / Business Rules

- **R1.** The internal endpoint requires a valid `X-Service-Token`; missing/invalid → **401** (fail-closed, also when `INTERNAL_SERVICE_TOKEN` is unset). No JWT path.
- **R2.** The endpoint returns slots from the **F02-extended slot calculation reused unchanged** (`resolveAvailableSlots`): base weekday `Schedule` (`isActive`, start/end, break) + `ScheduleException` precedence (`fechado` → no slots; `horas-extra`/`horario-especial` → exception window) + existing bookings. F03 does not re-implement slot math.
- **R3. Parity.** For a given `(tenantId, date, duration)`, the endpoint's `slots` array equals what the legacy `GET /schedules/available-slots` returns for that date. Both call the same `resolveAvailableSlots` helper.
- **R4.** All reads are tenant-scoped by the `tenantId` query param resolved through `resolveTenantContext` → `getModels(getTenantDB(tenantId))`; one tenant's `Schedule`/exceptions/bookings never leak into another tenant's response.
- **R5. Empty-but-flagged.** A tenant with no `Schedule` configured → `200` with `scheduleConfigured: false` and `days: []`. Never a 4xx/5xx for "no schedule".
- **R6. AI never invents slots.** `find_available_slots` sources slots only from the endpoint; on error or `scheduleConfigured:false` it returns `[]`, and the agent tool's existing empty-slots message asks the lead to wait for the receptionist.
- **R7. Source switch.** After the migration runs, `agent_business_rules.py` (`RULES_PER_TENANT` / `DATE_OVERRIDES_PER_TENANT`) is no longer read by `find_available_slots`; panel changes flow to the AI live with no `ia-service` rebuild.
- **R8. Migration safety.** The migration is **dry-run by default** (prints intended writes), applies only with `--apply`, is **idempotent** (re-running changes nothing — upsert keyed by `(tenantId, dayOfWeek)` and `(tenantId, data)`), and **reversible** (`--rollback` removes the seeded exceptions and restores untouched-day defaults). It must run **before** the AI is flipped over so behavior does not regress.
- **R9.** The endpoint base URL the ia-service calls comes from `settings.marcai_api_url` (env `MARCAI_API_URL`); no new env var is introduced. The token reuses `INTERNAL_SERVICE_TOKEN` (already required by both services).

**UX flow:** Owner edits weekly hours / date exceptions in the panel (F01/F02). The AI, when proposing times over WhatsApp, calls `/api/internal/disponibilidade` and offers exactly the slots the panel would — live, with no rebuild.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Missing/invalid `X-Service-Token` | 401 | `{ success:false, error:'Não autenticado' }` (via `requireServiceToken`) |
| Missing/invalid `tenantId` (bad ObjectId) | 400 | `{ success:false, error:'tenantId inválido' }` |
| `tenantId` not found | 404 | `{ success:false, error:'Tenant não encontrado' }` |
| Tenant plan inactive | 403 | `{ success:false, error:'Plano inactivo' }` |
| Invalid `date`/`from`/`to` format (not `YYYY-MM-DD`) | 400 | `{ success:false, error:'<campo>: formato inválido (YYYY-MM-DD)' }` |
| Tenant with no `Schedule` configured | 200 | `{ success:true, data:{ scheduleConfigured:false, days:[] } }` (NOT an error) |
| Unexpected | 500 | `{ success:false, error:'Erro interno' }` |

**ia-service degradation:** endpoint unreachable / 5xx / timeout → `find_available_slots` returns `[]`, logs a warning; the agent proposes no times and routes the lead to the receptionist (no invented slots).

---

## 7. Testing Strategy

### 7.1 Backend integration — `tests/disponibilidade-internal.test.js`
Jest ESM + supertest + `mongodb-memory-server`; external services mocked per `.claude/rules/testing.md`. The test sets `INTERNAL_SERVICE_TOKEN` and sends `X-Service-Token`.

**Acceptance (from PRD §9 F03):**
- `returns the same slots getAvailableSlots produces for the tenant/date` — seed a `Schedule` + a booking; assert the endpoint's `days[0].slots` equals the legacy `/schedules/available-slots` output for that date (parity, R3).
- `without a valid X-Service-Token → 401` (missing header and wrong token).
- `honors a fechado exception → that date has slots: []` even when the weekday is active (F02 precedence flows through).
- `honors a horas-extra/horario-especial exception → slots within the exception window`.
- `tenant with no Schedule → scheduleConfigured:false, days:[] (200, not an error)`.
- `range/days/date params resolve the expected set of days`.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B's response is unaffected by Tenant A's Schedule/exceptions/bookings` — seed both; query each `tenantId`; assert no cross-leak.
- `Tenant A's fechado exception does not close Tenant B's same date`.

### 7.2 ia-service unit — `ia-service/tests/test_find_available_slots.py`
pytest + `pytest_httpx`/`respx` (installed). **No real cross-service calls.**
- `find_available_slots reshapes endpoint slots into [{date,time,weekday,iso}]` — mock the endpoint to return two days with slots; assert the flattened, chronologically-ordered list and `iso` format.
- `scheduleConfigured:false → returns []`.
- `endpoint 500 / timeout → returns [] (graceful, no exception bubbles)`.
- `agent_business_rules is not imported/used by find_available_slots` (source switch — R7).
- (Optional) `get_available_slots tool returns the receptionist-fallback message when find_available_slots is []` (degradation surfaced to the agent).

### 7.3 Migration — dry-run & idempotency (`tests/disponibilidade-internal.test.js` or a focused script test)
- `dry-run prints intended writes and writes nothing`.
- `--apply seeds base Schedule (correct weekday mapping) + exceptions from the snapshot`.
- `re-running --apply is a no-op (idempotent)`.
- `after seeding, the endpoint reproduces the pre-migration availability for the pilot tenant for an unchanged schedule` (no regression — PRD §9).

**Cross-feature note (verified in later features):** F04's slot picker and F05's enforcement read the same `resolveAvailableSlots` source; closing a date in the panel (F02) makes both this endpoint and the AI stop offering that date. Not re-tested here beyond the parity assertion.

---

## Assumptions / Decisions

- **[Auto-Accept] D1 — Endpoint params (`date` | `from`/`to` | `days`, + `duration`).** The PRD says "date and/or range + service duration" without exact names. Adopt `tenantId` (required) + optional `date` (single day) | `from`/`to` (range) | `days` (window, default 7, max 30) + `duration` (default 60). `days` default 7 mirrors the current `find_available_slots(dias_a_frente=7)`; the agent tool already caps at 30. Mirrors the date-only `YYYY-MM-DD` convention used by `getAvailableSlots` and F02.
- **[Auto-Accept] D2 — Slot payload shape (`{ scheduleConfigured, timezone, duration, days:[{date,weekday,isException,exceptionType,slots[]}] }`).** The PRD doesn't fix the body. A per-day grouped shape supports the AI's day-by-day flow, carries the `scheduleConfigured` flag (graceful empty) and the exception diagnostic, and reshapes cleanly into the ia-service's existing `[{date,time,weekday,iso}]` contract. Canonical `{ success, data }` envelope (new internal route).
- **[Auto-Accept] D3 — Reuse via an extracted shared helper `resolveAvailableSlots`.** `getAvailableSlots` is an Express handler bound to `req.models`/`req.tenantId`; to *guarantee* parity (PRD: "returns the same slots") the pure per-day computation (F02-extended) is extracted into one exported function called by both the legacy handler and the new endpoint. This honors "single slot calculation stays in the backend" without duplicating math.
- **[Auto-Accept] D4 — Backend base URL reuses `MARCAI_API_URL` (`settings.marcai_api_url`); no new env var.** The ia-service already calls Node via this base for all `/api/internal/*` traffic; the disponibilidade call uses the same base + same `INTERNAL_SERVICE_TOKEN`.
- **[Auto-Accept] D5 — Synchronous httpx call from the ia-service.** `find_available_slots` and the `get_available_slots` agent tool are synchronous; `marcai_client` is otherwise async. Add a sync `fetch_available_slots` using `httpx.Client` (rather than forcing an event loop inside the tool). `find_available_slots` keeps its signature and return shape so `lead_tools`/`client_tools` are untouched.
- **[Auto-Accept] D6 — Graceful degradation = return `[]`.** On endpoint error/timeout or `scheduleConfigured:false`, `find_available_slots` returns `[]` and logs; the agent tool's existing empty-slots branch ("recepcionista entra em contacto") is the graceful message. This satisfies "must NOT invent slots" with minimal surface change.
- **[Auto-Accept] D7 — Migration source = a JS snapshot of the hardcoded Python rules.** Node cannot import the Python module, so the migration embeds a transcribed constant of `RULES_PER_TENANT` + `DATE_OVERRIDES_PER_TENANT` (current values, incl. the Laura pilot `695413fb6ce936a9097af750`), applying the weekday/field mapping in §3. Captured as a static snapshot at write time (the Python file is being retired as the source anyway).
- **[Auto-Accept] D8 — Migration file `src/migrations/seedScheduleFromAgentRules.js`; dry-run default, `--apply`, `--rollback`; idempotent upserts.** Matches the existing `src/migrations/` script style (`dotenv-flow`, direct model use). Idempotency keyed by `(tenantId, dayOfWeek)` for base days and the unique `(tenantId, data)` for exceptions; `--rollback` removes seeded exceptions and resets seeded days to defaults.
- **[Auto-Accept] D9 — Internal endpoint co-located via `resolveTenantContext` mirror; mounted at `/api/internal/disponibilidade` (not `apiResources`, not `/api/v1`).** Internal routes are intentionally outside the dual-mount/versioned resource loop (same as `/api/internal/clientes`), guarded only by `requireServiceToken`. Handler may live in `scheduleController.js` or a small `disponibilidadeInternalController.js`; either way it reuses the `resolveTenantContext` pattern from `clienteInternalRoutes`.
- **[Auto-Accept] D10 — Plan-inactive tenant → 403 on the internal endpoint.** Reuses the `resolveTenantContext` policy already applied by the other internal routes (`ativo`/`trial` only). An inactive tenant's AI should not be proposing slots; consistent with the existing internal-route behavior.
- **[Auto-Accept] D11 — Keep `agent_business_rules.py` as a deprecated, unused file (no physical deletion in F03).** Removing it could break other imports/tests; F03 only stops `find_available_slots` from reading it (the behavioral "source switch"). Physical deletion is a follow-up cleanup once nothing references it.
