# F05 — Backend Availability Enforcement (optional) · Contract (GWT)

## C1 — Out-of-hours booking is rejected (no override)
- **GIVEN** a tenant with a base `Schedule` (e.g. an active weekday 09:00–18:00) and an authenticated booking-creating user
- **WHEN** `POST /api/v1/agendamentos` with a `dataHora` outside resolved availability (e.g. 20:30) and no override
- **THEN** it returns **400** with the availability reason (`{ message }`) and **no** `Agendamento` is created.

## C2 — In-hours booking succeeds
- **GIVEN** the same tenant/`Schedule`
- **WHEN** `POST /api/v1/agendamentos` with a `dataHora` whose `HH:mm` is present in `resolveAvailableSlots` for that date/duration
- **THEN** it returns **201**, the booking is created, and `encaixe.forcado` is `false`.

## C3 — `fechado` exception date is rejected (no override)
- **GIVEN** a `ScheduleException` of `tipo: 'fechado'` on a date whose weekday is otherwise active
- **WHEN** `POST /api/v1/agendamentos` for any time on that date without override
- **THEN** it returns **400** and creates no booking (exception precedence from F02/F03 flows through enforcement).

## C4 — Admin override creates the booking and records it
- **GIVEN** an `admin` token and a `dataHora` outside resolved availability
- **WHEN** `POST /api/v1/agendamentos` with `forcarEncaixe: true` (and optional `motivoEncaixe`)
- **THEN** it returns **201**, the booking is created, and `encaixe` is recorded with `forcado: true`, `motivo` = the supplied reason, `autorizadoPor` = the admin's id, and `autorizadoEm` set — none of which are taken from the body.

## C5 — Override by a non-admin is forbidden
- **GIVEN** a `gerente` or `recepcionista` token (roles that may create normal bookings) and an out-of-hours `dataHora`
- **WHEN** `POST /api/v1/agendamentos` with `forcarEncaixe: true`
- **THEN** it returns **403** and creates no booking (override is admin-only; normal create roles are unchanged).

## C6 — Enforcement reflects the single source (parity with F03/F04)
- **GIVEN** a date/duration for which `resolveAvailableSlots` returns a specific set of slots (the same set the AI endpoint and the F04 picker use)
- **WHEN** bookings are attempted at a time **in** that set and at a time **absent** from it (no override)
- **THEN** the in-set time is accepted (201) and the absent time is rejected (400) — enforcement rejects exactly what the picker hides; a `horas-extra` exception window is accepted without override even when the base weekday would reject it.

## C7 — Override does not bypass slot-conflict protection
- **GIVEN** an existing booking occupying an exact `dataHora`
- **WHEN** an `admin` submits `forcarEncaixe: true` for that same exact `dataHora`
- **THEN** it still returns **400** (`{ message }`) — the sequential pre-check catches the conflict before the DB write; the override bypasses expediente, not the slot-conflict guarantee. (The **409** `slot_taken` fires only on the rare concurrent-write race hitting the unique index — not reachable in standard sequential tests; the pre-check is what a normal seed-based test will hit.)

## C8 — Permissive when no Schedule is configured
- **GIVEN** a tenant with no `Schedule` configured
- **WHEN** `POST /api/v1/agendamentos` for any valid future `dataHora` without override
- **THEN** it returns **201** (enforcement is skipped — non-destructive rollout default).

## C9 — Tenant isolation of enforcement
- **GIVEN** Tenant A with a `fechado` exception (or restrictive hours) on a date, and Tenant B with that date open
- **WHEN** each tenant books the same wall-clock time on that date (no override)
- **THEN** Tenant A is rejected (400) and Tenant B is accepted (201) — one tenant's availability never drives another tenant's decision; cross-tenant references never resolve to another tenant's slots.

## C10 — Live AI/internal booking path is enforced too (no override)
- **GIVEN** the `X-Service-Token` internal booking routes used by the Python `ia-service` — `POST /api/internal/leads/:id/agendamento` and `POST /api/internal/clientes/:id/agendamentos`
- **WHEN** one of them is called with a `dataHora` outside resolved availability (e.g. a `fechado` date or out-of-hours)
- **THEN** it is **rejected** (no `Agendamento` created) using the same `resolveAvailableSlots` rule as `createAgendamento`
- **AND** an in-availability time is created (201) — and these routes accept **no** override (`forcarEncaixe` is ignored; the AI never forces an `encaixe`).
- **Note:** the legacy Node `functionDispatcher.schedule_appointment` path (Z-API era, route `/whatsapp/webhook`) is **out of scope** — it is dead code flagged for separate removal, not a path F05 enforces.

## Prerequisites (the evaluator must ensure these exist)
- **F02, F03, F04 implemented:** `ScheduleException` model; the exported shared helper `resolveAvailableSlots({ Schedule, ScheduleException, Agendamento, tenantId, date, duration })` in `scheduleController.js`; the F04 slot picker (for the parity reference).
- `mongodb-memory-server` test environment (no replica set / transactions needed for F05).
- A seeded base `Schedule` (an active weekday with a pause) and, per case, a `ScheduleException`; a seeded `Cliente` in the acting tenant; JWT/auth test helper for roles (`admin`, `gerente`, `recepcionista`).
- External services (push, Evolution/WhatsApp, scheduled notifications, email/OpenAI) mocked per `.claude/rules/testing.md`.
