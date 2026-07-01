# F04 — Slot Picking in Manual Booking — Plan

**Spec:** `./spec.md` · **Complexity:** medium · **Phases:** 4

## Prerequisites
- Project running locally (frontend 5173, backend 5001, per `CLAUDE.md` → Environment).
- **F02 complete** (Wave 2): `GET /schedules/available-slots` honors per-date exceptions (`fechado` → no slots; `horas-extra`/`horario-especial` → exception window) on top of base schedule + bookings + pause. F04 consumes this unchanged.
- Patterns confirmed:
  - `laura-saas-frontend/src/services/scheduleService.ts` — `getAvailableSlots(date, duration) → string[]` (raw `{ availableSlots }`), `getSchedules() → { disponibilidade, agendamentos }`.
  - `laura-saas-frontend/src/services/api.js` — axios instance (`VITE_API_URL`, Bearer + refresh interceptors).
  - `laura-saas-frontend/src/components/QuickAppointmentModal.jsx` — modal + `useTheme` + luxon idiom; emits `dataHora` as `"yyyy-MM-dd'T'HH:mm"` via `onSubmit`.
  - `laura-saas-frontend/src/pages/CriarAgendamento.jsx` — react-hook-form + Zod; the **dead** `dataSelecionada` / `setHorariosVagos` / `getAvailableSlots` effect to revive.
  - `laura-saas-frontend/src/pages/CalendarView.jsx` — owns `selectedDate` + `handleCreateAppointment`, passed to the modal (no change expected).
  - `.claude/rules/react-components.md` (design system, `.tsx` for new, no `alert()`), `.claude/rules/react-hooks.md` (`useAuth`, `api.js` only).
- No backend work in F04 (enforcement is F05; slot math reuse only).

## Phase 1 — Service helper
1. **Keep `getAvailableSlots` as-is** (raw `{ availableSlots }` → `string[]`); confirm it still returns `[]` (not throw) for closed days. (`spec §4`, `[Auto-Accept] D2`.)
2. **Add `getDiaDisponibilidade(date, duration)`** to `scheduleService.ts`: in parallel call `getAvailableSlots(date, duration)` and `getSchedules()`; from `getSchedules` derive the day's base window/pause using `schedules.find(s => s.dayOfWeek === d)` (the project pattern from `Disponibilidade.tsx`; do NOT use `disponibilidade[weekday]` index access — only safe when the backend returns exactly 7 sorted docs) and the day's bookings (filter `agendamentos` by `date`, `Europe/Lisbon` — `getSchedules()` already pre-filters server-side to `'Agendado'`/`'Confirmado'`, so no client-side status check needed). Return `{ slots: string[], janela: { startTime, endTime, breakStartTime, breakEndTime } | null, ocupados: {start,end}[] }`. When `getSchedules` lacks the date, return `janela: null`/`ocupados: []` (best-effort fallback). Export a `SlotEstado = 'livre'|'ocupado'|'pausa'|'fora'` type. (`spec §4`, `[Auto-Accept] D3`.)

## Phase 2 — `SlotPicker` component (new, `.tsx`)
3. **Create `laura-saas-frontend/src/components/SlotPicker.tsx`** with props `{ date, duration?=60, value, onChange, allowForce?, onForceToggle?, isDarkMode? }`.
   - On `date`/`duration` change: fetch via `getDiaDisponibilidade`; manage `isLoading`/`error`/empty states (no `fetch`, no `alert()` — `spec §6`, `react-hooks.md`).
   - Build the candidate grid by stepping `duration` across `janela` (or, on fallback, render just the available `slots`). Classify each candidate (`livre`/`ocupado`/`pausa`/`fora`) per `[Auto-Accept] D3`; for **today**, dim/omit past times (`[Auto-Accept] D7`, luxon `Europe/Lisbon`).
   - Render a wrapping **grid of chips**: livre = indigo selectable, selected = filled gradient; ocupado = red dimmed; pausa = amber/slate dimmed; fora = slate dashed dimmed. ≥44px touch targets, no horizontal scroll at 375px (`spec §R3/R6`, design system).
   - Empty → "Sem horários disponíveis para esta data"; non-`livre` chips disabled unless `allowForce` is on (then selectable). Emit `onChange("HH:mm")`.
   - Theme-aware accents readable on light + dark surfaces (`[Auto-Accept] D6`).
   - **TypeScript (spec D9, `typescript-advanced-types` skill):** type props and internal state with explicit union/literal types — `type SlotEstado = 'livre' | 'ocupado' | 'pausa' | 'fora'`, `Record<string, SlotEstado>` for the classification map; prefer `unknown` over `any`; avoid `as` casts (use narrowing/type guards); keep types proportionate to the component's simplicity. Reference: `CLAUDE.md` rule §6 + `.claude/skills/typescript-advanced-types`.

## Phase 3 — Wire the two booking surfaces
4. **`CriarAgendamento.jsx`** (Sessão + Avaliação forms):
   - **Note: the page has TWO independent react-hook-form instances** — `sessaoForm` (around lines 93–106) and `avaliacaoForm` (around lines 109–113), each with its own `register('dataHora')` in separate JSX. Both must be wired independently: `sessaoForm.setValue('dataHora', …)` and `avaliacaoForm.setValue('dataHora', …)` are two distinct wiring points; a single `setValue` call does not cover both.
   - Turn `dataSelecionada` into a real `useState` set by a new **date `<input type="date">`**; remove the discarded `setHorariosVagos` dead path.
   - Render `<SlotPicker>` in each form's JSX block; on slot pick, compose `dataHora` = `${dataSelecionada}T${slot}` and call `setValue('dataHora', …, { shouldValidate: true })` on **that form's** instance so the existing Zod future-date rule runs on both.
   - Keep the free `datetime-local` available **only** when `allowForce` toggle is on (`[Auto-Accept] D4`); otherwise it is replaced by date + `SlotPicker`.
5. **`QuickAppointmentModal.jsx`**:
   - Replace the `datetime-local` `dataHora` field with a date row + `<SlotPicker>`; **update** the existing luxon `useEffect` (currently it seeds the full `dataHora` date+time from `selectedDate` into `formData.dataHora`) so it seeds only the **date portion** into a separate date state — the time now comes from the `SlotPicker`'s `onChange`; on pick, compose `dataHora` = `${date}T${slot}` in `"yyyy-MM-dd'T'HH:mm"` format so `onSubmit(submitData)` is unchanged.
   - Gate the "Forçar encaixe" toggle on `useAuth().isAdmin`; pass `isDarkMode` from `useTheme`.
6. **`CalendarView.jsx`** — verify only: the modal still emits a valid `dataHora`; no prop changes expected.

## Phase 4 — Tests & gates
7. **E2E** — Playwright CLI flow (`spec §7.1`, skill `playwright-cli`): book by picking an available slot (revived path), assert occupied/out-of-hours/pause are visually distinguished, re-run at **375px**; optionally assert the empty state on an F02 `fechado` date.
8. **Gates** — `cd laura-saas-frontend && npm run build && npm run lint` until green. Then ready for `/implement-evaluate`.
