# F04 — Slot Picking in Manual Booking — Spec

**PRD:** `docs/produto/PRD-disponibilidade-unificada.md` (F04)
**ADR:** `docs/adrs/generated/ADR-028-disponibilidade-fonte-unica-painel-ia.md` (Fase 3 — Slots na marcação manual)
**Complexity:** medium
**Module:** `laura-saas-frontend/src/` — **frontend only** (React/Vite PWA). Touches the manual-booking surfaces `pages/CriarAgendamento.jsx` + `components/QuickAppointmentModal.jsx` and `services/scheduleService.ts`. **No backend changes.**

---

## 1. Scope

> **🔗 Dependency:** F04 depends on **F02** (Date Exceptions & Note on Schedule). F02 extends the backend `getAvailableSlots` so a `fechado` date returns no slots and a `horas-extra`/`horario-especial` date returns the exception window (precedence over the base weekday + existing bookings + pause). F04 is the UI that **consumes** that endpoint — it does not re-implement slot math (out of scope per PRD §7). Enforcement of availability on booking creation is **F05**, not here.

**Included:**
- Wire the two manual-booking surfaces to availability:
  - `pages/CriarAgendamento.jsx` (the "Novo Agendamento" page, both *Sessão* and *Avaliação* forms) — **revive the dead `dataSelecionada` slot-picking path** (currently `const [dataSelecionada] = useState('')` never set, `setHorariosVagos` result discarded; the `getAvailableSlots` effect is dead code).
  - `components/QuickAppointmentModal.jsx` (the quick-booking modal opened from `pages/CalendarView.jsx` on a day click).
- Replace the free `datetime-local` time entry with a **date picker + slot picker**: the user picks a date, then picks an available start time from the slots returned by `getAvailableSlots(date, duration)` for that date and service duration.
- A new reusable **`SlotPicker`** component (`.tsx`, design-system styled) shared by both surfaces.
- **Visual distinction** of slot states: available (selectable), occupied, pause, and out-of-hours are visually distinguished (color + label + disabled affordance). See `[Auto-Accept] D3` for how non-available states are derived without a backend change.
- **Force a fit (encaixe):** an authorized user (`admin`) may still book a time the picker marks unavailable — there is **no hard block** in F04 (enforcement is F05). Exposed via an explicit "Forçar encaixe" affordance that re-enables free time entry. See `[Auto-Accept] D4`.
- **Mobile-responsive** slot picker, usable on a 375px viewport (tappable chips, ≥44px touch targets), PWA-friendly.

**Consumes (from earlier features):**
- **Schedule availability** — available slots for a date, via the existing `GET /schedules/available-slots?date=&duration=` (raw `{ availableSlots: ["HH:mm", …] }` shape; honors F02 exceptions + bookings + pause).
- Day context for visual distinction — the existing `GET /schedules` (raw `{ disponibilidade, agendamentos }`) for the day's base window + bookings (`[Auto-Accept] D3`).

**Deferred (other features):** backend enforcement + override recording (**F05**); the AI reading availability (**F03**); any change to slot-calculation math (out of scope, PRD §7); per-service duration modelling (no duration field exists on bookings today — `[Auto-Accept] D5`).

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `laura-saas-frontend/src/components/SlotPicker.tsx` | new | Reusable, design-system slot picker. Props: `date`, `duration?`, `value` (selected `"HH:mm"` or `null`), `onChange(time)`, `allowForce?`, `onForceToggle?`. Calls `getAvailableSlots`; renders a responsive grid of slot chips with states (livre / ocupado / pausa / fora); handles loading/empty/error; mobile-first |
| `laura-saas-frontend/src/services/scheduleService.ts` | edit | Keep `getAvailableSlots` returning `string[]` from the raw `{ availableSlots }` shape (`[Auto-Accept] D2`). Add a thin `getDiaDisponibilidade(date, duration)` helper that returns `{ slots, janela, ocupados }` by combining `getAvailableSlots` + the day's base window/bookings from `getSchedules` for state classification (`[Auto-Accept] D3`) |
| `laura-saas-frontend/src/pages/CriarAgendamento.jsx` | edit | Replace the `datetime-local` `dataHora` input (Sessão + Avaliação forms) with a **date input + `SlotPicker`**; revive `dataSelecionada` (now a real `useState` set by the date input) and feed the picked slot into the existing `dataHora` form value; keep the Zod `dataHora` validation (future-date) intact |
| `laura-saas-frontend/src/components/QuickAppointmentModal.jsx` | edit | Replace the `datetime-local` `dataHora` field with a **date row + `SlotPicker`** seeded from `selectedDate`; keep the existing `onSubmit(submitData)` contract (still emits `dataHora` as `"yyyy-MM-dd'T'HH:mm"`) |
| `laura-saas-frontend/src/pages/CalendarView.jsx` | (reference) | No change required — already passes `selectedDate` + `onSubmit` to the modal; verify the modal still emits a valid `dataHora` |

Pattern references: `components/QuickAppointmentModal.jsx` (modal/design-system idiom, `useTheme`, luxon `DateTime`), `pages/CriarAgendamento.jsx` (react-hook-form + Zod + `Controller`), `services/scheduleService.ts` (`getAvailableSlots`, `getSchedules`), `services/api.js` (axios instance, `VITE_API_URL`), `.claude/rules/react-components.md` (indigo/purple/slate, `.tsx` for new components, no `alert()`, loading/error states), `.claude/rules/react-hooks.md` (`useAuth`, all HTTP via `api.js`).

> **⚠️ Contract note (legacy endpoint):** `GET /schedules/available-slots` does **not** use the project `{ success, data/error }` envelope — it returns a raw `{ availableSlots: [...] }` (and `{ message }` on error). `getAvailableSlots` already reads `response.data.availableSlots`; F04 keeps that and never assumes a `success`/`data` wrapper. See `[Auto-Accept] D2`.

---

## 3. Data Model

**N/A.** F04 is a frontend-only feature. It introduces no Mongoose schema, collection, index, or migration. It consumes existing read endpoints only and writes bookings through the unchanged `POST /agendamentos` (the `dataHora` payload format is preserved).

---

## 4. Consumed Contracts (no new endpoints)

F04 adds **no** API routes. It reads two existing, unchanged endpoints (both tenant-scoped, behind `authenticate`):

### GET /schedules/available-slots?date=&duration=  — authoritative bookable set
- `date` = `"YYYY-MM-DD"`, `duration` = minutes (default 60, `[Auto-Accept] D5`).
- Returns the raw shape `{ "availableSlots": ["09:00", "09:30", …] }` — already honors F02 exceptions, existing bookings, and pause.
- A `fechado` date / inactive weekday → `{ "availableSlots": [] }` (empty grid → "sem horários disponíveis" state).
- Error → raw `{ "message": "…" }`; surfaced as a toast (the service already does this) and an inline error state.

### GET /schedules  — day context for visual state classification (`[Auto-Accept] D3`)
- Returns raw `{ disponibilidade: Schedule[], agendamentos: Agendamento[] }` (next 7 days of bookings + the 7 weekday base docs).
- Used to label *why* a non-available slot is non-available (occupied vs pause vs out-of-hours) for the chosen date when it falls within the returned window. Best-effort: when the date is outside the returned range, F04 falls back to showing only the available slots from `getAvailableSlots` (no synthetic "occupied" chips).

### POST /agendamentos  — unchanged write
- F04 changes only **how** `dataHora` is chosen in the UI; the submitted payload (and the `dataHora` `"yyyy-MM-dd'T'HH:mm"` format) is unchanged. No availability enforcement is added on submit (that is F05).

---

## 5. Requirements / Business Rules

- **R1.** On each booking surface, the user first selects a **date**, then selects a **start time** from the slots `getAvailableSlots(date, duration)` returns for that date; the chosen slot becomes the booking's `dataHora`. The previously dead `dataSelecionada` path is made functional.
- **R2.** The slot grid reflects the **F02 exceptions** transitively (via `getAvailableSlots`): a `fechado` date offers **no** slots; a `horas-extra`/`horario-especial` date offers slots only within the **exception window**; otherwise the base weekday window applies, minus pause and existing bookings.
- **R3.** **Available** slots are selectable and visually primary (indigo accent). **Occupied**, **pause**, and **out-of-hours** times are visually distinguished (distinct color/label) and not selectable by default. See `[Auto-Accept] D3` for derivation.
- **R4.** An **`admin`** may **force a fit**: an explicit "Forçar encaixe" toggle re-enables free time entry (or makes any time selectable), allowing a booking outside the available set. F04 imposes **no hard block** — submission proceeds; backend enforcement is F05. Non-admin users do not see the force affordance (`[Auto-Accept] D4`).
- **R5.** Empty/closed days show a clear empty state ("Sem horários disponíveis para esta data") rather than an error; a backend error shows an inline error + toast (reusing the service's existing toast) and does not crash the form.
- **R6.** The slot picker is **mobile-responsive**: a wrapping grid of tappable chips with ≥44px touch targets, operable on a 375px viewport; no horizontal scroll.
- **R7.** All availability reads go through `services/scheduleService.ts` → `api.js` (never `fetch`; never read `localStorage` directly — `.claude/rules/react-hooks.md`). The `admin` check uses `useAuth()` (`isAdmin`), the single source of truth.
- **R8.** The new `SlotPicker` follows the design system (indigo/purple/slate; `.tsx`); it must read clearly on both the light card of `CriarAgendamento` and the dark/glass modal of `QuickAppointmentModal` (`[Auto-Accept] D6`). No `alert()`; loading via spinner; errors inline.
- **R9.** Selecting a slot in the past must still fail the existing future-date validation (Zod `dataHora` refine in `CriarAgendamento`); the picker should avoid offering past times for *today* where feasible (`[Auto-Accept] D7`).

**UX flow:** Staff opens "Novo Agendamento" (or the quick modal from a calendar day) → picks the client/service → picks a **date** → the picker loads slots for that date + duration → available times appear as tappable chips, occupied/pause/out-of-hours visually dimmed → staff taps an available slot → confirms. An admin who needs an out-of-hours fit toggles "Forçar encaixe" and enters the time manually. Works on phone (375px).

---

## 6. Error Handling

| Scenario | Behaviour |
|---|---|
| `getAvailableSlots` returns `[]` (closed/`fechado`/inactive day) | Empty state: "Sem horários disponíveis para esta data" (not an error); chips area shows the CTA to pick another date (or, for admin, the "Forçar encaixe" affordance) |
| `getAvailableSlots` request error (`{ message }` / network) | Inline error under the picker + the existing service toast ("Não foi possível buscar os horários disponíveis."); the form stays usable; submit blocked until a valid slot/date is chosen |
| No date selected yet | Picker shows a hint ("Escolha uma data para ver os horários"); no request fired |
| Picked time in the past | Existing Zod `dataHora` future-date validation rejects on submit (inline field error) |
| Submit error from `POST /agendamentos` | Existing handling preserved (toast with `error`/`message`); F04 adds no enforcement of its own |

> The consumed schedule endpoints keep their legacy `{ availableSlots }` / `{ message }` shapes (F02 `[Auto-Accept] D6`); F04 does not assume the `{ success, data/error }` envelope for them.

---

## 7. Testing Strategy

### 7.1 E2E — Playwright CLI (PRD §9 F04) — primary acceptance
A Playwright CLI flow (reference skill: `playwright-cli`):
1. Log in (owner/admin), open "Novo Agendamento" (`/criar-agendamento`) or the quick modal from the calendar.
2. Select a client + service (existing flow).
3. Pick a **date** that has availability → the `SlotPicker` loads and shows available slot chips.
4. **Pick an available slot** → confirm the booking is created at that time (redirect/toast success), i.e. the revived `dataSelecionada` path produces a valid `dataHora`.
5. Assert **occupied/out-of-hours/pause** chips are visually distinguished from available ones (distinct class/state).
6. Re-run the booking step at a **375px mobile viewport** (chips tappable, no horizontal scroll).

Optionally: pick a `fechado` date (seeded via F02) → assert the empty "sem horários" state and no slot chips.

### 7.2 Build & lint gates
- `cd laura-saas-frontend && npm run build` (TypeScript check + Vite build) — the new `.tsx` `SlotPicker` must type-check.
- `cd laura-saas-frontend && npm run lint` (ESLint) green.

### 7.3 Manual / cross-feature verification
- With an F02 `fechado` exception on a date: the picker shows no slots for that date (transitive via `getAvailableSlots`).
- With a `horas-extra` exception: the picker offers only the exception window.
- Force-fit visible only to `admin` (toggle hidden for `recepcionista`/`terapeuta`).

**Cross-feature note (verified in later features):** F05 will enforce availability on `POST /agendamentos` with an admin override; the out-of-hours times F04 hides/dims are the same ones F05 rejects without override. Not enforced in F04.

> **Note on test runner:** the frontend has no Jest/Vitest suite wired for components in this repo; F04's acceptance is the Playwright CLI flow + `build`/`lint` gates, mirroring F02's E2E approach. If a component unit harness is later added, `SlotPicker`'s state-classification (livre/ocupado/pausa/fora) is the natural unit under test.

---

## Assumptions / Decisions

- **[Auto-Accept] D1 — Slot grid of tappable chips, not a dropdown.** A wrapping grid of buttons (chips) is chosen over a `<select>`: it shows many times at a glance, makes the four states (livre/ocupado/pausa/fora) visually distinguishable (R3, a hard PRD requirement a dropdown cannot satisfy well), and gives large touch targets for the 375px PWA case (R6). Mirrors common booking UIs.
- **[Auto-Accept] D2 — Keep the raw `{ availableSlots }` contract.** `getAvailableSlots` already reads `response.data.availableSlots` and returns `string[]`; F04 keeps this and never assumes a `{ success, data }` envelope for the legacy schedule endpoints (consistent with F02 `[Auto-Accept] D6`, which deliberately preserved their shapes for the F01 page / cached PWA). No backend change.
- **[Auto-Accept] D3 — Non-available states derived client-side from existing reads (no backend rewrite).** `getAvailableSlots` returns only *available* times, so it cannot by itself distinguish *why* a time is unavailable. Rather than re-implement slot math or add an endpoint (both out of scope for a frontend feature; enforcement/back-end work is F05), F04 derives the full candidate grid from the day's **base window + pause** (`getSchedules().disponibilidade[weekday]`) and the day's **bookings** (`getSchedules().agendamentos` filtered to the date), then classifies each candidate: in the available list → **livre**; overlaps a booking → **ocupado**; inside the pause window → **pausa**; otherwise → **fora** (outside hours). This is best-effort: when the date is beyond the bookings window `getSchedules` returns, F04 falls back to rendering only the available chips (still satisfies "book by picking a slot"; the dim states degrade gracefully). The authoritative bookable set is always `getAvailableSlots` (which already honors F02 exceptions).
- **[Auto-Accept] D4 — "Forçar encaixe" is an admin-only toggle that re-enables free time entry.** No hard block exists in F04 (enforcement is F05). The simplest, least-surprising affordance is a small "Forçar encaixe (fora do horário)" toggle, gated by `useAuth().isAdmin`, that reveals the original free time input (or makes any chip selectable) so an admin can book an out-of-hours fit. Hidden for non-admins. The legacy free `datetime-local` thus survives as the escape hatch rather than being deleted.
- **[Auto-Accept] D5 — Fixed 60-minute default duration.** Bookings carry no per-service duration field today, and both the dead call (`getAvailableSlots(dataSelecionada, 60)`) and the backend default already use 60. F04 uses a 60-minute step for the slot grid; a real per-service duration is deferred (no model for it exists). The `duration` prop is plumbed through `SlotPicker` so a future feature can set it without a rewrite.
- **[Auto-Accept] D6 — `SlotPicker` is theme-aware / surface-agnostic.** `CriarAgendamento` is a light amber/white card (legacy styling, not in scope to restyle) while `QuickAppointmentModal` is dark/glass with `useTheme`. The new `.tsx` `SlotPicker` uses design-system accents (indigo = available/selected, red = occupied, amber/slate = pause, slate/dashed = out-of-hours) chosen to read on both light and dark surfaces, accepting an optional `isDarkMode`/variant prop. The surrounding `CriarAgendamento` form keeps its existing palette (restyle is out of scope).
- **[Auto-Accept] D7 — Avoid offering past times for *today*.** When the chosen date is today (`Europe/Lisbon` via luxon), the picker dims/omits slots already in the past so the user does not pick a time the existing future-date Zod rule would then reject. For other dates all in-window slots are offered. This is a UX nicety on top of the existing validation, not a replacement for it.
- **[Auto-Accept] D8 — `CriarAgendamento.jsx` and `QuickAppointmentModal.jsx` stay `.jsx` (edited in place); only the new shared component is `.tsx`.** Per `.claude/rules/react-components.md`, existing `.jsx` files are not converted without explicit need; new components are `.tsx`. F04 edits the two surfaces in place and extracts the new logic into `SlotPicker.tsx`.
