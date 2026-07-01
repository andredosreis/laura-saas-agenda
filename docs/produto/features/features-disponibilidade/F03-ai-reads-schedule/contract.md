# F03 — AI Reads Availability from Schedule · Contract (GWT)

## C1 — Endpoint returns the same slots as `getAvailableSlots`
- **GIVEN** a tenant with a base `Schedule` and existing bookings for a date
- **WHEN** `GET /api/internal/disponibilidade?tenantId=<t>&date=<d>&duration=60` with a valid `X-Service-Token`
- **THEN** it returns `200` with `data.days[0].slots` **equal** to what `GET /schedules/available-slots?date=<d>&duration=60` returns for that tenant/date (both use the shared `resolveAvailableSlots`).

## C2 — Service-token guard
- **GIVEN** a request with a missing or wrong `X-Service-Token`
- **WHEN** `GET /api/internal/disponibilidade`
- **THEN** it returns `401` `{ success:false, error:'Não autenticado' }` and no data (fail-closed, also when `INTERNAL_SERVICE_TOKEN` is unset). There is no JWT path.

## C3 — Exceptions flow through (F02 precedence)
- **GIVEN** a `fechado` `ScheduleException` for a date whose weekday is active
- **WHEN** the endpoint is queried for that date
- **THEN** that day returns `slots: []` (and `isException:true`, `exceptionType:'fechado'`)
- **AND GIVEN** a `horas-extra`/`horario-especial` exception, that day returns slots **within the exception window**, not the base hours.

## C4 — Empty-but-flagged (no Schedule)
- **GIVEN** a tenant with no `Schedule` configured
- **WHEN** the endpoint is queried
- **THEN** it returns `200` with `data.scheduleConfigured:false` and `data.days:[]` — never a 4xx/5xx for "no schedule".

## C5 — Tenant isolation
- **GIVEN** Tenant A and Tenant B each with their own schedules, exceptions and bookings
- **WHEN** the endpoint is queried once per `tenantId`
- **THEN** each response reflects only that tenant's data; A's `fechado` exception does not close B's same date, and A's bookings never occupy B's slots.

## C6 — AI reads from the endpoint, not `agent_business_rules.py`
- **GIVEN** the rewired ia-service with the endpoint mocked to return two days of slots
- **WHEN** `mongo_reader.find_available_slots(tenant_id)` is called
- **THEN** it returns the reshaped `list[{date,time,weekday,iso}]` sourced from the endpoint (chronological), and it does **not** import/use `agent_business_rules` (`RULES_PER_TENANT`/`DATE_OVERRIDES_PER_TENANT`) as the source.

## C7 — Graceful degradation (AI never invents slots)
- **GIVEN** the endpoint returns an error/timeout, or `scheduleConfigured:false`
- **WHEN** `find_available_slots(tenant_id)` is called
- **THEN** it returns `[]` (logs a warning, raises nothing), and the agent's `get_available_slots` tool yields its empty-slots fallback ("recepcionista entra em contacto") — no fabricated times.

## C8 — One-off migration seeds Schedule from the hardcoded rules
- **GIVEN** the hardcoded Python rules snapshot (incl. the pilot tenant)
- **WHEN** `node src/migrations/seedScheduleFromAgentRules.js` runs in dry-run, then with `--apply`
- **THEN** dry-run writes nothing; `--apply` seeds base `Schedule` (correct Python→Mongo weekday/field mapping) + `ScheduleException` (`None→fechado`, window→`horario-especial`); re-running `--apply` is a no-op (idempotent)
- **AND** after seeding, the endpoint reproduces the pilot tenant's pre-migration availability for an unchanged schedule (no regression).

## C9 — Param resolution
- **GIVEN** the endpoint
- **WHEN** queried with `date` (single day), with `from`/`to` (range), or with neither (defaults to today..today+`days`, `days` default 7, max 30)
- **THEN** `data.days` contains exactly the expected dates; invalid date formats → `400`; missing/invalid `tenantId` → `400`, unknown tenant → `404`, inactive plan → `403`.

## Prerequisites (the evaluator must ensure these exist)
- **F02 implemented:** `ScheduleException` model + registry; `getAvailableSlots` honoring exceptions. **F01 implemented:** reopened `Schedule` subsystem.
- `INTERNAL_SERVICE_TOKEN` set for the backend test env (sent as `X-Service-Token`); `mongodb-memory-server` test environment (no replica set needed).
- ia-service tests use `pytest_httpx`/`respx` to mock the endpoint — **no real cross-service calls**; `settings.marcai_api_url` / `internal_service_token` resolvable in the test settings.
- Seed helpers for a `Schedule` (+ a `ScheduleException`) and a booking in the acting tenant; a second tenant for isolation.
- External services (OpenAI/Gemini/Evolution/SMTP) mocked per `.claude/rules/testing.md`.
