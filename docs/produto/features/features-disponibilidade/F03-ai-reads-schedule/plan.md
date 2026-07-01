# F03 — AI Reads Availability from Schedule — Plan

**Spec:** `./spec.md` · **Complexity:** complex · **Phases:** 5

## Prerequisites
- **F02 complete:** `ScheduleException` model + registry entry exist and `getAvailableSlots` already honors exceptions (`fechado` → no slots; `horas-extra`/`horario-especial` → exception window). **F01 complete:** `Schedule` subsystem reopened.
- Backend + ia-service running locally per `CLAUDE.md` → Environment; `INTERNAL_SERVICE_TOKEN` set in both, `MARCAI_API_URL` pointing the ia-service at the backend.
- Patterns confirmed: `src/modules/clientes/clienteInternalRoutes.js` (`resolveTenantContext`), `src/middlewares/requireServiceToken.js`, `src/controllers/scheduleController.js` (F02-extended math), `ia-service/.../marcai_client.py` (httpx + `_auth_headers`), `ia-service/.../mongo_reader.py` (`find_available_slots`), `src/migrations/createLauraTenant.js`.

## Phase 1 — Extract the shared slot helper (backend, no behavior change)
1. In `src/controllers/scheduleController.js`, extract the per-day slot computation (the F02-extended logic: weekday `Schedule` + `ScheduleException` precedence + bookings + break) into an exported pure helper `resolveAvailableSlots({ Schedule, ScheduleException, Agendamento, tenantId, date, duration })` returning `{ slots, isException, exceptionType, scheduleConfigured }`.
2. Refactor the existing `getAvailableSlots` handler to call the helper (response shape `{ availableSlots }` **unchanged** — F01/PWA contract preserved). Run the existing schedule tests to confirm no regression.

## Phase 2 — Internal endpoint (backend)
3. Create `src/routes/disponibilidadeInternalRoutes.js`: `router.use(requireServiceToken)`; `GET /` → handler.
4. Add the handler (`getDisponibilidadeInterna`, in `scheduleController.js` or a small `disponibilidadeInternalController.js`): resolve tenant context from the `tenantId` query (mirror `resolveTenantContext` — 400/404/403), parse `date` | `from`/`to` | `days` (default 7, max 30) + `duration` (default 60), loop the resolved days calling `resolveAvailableSlots`, and return the canonical `{ success, data: { tenantId, timezone, duration, scheduleConfigured, days[] } }`. No `Schedule` → `scheduleConfigured:false, days:[]` (200).
5. Mount in `src/app.js`: `app.use('/api/internal/disponibilidade', disponibilidadeInternalRoutes)` alongside the other `/api/internal/*` mounts (not in `apiResources`, not under `/api/v1`).

## Phase 3 — One-off migration (backend)
6. Create `src/migrations/seedScheduleFromAgentRules.js`: embed a JS snapshot of the current `RULES_PER_TENANT` + `DATE_OVERRIDES_PER_TENANT` (incl. the Laura pilot id), apply the §3 weekday/field mapping, and **upsert** base `Schedule` (per `(tenantId, dayOfWeek)`) + `ScheduleException` (per unique `(tenantId, data)`). Dry-run by default (print intended writes), `--apply` to write, `--rollback` to undo. Idempotent.
7. Run dry-run, then `--apply` against a dev/seed DB; verify the pilot tenant's seeded schedule reproduces its prior availability.

## Phase 4 — Rewire the ia-service (Python)
8. In `marcai_client.py`, add synchronous `fetch_available_slots(tenant_id, *, date=None, from_=None, to=None, days=7, duration=60)` using `httpx.Client` + `x-service-token`; GET `{settings.marcai_api_url}/api/internal/disponibilidade`; return parsed `data` (raise/sentinel on HTTP error for the caller to handle).
9. Rewire `mongo_reader.find_available_slots(...)` to call `fetch_available_slots`, reshape `data.days[*].slots[]` into the existing `list[{date,time,weekday,iso}]` (chronological, `iso = f"{date}T{time}:00"`), and return `[]` on any error or `scheduleConfigured:false`. Remove the `agent_business_rules` import/use. Add the deprecation note to `agent_business_rules.py` (keep the file).

## Phase 5 — Tests & gates
10. Backend `tests/disponibilidade-internal.test.js`: parity with legacy `getAvailableSlots`, `X-Service-Token` 401, fechado/horas-extra precedence, empty-but-flagged, tenant isolation, migration dry-run/idempotency (per spec §7.1, §7.3).
11. ia-service `ia-service/tests/test_find_available_slots.py`: reshape from mocked endpoint, `scheduleConfigured:false → []`, error/timeout → `[]`, source-switch (per spec §7.2). Mock HTTP — no real cross-service calls.
12. Gates: `npm run lint` + `npm test` (backend) and `ruff check . && ruff format . && pytest` (ia-service) until green; then ready for `/implement-evaluate`. **Run the migration before flipping the AI over** so behavior does not regress.
