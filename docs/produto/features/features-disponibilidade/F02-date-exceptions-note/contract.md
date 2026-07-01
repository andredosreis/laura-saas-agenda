# F02 — Date Exceptions & Note on Schedule · Contract (GWT)

## C1 — Create a `fechado` exception with a note
- **GIVEN** an authenticated `admin`/`gerente` and a valid body (`data`, `tipo: 'fechado'`, `observacao`)
- **WHEN** `POST /api/v1/schedules/excecoes`
- **THEN** it returns 201, persists one `ScheduleException` with `inicio`/`fim` = `null` and the `observacao`
- **AND** the exception appears in `GET /api/v1/schedules/excecoes` with its note round-tripped.

## C2 — Create a `horas-extra` / `horario-especial` exception
- **GIVEN** a body with `tipo: 'horas-extra'` (or `'horario-especial'`), `inicio`, `fim` (`inicio < fim`) and an optional note
- **WHEN** `POST /api/v1/schedules/excecoes`
- **THEN** it returns 201 and stores the window and note.

## C3 — Exception precedence: `fechado` date yields no slots
- **GIVEN** a weekday that is active in the base `Schedule` AND a `fechado` exception for a specific date on that weekday
- **WHEN** `GET /api/v1/schedules/available-slots?date=<that date>`
- **THEN** it returns `{ availableSlots: [] }` (the exception overrides the active base weekday).

## C4 — Exception precedence: extra/special date yields the exception window
- **GIVEN** a `horas-extra`/`horario-especial` exception (`inicio`..`fim`) for a date
- **WHEN** `GET /api/v1/schedules/available-slots?date=<that date>`
- **THEN** the returned slots fall within `inicio`..`fim` (the exception window, not the base hours), with the weekday break still applied when present.

## C5 — Validation (400)
- **GIVEN** a `horas-extra`/`horario-especial` body with `inicio >= fim`, OR `observacao` > 280 chars, OR an invalid `data` format, OR an out-of-enum `tipo`
- **WHEN** `POST` (or `PUT`) `/api/v1/schedules/excecoes`
- **THEN** it returns 400 with the offending field and creates/changes nothing.

## C6 — One exception per date (409)
- **GIVEN** an existing exception for a date
- **WHEN** a second `POST /api/v1/schedules/excecoes` is sent for the same `data`
- **THEN** it returns 409 and no second entry is created.

## C7 — Base weekday note
- **GIVEN** an `admin`/`gerente` and an optional `observacao` (≤280)
- **WHEN** `PUT /api/v1/schedules/:dayOfWeek`
- **THEN** the base weekday document persists the `observacao` (and rejects > 280 with 400).

## C8 — Update and delete an exception
- **GIVEN** an existing exception in the caller's tenant
- **WHEN** `PUT /api/v1/schedules/excecoes/:id` (valid changes) then `DELETE /api/v1/schedules/excecoes/:id`
- **THEN** the update returns 200 with the new values and the delete returns 200; afterwards the exception no longer appears in the list.

## C9 — Tenant isolation
- **GIVEN** a Tenant B token
- **WHEN** listing exceptions, or updating/deleting a Tenant A exception, or calling `available-slots`
- **THEN** Tenant A's exceptions are never returned, the write returns 404 (never 403, never mutated), and B's slot calculation is unaffected by A's exceptions.

## C10 — Write role gate (asymmetry with reads)
- **GIVEN** a `recepcionista` token
- **WHEN** `POST/PUT/DELETE /api/v1/schedules/excecoes*`
- **THEN** it returns 403
- **AND GIVEN** the same token, `GET /api/v1/schedules/excecoes` returns 200 (reads are open to any authenticated staff; `admin`/`gerente`/`superadmin` may write).

## C11 — Existing endpoints keep their legacy shape
- **GIVEN** the F01 page / cached PWA
- **WHEN** calling `GET /api/v1/schedules`, `GET /api/v1/schedules/available-slots`, `PUT /api/v1/schedules/:dayOfWeek`
- **THEN** their response shapes are unchanged (`{ disponibilidade, agendamentos }`, `{ availableSlots }`, raw `Schedule` document) — only `available-slots` slot *content* changes to honor exceptions, and `updateSchedule` additionally accepts `observacao`.

## C12 — UI: create a closed-day exception with a note (Playwright CLI, incl. mobile)
- **GIVEN** an owner/admin on the Disponibilidade page
- **WHEN** they pick a date, choose "Fechar este dia", write a note, and save — on desktop and at a 375px viewport
- **THEN** the exception appears in the "Excepções desta data" area (separate from "Horário base") with its note, and the editor/note are operable on the mobile viewport.

## Prerequisites (the evaluator must ensure these exist)
- **F01 implemented**: Disponibilidade page reachable and loading; `/schedules` API reused unchanged.
- `mongodb-memory-server` test environment (no replica set / transactions needed for F02).
- JWT/auth test helper for roles (`admin`, `gerente`, `recepcionista`) and two tenants (A, B), each with an initialized base `Schedule` (the controller's `initializeSchedules` seeds the 7 weekdays on first `getSchedules`).
- External services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
- For E2E: frontend (5173) + backend (5001) running; a seeded owner/admin login; `playwright-cli` skill available.
