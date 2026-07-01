# F03 — AI Reads Availability from Schedule — Plan

**Spec:** `./spec.md` · **Complexity:** complex · **Phases:** 5

## Prerequisites
- **F02 complete:** `ScheduleException` model + registry entry exist and `getAvailableSlots` already honors exceptions (`fechado` → no slots; `horas-extra`/`horario-especial` → exception window). **F01 complete:** `Schedule` subsystem reopened.
- Backend + ia-service running locally per `CLAUDE.md` → Environment; `INTERNAL_SERVICE_TOKEN` set in both, `MARCAI_API_URL` pointing the ia-service at the backend.
- Patterns confirmed: `src/modules/clientes/clienteInternalRoutes.js` (`resolveTenantContext`), `src/middlewares/requireServiceToken.js`, `src/controllers/scheduleController.js` (F02-extended math), `ia-service/.../marcai_client.py` (httpx + `_auth_headers`), `ia-service/.../mongo_reader.py` (`find_available_slots`), `src/migrations/createLauraTenant.js`.

## Phase 1 — Extract the shared slot helper (backend, no behavior change)
0. **Prerequisite index fix:** In `src/models/Schedule.js`, add the missing `{ tenantId: 1, dayOfWeek: 1 }` unique compound index (the model comment promises it but it is currently absent — D13). The Phase 3 migration relies on `(tenantId, dayOfWeek)` uniqueness for idempotent upserts.
1. In `src/controllers/scheduleController.js`, extract the per-day slot computation (the F02-extended logic: weekday `Schedule` + `ScheduleException` precedence + bookings + break) into an exported pure helper `resolveAvailableSlots({ Schedule, ScheduleException, Agendamento, tenantId, date, duration })` returning `{ slots, isException, exceptionType, scheduleConfigured }`.
2. Refactor the existing `getAvailableSlots` handler to call the helper (response shape `{ availableSlots }` **unchanged** — F01/PWA contract preserved). Run the existing schedule tests to confirm no regression.

## Phase 2 — Internal endpoint (backend)
3. Create `src/routes/disponibilidadeInternalRoutes.js`: `router.use(requireServiceToken)`; `GET /` → handler.
4. Add the handler (`getDisponibilidadeInterna`, in `scheduleController.js` or a small `disponibilidadeInternalController.js`): resolve tenant context from the `tenantId` query (mirror `resolveTenantContext` — 400/404/403), parse `date` | `from`/`to` | `days` (default 7, max 30) + `duration` (default 60), loop the resolved days calling `resolveAvailableSlots`, and return the canonical `{ success, data: { tenantId, timezone, duration, scheduleConfigured, days[] } }`. No `Schedule` → `scheduleConfigured:false, days:[]` (200).
5. Mount in `src/app.js`: `app.use('/api/internal/disponibilidade', disponibilidadeInternalRoutes)` alongside the other `/api/internal/*` mounts (not in `apiResources`, not under `/api/v1`).

## Phase 3 — One-off migration (backend)
6. Create `src/migrations/seedScheduleFromAgentRules.js`: embed a JS snapshot of the current `RULES_PER_TENANT` + `DATE_OVERRIDES_PER_TENANT` (incl. the Laura pilot id), apply the §3 weekday/field mapping, and **upsert** base `Schedule` (per `(tenantId, dayOfWeek)`) + `ScheduleException` (per unique `(tenantId, data)`). Dry-run by default (print each base `Schedule` day as `"would write"` or `"preserved (customizado)"`), `--apply` to write, `--rollback` to undo, `--force` to override the customization guard. The migration **preserves owner-customized base `Schedule` days**: only write a weekday doc if it is still at the `initializeSchedules` default (untouched since F01); if the owner customized it, skip and log `"preserved (customizado)"`. `ScheduleException` seeding is unaffected. Idempotent.
7. Run dry-run, then `--apply` against a dev/seed DB; verify the pilot tenant's seeded schedule reproduces its prior availability.

## Phase 4 — Rewire the ia-service (Python)
8. In `marcai_client.py`, add synchronous `fetch_available_slots(tenant_id, *, date=None, from_=None, to=None, days=7, duration=60)` using `httpx.Client` + `x-service-token`; GET `{settings.marcai_api_url}/api/internal/disponibilidade`; return parsed `data` on success; **raise on HTTP/transport error** (do not swallow — `find_available_slots` is the error boundary, not this function).
9. Rewire `mongo_reader.find_available_slots(...)` to **catch** errors raised by `fetch_available_slots` (two distinct layers: `fetch_available_slots` raises, `find_available_slots` catches and returns `[]`); reshape `data.days[*].slots[]` into the existing `list[{date,time,weekday,iso}]` (chronological, `iso = f"{date}T{time}:00"`) on success; return `[]` on any error or `scheduleConfigured:false`. Remove the `agent_business_rules` import/use. Add the deprecation note to `agent_business_rules.py` (keep the file). Note: this unifies availability on the Node whitelist (`status ∈ ['Agendado','Confirmado']`); the Python blacklist is retired (D12).

## Phase 5 — Tests & gates
10. Backend `tests/disponibilidade-internal.test.js`: parity with legacy `getAvailableSlots`, `X-Service-Token` 401, fechado/horas-extra precedence, empty-but-flagged, tenant isolation, migration dry-run/idempotency (per spec §7.1, §7.3).
11. ia-service `ia-service/tests/test_find_available_slots.py`: reshape from mocked endpoint, `scheduleConfigured:false → []`, error/timeout → `[]`, source-switch (per spec §7.2). Mock HTTP — no real cross-service calls.
12. Gates: `npm run lint` + `npm test` (backend, including the new `Schedule` composite index from step 0) and `ruff check . && ruff format . && pytest` (ia-service) until green; then ready for `/implement-evaluate`. **Run the migration before flipping the AI over** so behavior does not regress. "No regression" means parity with `getAvailableSlots` (Node whitelist), not with the retired Python blacklist — the status-filter change (D12) is an accepted, documented behavior change.
