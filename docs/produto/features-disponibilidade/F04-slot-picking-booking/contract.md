# F04 — Slot Picking in Manual Booking · Contract (GWT)

## C1 — Book by picking a slot (revived `dataSelecionada` path)
- **GIVEN** an authenticated user on "Novo Agendamento" (`CriarAgendamento`) with a client + service chosen
- **WHEN** they pick a **date** with availability and tap an **available slot** chip, then submit
- **THEN** the booking is created at that time (the picked slot becomes a valid `dataHora`), and the previously dead slot-picking path is functional (no free `datetime-local` required for the normal flow).

## C2 — Slots come from `getAvailableSlots` for the date + duration
- **GIVEN** a selected date
- **WHEN** the `SlotPicker` loads
- **THEN** the available chips correspond to `GET /schedules/available-slots?date=&duration=` for that date (raw `{ availableSlots }`), read via `scheduleService` (no `fetch`, no `{ success, data }` assumption).

## C3 — F02 exceptions are reflected transitively
- **GIVEN** a **`fechado`** exception (F02) on the selected date
- **WHEN** the picker loads
- **THEN** it shows **no** available slots and an empty state ("Sem horários disponíveis para esta data")
- **AND GIVEN** a **`horas-extra`/`horario-especial`** exception, the available slots fall only within the exception window (not the base hours).

## C4 — Visual distinction of slot states
- **GIVEN** a date whose working window contains occupied, pause, and out-of-hours times (in addition to free ones)
- **WHEN** the picker renders
- **THEN** **available** slots are visually primary and selectable, while **occupied**, **pause**, and **out-of-hours** times are visually distinguished (distinct color/label) and not selectable by default.

## C5 — Force a fit (admin, no hard block)
- **GIVEN** an **`admin`** user
- **WHEN** they enable "Forçar encaixe"
- **THEN** free time entry is re-enabled and a booking outside the available set can be submitted (F04 imposes no hard block — enforcement is F05)
- **AND GIVEN** a non-admin (`recepcionista`/`terapeuta`), the force affordance is **not** shown.

## C6 — Mobile-responsive (375px)
- **GIVEN** a 375px-wide viewport
- **WHEN** the user opens the booking surface and picks a slot
- **THEN** the slot chips are tappable (≥44px targets), there is no horizontal scroll, and a booking can be completed on mobile — verified via a **Playwright CLI** flow.

## C7 — Empty / error states degrade gracefully
- **GIVEN** a closed/inactive/`fechado` date (`availableSlots: []`)
- **WHEN** the picker loads
- **THEN** it shows the empty state (not an error)
- **AND GIVEN** a backend/network error on `available-slots`, the picker shows an inline error + the existing toast and the form stays usable (no crash).

## C8 — Quick modal parity + unchanged write contract
- **GIVEN** the quick modal opened from a calendar day (`QuickAppointmentModal`, seeded `selectedDate`)
- **WHEN** the user picks a slot and submits
- **THEN** `onSubmit` receives the same payload shape as before with `dataHora` in `"yyyy-MM-dd'T'HH:mm"` format (the `CalendarView` → modal contract is unchanged), and the booking is created.

## C9 — No backend changes; legacy endpoint shapes preserved
- **GIVEN** F04 is a frontend-only feature
- **WHEN** it reads `GET /schedules/available-slots` and `GET /schedules`
- **THEN** those endpoints are consumed in their existing raw shapes (`{ availableSlots }`, `{ disponibilidade, agendamentos }`) and `POST /agendamentos` is called unchanged (no availability enforcement added — that is F05).

## C10 — Build & type-check
- **GIVEN** the new `SlotPicker.tsx` and the edited surfaces
- **WHEN** `cd laura-saas-frontend && npm run build && npm run lint` runs
- **THEN** TypeScript type-checks and ESLint pass (green).

## Prerequisites (the evaluator must ensure these exist)
- **F02 implemented**: `getAvailableSlots` honors per-date exceptions (`fechado` → `[]`; `horas-extra`/`horario-especial` → exception window) over base schedule + bookings + pause.
- Frontend (5173) + backend (5001) running; a seeded owner/admin login and a non-admin login (for C5); at least one client + an active package/avulso path to complete a booking.
- A tenant with a configured base `Schedule` (active weekday with hours + pause) and at least one existing booking on a test date (to exercise the "occupied" state in C4); optionally an F02 `fechado` exception on a date (for C3/C7).
- `playwright-cli` skill available for the E2E flow (incl. 375px viewport).
- External services (email/OpenAI/Evolution) not exercised by this UI flow; standard dev env per `CLAUDE.md`.
