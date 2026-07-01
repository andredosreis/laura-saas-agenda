# F01 — Reopen Availability UI — Plan

**Spec:** `./spec.md` · **Complexity:** medium · **Phases:** 4

## Prerequisites
- Frontend running locally (`cd laura-saas-frontend && npm run dev` → Vite on 5173, login screen) and backend running (per `CLAUDE.md` → Environment) so `/schedules` responds.
- Confirmed reused, unchanged pieces: `src/models/Schedule.js`, `src/controllers/scheduleController.js` (`getSchedules`, `updateSchedule`, `getAvailableSlots`), `src/routes/scheduleRoutes.js` mounted in `src/app.js` `apiResources`, and `laura-saas-frontend/src/services/scheduleService.ts` (`getSchedules`, `updateSchedule`).
- Confirmed the route already exists: `App.tsx` lazy-imports `Disponibilidade` (line 37) and mounts `/disponibilidade` under `ProtectedLayout` (line 152) — no routing work needed.
- Patterns read: `.claude/rules/react-components.md` (design system, `.tsx`, no `alert()`, luxon, mobile/PWA) and `.claude/rules/react-hooks.md` (`api.js` only, `useAuth`).
- No feature dependencies (F01 is Wave 1).

## Phase 1 — Re-enable the page entry point
1. **Navbar** — In `laura-saas-frontend/src/components/Navbar.jsx`, uncomment the `{ to: "/disponibilidade", text: "Disponibilidade", icon: CalendarClock }` line in `navLinks` (line ~37). Both desktop and mobile menus render from this array, so one edit re-enables both. `CalendarClock` is already imported.
2. **Verify route** — Confirm `/disponibilidade` loads inside `ProtectedLayout` (already wired in `App.tsx`); no change expected.

## Phase 2 — Mobile day-by-day view + empty state
3. **Responsive split** — In `Disponibilidade.tsx`, wrap the existing weekly grid in `hidden sm:block`. Add a new `block sm:hidden` **day-by-day accordion/list**: one row per weekday (label, active badge, hours summary `09:00–18:00 · pausa 12:00–13:00`, "Editar" button) that opens the existing `EditScheduleModal`. Reuse `schedules` state and `handleEditSchedule`/`handleSaveSchedule` unchanged.
4. **Empty state** — When no schedule has `isActive` (or none configured), render a "Define o teu horário" CTA card (design-system glass/indigo) that opens the editor on the first day, instead of the all-grey grid.

## Phase 3 — Authoring conveniences + base/exception clarity
5. **Dynamic hour window** — Replace the hardcoded `timeSlots` loop (`for hour 8..20`) with a window derived from the active schedules (earliest `startTime` → latest `endTime`, rounded to the hour; fallback `08:00–20:00` when none active), keeping 30-min rows.
6. **"Copiar para os dias úteis"** — Add an action (in the modal or day row) that copies the current day's `{ isActive, startTime, endTime, breakStartTime, breakEndTime }` to weekdays Seg–Sex via parallel `updateSchedule` calls (`Promise.all`, never `await` in a loop), then one `fetchSchedules()` and a success toast.
7. **Base vs exception labelling** — Add a clear **"Horário base"** heading over the recurring schedule and a distinct, labelled **"Excepções desta data"** placeholder section (states the per-date layer arrives next / disabled), so editing a weekday no longer reads as a single-date edit.
8. **Shell consistency** — Confirm the page sits correctly inside `ProtectedLayout` (review the self-mounted full-screen background / `max-w-[1600px]`); adjust only if it clashes with the app shell (ADR-028 UI note 7).

## Phase 4 — E2E + gates
9. **Playwright E2E** — Add `laura-saas-frontend/tests/e2e/disponibilidade.spec.ts` (repo's Playwright/`playwright-cli` setup): viewport 375×812 → auth → `/disponibilidade` → open a weekday in the day-by-day view → change start/end → save → assert success toast → reload → assert persistence. Plus: navbar link reachable; empty-state CTA shown; grid↔day-by-day swap at the breakpoint.
10. **Gates** — Run `npm run build` (TS check + Vite) and `npm run lint` in `laura-saas-frontend` until green; run the Playwright flow; then ready for `/implement-evaluate`.
