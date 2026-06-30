# F01 — Reopen Availability UI · Contract (GWT)

## C1 — Navbar link is active and the page loads
- **GIVEN** an authenticated owner/admin
- **WHEN** they open the navbar (desktop or mobile menu)
- **THEN** a "Disponibilidade" item is present
- **AND** clicking it routes to `/disponibilidade`, which loads inside `ProtectedLayout` without error.

## C2 — Manual creation/editing of base weekly hours persists (headline)
- **GIVEN** the Disponibilidade page open on a weekday
- **WHEN** the user sets the day active, edits `startTime`/`endTime` and pause, and saves
- **THEN** `PUT /schedules/:dayOfWeek` is called with only `{ isActive, startTime, endTime, breakStartTime, breakEndTime }`
- **AND** a success toast appears
- **AND** after a page reload the new hours are still shown (persisted in the tenant's `Schedule`).

## C3 — Mobile day-by-day view is operable at 375px
- **GIVEN** a 375px-wide viewport
- **WHEN** the page renders
- **THEN** the 8×24 weekly grid is hidden and a day-by-day view (accordion/list) is shown with usable touch targets
- **AND** a weekday can be opened, edited and saved from that view.
- *(This is the Playwright CLI acceptance flow: open page → edit a day → save → reload → persisted, all at a 375px viewport.)*

## C4 — Desktop keeps the weekly grid
- **GIVEN** a viewport ≥641px
- **WHEN** the page renders
- **THEN** the existing weekly grid is shown and the mobile day-by-day list is hidden.

## C5 — Empty-state CTA
- **GIVEN** a tenant with no active/configured days
- **WHEN** the page loads
- **THEN** a "Define o teu horário" CTA is shown (not a blank grey grid)
- **AND** activating it opens the editor.

## C6 — "Copiar para os dias úteis"
- **GIVEN** a day whose hours were just set
- **WHEN** the user triggers "copiar para os dias úteis"
- **THEN** weekdays Seg–Sex receive those hours via parallel `updateSchedule` calls (no `await` in a loop)
- **AND** the view refetches and a success toast confirms; a partial failure surfaces an error (no silent success).

## C7 — Dynamic hour window
- **GIVEN** an active schedule with hours outside `08:00–19:30` (e.g. starts 07:00 or ends 21:00)
- **WHEN** the grid renders
- **THEN** the visible time window covers the configured range (earliest start → latest end), not the previously hardcoded `08:00–19:30`
- **AND** with no active day a sensible fallback window is shown.

## C8 — Base vs exception clarity
- **GIVEN** the page is open
- **WHEN** the user views it
- **THEN** the recurring schedule is labelled **"Horário base"**
- **AND** a distinct, labelled **"Excepções desta data"** section is present (placeholder in F01; functional in F02), so editing a weekday does not read as editing a single calendar date.

## C9 — No enforcement / no model change
- **GIVEN** F01 is shipped
- **WHEN** hours are saved
- **THEN** only `Schedule` data is written — no booking is validated/rejected, no AI behaviour changes, and the `Schedule` model schema is unchanged (the date-exception layer belongs to F02).

## C10 — All API access via the service layer
- **GIVEN** the page interacts with the backend
- **WHEN** it loads or saves
- **THEN** it goes through `scheduleService.ts` → `api.js` (Bearer token, refresh, tenant scoping) — never `fetch` directly, never `localStorage` read outside `AuthContext`.

## Prerequisites (the evaluator must ensure these exist)
- Backend running and `/schedules` reachable (dual-mounted `/api` + `/api/v1`); a tenant whose 7 weekday `Schedule` rows are auto-initialized on first `GET /schedules` (`initializeSchedules`).
- Frontend dev server (Vite) running; an authenticated owner/admin session (or seeded Playwright auth state).
- Playwright/`playwright-cli` available for the 375px edit-and-persist E2E flow.
- No model/migration prerequisites (F01 changes no backend code); external services not involved.
