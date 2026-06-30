# F02 — Date Exceptions & Note on Schedule — Spec

**PRD:** `docs/produto/PRD-disponibilidade-unificada.md` (F02)
**ADR:** `docs/adrs/generated/ADR-028-disponibilidade-fonte-unica-painel-ia.md` (Fase 1 — Excepções por data)
**Complexity:** medium
**Module:** `src/models/` (Schedule extend + new `ScheduleException`) + `src/controllers/scheduleController.js` + `src/routes/scheduleRoutes.js` (non-migrated subsystem) + frontend `Disponibilidade.tsx` — backend + frontend, tenant-scoped

---

## 1. Scope

> **🔗 Dependency:** F02 depends on **F01** (Reopen Availability UI), which re-enables the `Disponibilidade` link and the existing `/schedules` API (`getSchedules`, `updateSchedule`, `getAvailableSlots`) unchanged. F02 adds the per-date **exceptions** layer and the free-text **`observação`** note on top of that reopened subsystem. The `Schedule` subsystem is **not modular** (ADR-011): it lives in `src/controllers/` + `src/routes/` and is extended in place.

**Included:**
- Extend the per-tenant availability data with a **per-date exceptions** layer: a date, a `tipo` (`fechado` / `horas-extra` / `horario-especial`), optional `inicio`/`fim` for special hours, and a free-text **`observacao`** note (max 280 chars).
- Add an optional **`observacao`** (max 280 chars) to the base weekday `Schedule` document.
- CRUD API for date exceptions, tenant-scoped, behind `authenticate` (+ `authorize` on writes), mounted on the existing `/schedules` router (dual-mount `/api/schedules` + `/api/v1/schedules`).
- **`getAvailableSlots` updated to honor exceptions:** a `fechado` date → no slots; `horas-extra` / `horario-especial` → the exception window (precedence over the base weekday).
- UI in `Disponibilidade.tsx`: add/edit/remove a date exception with its note, shown in an **"Excepções desta data"** area separate from the base schedule; **mobile-responsive**.

**Provides (to later features):**
- **Schedule availability** — base weekly hours + per-date exceptions (close / extra hours) + note. Consumed by **F03** (AI reads availability via `getAvailableSlots`), **F04** (manual-booking slot picker), **F05** (enforcement).

**Deferred (other features):** the migration that seeds each tenant's exceptions from the hardcoded `DATE_OVERRIDES_PER_TENANT` is **F03** (one-off, idempotent, reversible) — F02 only builds the destination model/API/UI and the slot-calculation support. AI rewiring (F03), slot picking in booking (F04), and enforcement (F05) are out of scope here.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/models/ScheduleException.js` | new | Mongoose schema for a per-date exception (tenant DB); exports `ScheduleExceptionSchema` (for registry) + default model. Unique `(tenantId, data)` |
| `src/models/Schedule.js` | edit | add optional `observacao: { type: String, maxlength: 280 }` to the weekday schema |
| `src/models/registry.js` | edit | register `ScheduleException: db.model('ScheduleException', ScheduleExceptionSchema)` in `getModels` |
| `src/controllers/scheduleController.js` | edit | add `listarExcecoes`, `criarExcecao`, `actualizarExcecao`, `removerExcecao`; extend `getAvailableSlots` to honor exceptions; accept `observacao` in `updateSchedule` |
| `src/routes/scheduleRoutes.js` | edit | add `/excecoes` routes (list/create/update/delete) with `authorize` + `validate`; keep existing routes |
| `src/routes/scheduleSchemas.js` | new | Zod: `criarExcecaoSchema`, `actualizarExcecaoSchema`, `listarExcecoesQuerySchema`, `dayOfWeekParamSchema` (+ `observacao` on the base-update schema) |
| `laura-saas-frontend/src/services/scheduleService.ts` | edit | add `getExcecoes`, `criarExcecao`, `actualizarExcecao`, `removerExcecao` + `ScheduleException` type; add `observacao?` to `Schedule` type |
| `laura-saas-frontend/src/pages/Disponibilidade.tsx` | edit | "Excepções desta data" panel (add/edit/remove + note), note field on the base-day modal, mobile-responsive |
| `tests/schedule-excecoes.test.js` | new | integration tests (Jest + supertest + mongodb-memory-server) |

Pattern references: `src/models/Schedule.js` (tenant schema export idiom), `src/models/registry.js` (DB-per-tenant registration), `src/modules/clientes/clienteSchemas.js` (Zod schema style), `src/middlewares/validate.js` (Zod `validate(schema, location)`), `src/middlewares/auth.js` (`authenticate`/`authorize`).

> **⚠️ Contract note (legacy subsystem):** the existing schedule endpoints do **not** use the project's `{ success, data/error }` envelope — `getSchedules` returns `{ disponibilidade, agendamentos }`, `getAvailableSlots` returns `{ availableSlots }`, errors return `{ message }`. F01 reuses them unchanged, and the frontend service reads those raw shapes. To avoid breaking F01/the PWA, the **existing endpoints keep their current shapes**; the **new exception endpoints adopt the canonical `{ success, data/error }` contract** (CLAUDE.md). See `[Auto-Accept] D6`.

---

## 3. Data Model

### 3.1 `ScheduleException` (tenant DB) — new

```js
const ScheduleExceptionSchema = new mongoose.Schema({
  tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
  data:     { type: String, required: true },     // "YYYY-MM-DD" (date-only, TZ-safe key) — see D3
  tipo:     { type: String, required: true,
              enum: ['fechado', 'horas-extra', 'horario-especial'] },
  inicio:   { type: String, default: null },      // "HH:mm" — required when tipo !== 'fechado'
  fim:      { type: String, default: null },      // "HH:mm" — required when tipo !== 'fechado'
  observacao:{ type: String, default: '', maxlength: 280 },  // free-text note
}, { timestamps: true });

// One exception per date per tenant (override semantics, mirrors DATE_OVERRIDES key map)
ScheduleExceptionSchema.index({ tenantId: 1, data: 1 }, { unique: true });
```

- `inicio`/`fim` are ignored/forced `null` for `tipo: 'fechado'`; required (and `inicio < fim`) for `horas-extra` / `horario-especial`.
- An exception **replaces** the base weekday for its date (precedence). `fechado` → closed; the other two → the exception window is the working window for that date. See `[Auto-Accept] D4`.

### 3.2 `Schedule` (tenant DB) — extend

Add one field to the existing weekday schema:
```js
observacao: { type: String, default: '', maxlength: 280 },  // optional note on a base-schedule day
```
No new index. Existing fields (`dayOfWeek`, `isActive`, `startTime`, `endTime`, `breakStartTime`, `breakEndTime`) are unchanged.

### 3.3 Registry

Add to `getModels(db)` in `src/models/registry.js`:
```js
ScheduleException: db.model('ScheduleException', ScheduleExceptionSchema),
```

---

## 4. API Contracts

All routes mounted on the existing `/schedules` router → `/api/schedules/*` and `/api/v1/schedules/*`; all require `authenticate` (tenant context via `req.tenantId` / `req.models`). Write routes additionally require `authorize('admin','gerente')` (`superadmin` bypasses) — see `[Auto-Accept] D5`.

### GET /schedules/excecoes?from=&to=  — list exceptions (any authenticated staff)
- Optional `from`/`to` (`YYYY-MM-DD`) range filter on `data`; omitted → all exceptions for the tenant.
- Sorted by `data` ascending.

Response `200`:
```json
{ "success": true, "data": [
  { "_id": "...", "data": "2026-12-25", "tipo": "fechado", "inicio": null, "fim": null,
    "observacao": "fechado: férias", "createdAt": "2026-06-30T..." }
] }
```

### POST /schedules/excecoes  — create an exception (admin/gerente)
Request:
```json
{ "data": "2026-12-20", "tipo": "horas-extra", "inicio": "14:00", "fim": "18:00",
  "observacao": "horário especial Natal" }
```
- Server sets `tenantId` (from JWT); never from body.
- `tipo: 'fechado'` → `inicio`/`fim` optional and stored as `null`.
- `tipo: 'horas-extra' | 'horario-especial'` → `inicio`/`fim` required, `inicio < fim`.

Response `201`:
```json
{ "success": true, "data": { "_id": "...", "data": "2026-12-20", "tipo": "horas-extra",
  "inicio": "14:00", "fim": "18:00", "observacao": "horário especial Natal", "createdAt": "..." } }
```

### PUT /schedules/excecoes/:id  — update an exception (admin/gerente)
- Validate `:id` is a valid ObjectId (else 400). Tenant-scoped (`{ _id, tenantId }`); not found / cross-tenant → 404.
- Same field rules and validation as create.

Response `200`: `{ "success": true, "data": { ...updated exception... } }`

### DELETE /schedules/excecoes/:id  — remove an exception (admin/gerente)
- Tenant-scoped; not found / cross-tenant → 404.

Response `200`: `{ "success": true, "data": { "_id": "..." } }`

### PUT /schedules/:dayOfWeek  — base weekday (existing, extended)
- Now also accepts optional `observacao` (max 280) alongside `isActive/startTime/endTime/breakStartTime/breakEndTime`.
- **Response shape unchanged** (returns the raw updated `Schedule` document — legacy contract preserved for F01/PWA).

### GET /schedules/available-slots?date=&duration=  — existing, extended to honor exceptions
- Behaviour change only; **response shape unchanged** (`{ availableSlots: [...] }`).
- Resolution order for the requested `date`:
  1. Look up a `ScheduleException` for `(tenantId, date)`.
  2. If exception `tipo: 'fechado'` → `availableSlots: []`.
  3. If exception `horas-extra` / `horario-especial` → compute slots within `inicio`..`fim` (exception window replaces the base; weekday `break` still applies if present).
  4. No exception → existing behaviour (base weekday `Schedule`, `isActive`, break, existing bookings).
- Existing bookings, `duration`, and slot-stepping logic are reused unchanged.

---

## 5. Requirements / Business Rules

- **R1.** A date exception **takes precedence** over the base weekly schedule for its `data` (`fechado` closes the day; `horas-extra`/`horario-especial` define the working window). This replaces `DATE_OVERRIDES_PER_TENANT` as the per-date data source (the actual migration is F03).
- **R2.** `getAvailableSlots` honors exceptions: a `fechado` date returns no slots; an extra/special date returns slots within the exception window.
- **R3.** At most **one exception per date per tenant** (unique `(tenantId, data)`); a second create on the same date → 409.
- **R4.** `tenantId` is server-derived (from JWT); the body cannot set it (no mass-assignment — `validate.js` strips server-managed keys).
- **R5.** `tipo` is restricted to its enum; out-of-enum → 400. For `horas-extra`/`horario-especial`, `inicio`/`fim` are required and `inicio < fim` (`inicio >= fim` → 400).
- **R6.** `observacao` (on an exception or a base weekday) is optional and **≤ 280 chars**; over 280 → 400. The note is persisted and returned wherever the exception/day appears.
- **R7.** `data` must be a valid `YYYY-MM-DD` date; invalid format/date → 400.
- **R8.** All exception reads/writes are tenant-scoped (`{ tenantId }`); access to another tenant's exception (update/delete/read) → **404**, never 403.
- **R9.** Exception **writes** (create/update/delete) require `authorize('admin','gerente')`; reads are open to any authenticated staff.

**UX flow:** Owner picks a date → "Fechar este dia" / "Horas extra" → optionally writes a note ("fechado: férias") → saves. The exception appears in the **"Excepções desta data"** area with its note; the base weekly schedule is untouched. Editor and note are usable on a 375px viewport.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Missing/invalid `data` (bad format / not a date) | 400 | `{ success:false, error:'data: <msg>' }` |
| `tipo` out of enum | 400 | `{ success:false, error:'tipo: <msg>' }` |
| `horas-extra`/`horario-especial` without `inicio`/`fim`, or `inicio >= fim` | 400 | `{ success:false, error:'<campo>: <msg>' }` |
| `observacao` > 280 chars | 400 | `{ success:false, error:'observacao: <msg>' }` |
| Invalid `:id` ObjectId on update/delete | 400 | `{ success:false, error:'ID inválido' }` |
| Duplicate exception for the same date | 409 | `{ success:false, error:'Já existe uma excepção para esta data' }` |
| Exception not found in tenant (or other tenant) | 404 | `{ success:false, error:'Excepção não encontrada' }` |
| Write by a role other than admin/gerente | 403 | `{ success:false, error:'Sem permissão...' }` (via `authorize`) |
| No token / invalid token | 401 | handled by `authenticate` |
| Unexpected | 500 | `{ success:false, error:'Erro interno' }` |

> Existing `getSchedules` / `getAvailableSlots` / `updateSchedule` keep their legacy `{ message }` error shape (unchanged); only the new exception handlers use the canonical envelope.

---

## 7. Testing Strategy

### 7.1 Backend integration — `tests/schedule-excecoes.test.js`
Jest ESM + supertest + `mongodb-memory-server`; external services mocked per `.claude/rules/testing.md`.

**Acceptance (from PRD §9 F02):**
- `creates a fechado exception with a note → persisted and returned` (POST → 201, `observacao` round-trips).
- `creates a horas-extra exception with inicio/fim + note` (POST → 201).
- `getAvailableSlots returns [] on a fechado date` (exception precedence: no slots even though the weekday is active).
- `getAvailableSlots returns the exception window on a horas-extra/horario-especial date` (slots within `inicio`..`fim`, not the base hours).
- `exception takes precedence over the base weekly schedule for its date`.
- `start >= end on special hours → 400`; `note > 280 chars → 400`; `invalid data → 400`; `out-of-enum tipo → 400`.
- `duplicate exception for the same date → 409`.
- `base weekday accepts an optional observacao (≤280)`.
- `update and delete an exception` (PUT/DELETE → 200; reflected in list).

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B cannot read Tenant A's exceptions` → list returns only B's data.
- `Tenant B cannot update/delete Tenant A's exception` → 404 (never 403, never mutated).
- `Tenant B's getAvailableSlots is unaffected by Tenant A's fechado exception` (isolation of slot calculation).
- `recepcionista is blocked from creating an exception` → 403; `admin`/`gerente` allowed.

### 7.2 E2E — Playwright CLI (PRD §9 F02)
A Playwright CLI flow: log in as owner/admin → open Disponibilidade → create a **`fechado`** exception with a note for a date → confirm it appears in the "Excepções desta data" area with its note. Run **including a 375px mobile viewport** (editor and note usable on phone). Reference skill: `playwright-cli`.

**Cross-feature note (verified in later features):** F03's `getAvailableSlots`/internal endpoint and the AI will reflect these exceptions (closing a date stops the AI offering it); F04's slot picker will show no slots on a `fechado` date and the extra window on `horas-extra`; F05 enforces the same availability. Not tested in F02.

---

## Assumptions / Decisions

- **[Auto-Accept] D1 — Exceptions as a sibling collection, not a subarray.** The base `Schedule` is one document per weekday (7 docs/tenant); a per-*date* exception does not map onto a weekday document. A dedicated `ScheduleException` collection (registered in the tenant registry) is cleaner, range-queryable by `data`, avoids unbounded arrays on weekday docs, and mirrors the date-keyed `DATE_OVERRIDES_PER_TENANT` map it replaces. The base-day note is added directly to the existing `Schedule` schema (truly "extends Schedule").
- **[Auto-Accept] D2 — Route shape `/schedules/excecoes` (REST, Portuguese plural).** `GET/POST /schedules/excecoes`, `PUT/DELETE /schedules/excecoes/:id`, mounted on the existing `/schedules` router (so it inherits the dual-mount in `app.js` `apiResources`). Matches the project's resource-naming convention.
- **[Auto-Accept] D3 — `data` stored as a `"YYYY-MM-DD"` string.** Date-only, TZ-safe, matches the ISO keys used by `DATE_OVERRIDES_PER_TENANT` and the `date` param already accepted by `getAvailableSlots`. Avoids `Date` midnight/UTC drift in `Europe/Lisbon`.
- **[Auto-Accept] D4 — Precedence = replacement (not additive).** An exception fully replaces the base weekday for its date, matching the existing Python `get_rule_for_date` semantics (`None` = closed; a window = that window). `horas-extra` and `horario-especial` differ only as UX labels; both supply `inicio`/`fim` that become the day's window. The base weekday `break` still applies when present.
- **[Auto-Accept] D5 — Writes gated to `admin`/`gerente`.** The current `/schedules` routes only run `authenticate`; F02 adds `authorize('admin','gerente')` on exception writes (reads stay open to any staff), consistent with F01 ("loads for owner/admin"). `superadmin` bypasses.
- **[Auto-Accept] D6 — New endpoints use the canonical `{ success, data/error }` contract; existing schedule endpoints keep their legacy shapes.** Changing `getSchedules`/`getAvailableSlots`/`updateSchedule` envelopes would break the F01 page and the cached PWA; their shapes are preserved (slot logic is extended internally). New exception endpoints follow CLAUDE.md.
- **[Auto-Accept] D7 — One exception per date (unique `(tenantId, data)`); duplicate → 409.** Mirrors the override map (single value per date) and keeps `getAvailableSlots` deterministic.
- **[Auto-Accept] D8 — Zod schemas in `src/routes/scheduleSchemas.js`, validated via `validate()`.** The `Schedule` subsystem is non-migrated (no module folder); co-locating schemas next to its router matches the module pattern as closely as the legacy layout allows.
