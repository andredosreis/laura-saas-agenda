# F01 — Reopen Availability UI — Spec

**PRD:** `docs/produto/PRD-disponibilidade-unificada.md` (F01)
**ADR:** `docs/adrs/generated/ADR-028-disponibilidade-fonte-unica-painel-ia.md` (Fase 0 + "Notas de UI")
**Complexity:** medium
**Module:** `laura-saas-frontend/src/` (frontend-first) — page rewrite + navbar re-enable. **No backend or model change** (the `/schedules` API and `Schedule` model are reused unchanged; the date-exception model layer is F02).

---

## 1. Scope

F01 is **Wave 1** of the Unified Availability PRD and has **no dependencies**. It reopens the orphaned `Disponibilidade` page and makes it the place where the clinic owner **authors the base weekly schedule by hand** — each weekday's start/end + pause — on phone or desktop. It is purely a UI/data-authoring feature: **no enforcement, no AI wiring, no model change** (those are F02–F05).

**Included:**
- **Manual creation/editing of the base weekly schedule (the headline of this feature):** per-weekday `isActive` + `startTime`/`endTime` + `breakStartTime`/`breakEndTime`, persisted through the existing `PUT /schedules/:dayOfWeek` (`updateSchedule`). This is the single place availability is authored by hand.
- **Re-enable the navbar link:** uncomment the `Disponibilidade` entry in `Navbar.jsx` (desktop + mobile menus) so the already-routed page (`/disponibilidade` in `App.tsx`) is reachable.
- **Mobile responsiveness (first-class):** on viewports ≤640px the 8×24 weekly grid is replaced by a **day-by-day view** (accordion/list) with touch-usable controls, operable on a 375px screen. Desktop keeps the existing grid.
- **Empty-state CTA:** when no day is active/configured, show a "Define o teu horário" call-to-action instead of an all-grey grid.
- **"Copiar para os dias úteis" quick action:** from an edited day, copy its hours to the weekday set (Seg–Sex) in one action, so the owner doesn't edit 5 days one by one.
- **Dynamic hour window:** derive the visible time range from the configured schedule (earliest start / latest end across active days) instead of the hardcoded `08:00–19:30` loop.
- **Clarity base vs exception:** visually label the recurring **"Horário base"** distinctly, and surface a **"Excepções desta data"** section as a labelled placeholder (populated in F02), so editing a weekday no longer reads as editing a single calendar date.

**Provides (to later features):**
- A reachable, mobile-usable availability authoring surface and a configured `Schedule` (base weekly hours) — the data foundation F02 extends with per-date exceptions and F03 reads for the AI.

**Deferred (other features):** per-date exceptions + `observacao` note (F02 — the model change); AI reading `Schedule` (F03); slot picking in manual booking (F04); booking enforcement/override (F05). F01 ships **no validation/enforcement** of bookings.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `laura-saas-frontend/src/components/Navbar.jsx` | edit | Uncomment the `{ to: "/disponibilidade", text: "Disponibilidade", icon: CalendarClock }` entry in `navLinks` (re-enables both desktop and mobile menus, which map over the same array). `CalendarClock` is already imported. |
| `laura-saas-frontend/src/pages/Disponibilidade.tsx` | edit (rewrite) | Add responsive day-by-day view (≤640px), empty-state CTA, "copiar para os dias úteis" action, dynamic hour window, and "Horário base" / "Excepções desta data" labelling. Keep the existing desktop grid + `EditScheduleModal`. |
| `laura-saas-frontend/src/services/scheduleService.ts` | reuse unchanged | `getSchedules()` and `updateSchedule(dayOfWeek, data)` already exist and are the only API calls F01 needs. **No change.** |
| `laura-saas-frontend/src/App.tsx` | reuse unchanged | Route `/disponibilidade` → `<ProtectedLayout><Disponibilidade/></ProtectedLayout>` already exists (lazy import at line 37, route at line 152). **No change** beyond verification. |
| `src/models/Schedule.js` | reuse unchanged | Base weekly schema (dayOfWeek, isActive, start/end, break). Date-exception fields are added in **F02**, not here. |
| `src/controllers/scheduleController.js` | reuse unchanged | `getSchedules`, `updateSchedule`, `getAvailableSlots` — used as-is. |
| `src/routes/scheduleRoutes.js` (mounted in `src/app.js` `apiResources` as `['/schedules', scheduleRoutes]`) | reuse unchanged | Dual-mounted `/api/schedules` + `/api/v1/schedules`. **No change.** |
| `laura-saas-frontend/tests/e2e/disponibilidade.spec.ts` (or repo's existing Playwright location) | new | Playwright CLI flow: 375px viewport → open page → edit a weekday → save → assert persistence. |

Pattern references: design system `.claude/rules/react-components.md` (indigo-500/purple-500/slate-900, glass, `.tsx`, luxon, no `alert()`, react-toastify, PWA/mobile); `.claude/rules/react-hooks.md` (`api.js` only, `useAuth`); existing `Disponibilidade.tsx` `EditScheduleModal` (reuse as the edit primitive on both layouts).

---

## 3. Data Model

**N/A for F01.** This is a frontend-first feature. The `Schedule` model is reused **unchanged**; the per-date exception layer (a new `excepcoes[]` subdocument + `observacao`) is introduced by **F02**. F01 must not add or alter any schema field.

---

## 4. API Contracts (reused, not modified)

F01 adds **no new endpoint**. It consumes two existing `/schedules` routes via `scheduleService.ts`. Both are mounted at `/api/schedules` and `/api/v1/schedules` behind `authenticate` (tenant context via `req.tenantId` / `req.models`).

> ⚠️ **Contract note:** these legacy `/schedules` handlers do **not** follow the project's `{ success, data }` response contract — `getSchedules` returns `{ disponibilidade, agendamentos }` and `updateSchedule` returns the raw schedule object. F01 **reuses them as-is** and does not refactor the contract (out of scope; would risk the `getAvailableSlots` consumers in F03/F04). `scheduleService.ts` already adapts to these raw shapes.

### GET /schedules — load base schedule + week's bookings
Response `200` (existing shape):
```json
{ "disponibilidade": [ { "_id": "...", "dayOfWeek": 1, "label": "Segunda-feira",
  "isActive": true, "startTime": "09:00", "endTime": "18:00",
  "breakStartTime": "12:00", "breakEndTime": "13:00", "updatedAt": "..." } ],
  "agendamentos": [ { "_id": "...", "dataHora": "...", "cliente": { "nome": "...", "telefone": "..." } } ] }
```
`getSchedules` lazily initializes the 7 weekday rows for the tenant (`initializeSchedules`) on first read.

### PUT /schedules/:dayOfWeek — save one weekday's base hours
Request body (server picks only these fields — no mass assignment):
```json
{ "isActive": true, "startTime": "09:00", "endTime": "18:00",
  "breakStartTime": "12:00", "breakEndTime": "13:00" }
```
Response `200`: the updated schedule object. `404` if the weekday row does not exist in the tenant (cross-tenant write returns `404`, never `403`).

The **"copiar para os dias úteis"** action is implemented client-side as up to 5 `updateSchedule` calls (Seg–Sex), issued in parallel (`Promise.all`, never `await` in a loop), then a single refetch.

---

## 5. Requirements / Business Rules

- **R1 (headline).** The owner/admin can create and edit each weekday's base hours by hand (active flag, start/end, pause start/end) and the change persists via `PUT /schedules/:dayOfWeek` and survives a reload.
- **R2.** The `Disponibilidade` link is active in the navbar (desktop + mobile) and the page loads inside `ProtectedLayout`.
- **R3.** On a ≤640px viewport the page renders a day-by-day view (accordion/list) operable at 375px with usable touch targets; the desktop grid is hidden at that width. On ≥641px the existing weekly grid is shown.
- **R4.** When no day is active/configured the page shows a "Define o teu horário" CTA (not a blank grey grid) that opens the editor.
- **R5.** A "copiar para os dias úteis" action propagates an edited day's hours to weekdays Seg–Sex; on success a toast confirms and the view refetches.
- **R6.** The visible hour window is derived from the configured schedule (earliest active `startTime` → latest active `endTime`), with a sensible fallback when nothing is active — not a hardcoded `08:00–19:30`.
- **R7.** The page visually separates **"Horário base"** (recurring) from **"Excepções desta data"** (a labelled placeholder in F01, filled by F02), so a weekday edit doesn't read as a single-date edit.
- **R8.** No booking enforcement, no AI wiring, no model change in F01. Saving hours only writes data.
- **R9.** All API access goes through `scheduleService.ts` → `api.js` (Bearer token, refresh, tenant scoping handled there); never `fetch` directly; never read `localStorage` outside `AuthContext`.
- **R10.** Design-system compliant: indigo/purple/slate + glass, `react-toastify` for action feedback (never `alert()`), luxon for dates, inline field validation where relevant.

**UX flow:** Owner taps navbar → "Disponibilidade" → (empty) sees "Define o teu horário" CTA → opens a day → sets active + start/end + pause → saves → optionally "copiar para os dias úteis" → hours persist; on a phone the whole flow uses the day-by-day view.

---

## 6. Error Handling

| Scenario | Behaviour |
|---|---|
| `getSchedules` fails | Full-screen error card with the message (existing pattern); no crash. |
| `updateSchedule` fails (network/validation) | `toast.error('❌ Erro ao atualizar horários')` (existing); modal stays open so input isn't lost. |
| Save succeeds | `toast.success('✅ Horários atualizados com sucesso!')` + refetch. |
| "Copiar para os dias úteis" partial failure | Surface a toast error; refetch so the UI reflects the rows that did persist (no silent success). |
| Invalid local input (e.g. start ≥ end) | Inline hint under the field; do not submit. (Hard backend validation of ranges is out of scope for F01 — the legacy `updateSchedule` does not validate ranges; this is a client-side guard only.) |
| 401 / expired token | Handled by the `api.js` interceptor (auto-refresh / logout). |
| Cross-tenant write | Backend returns `404` (tenant-scoped `findOneAndUpdate`); surfaced as a save error. |

---

## 7. Testing Strategy

**Playwright CLI E2E (required acceptance — PRD §9 F01):**
`laura-saas-frontend/tests/e2e/disponibilidade.spec.ts` (use the repo's existing Playwright setup / `playwright-cli`):
- `mobile: edit a weekday's hours and persist` — set viewport to **375×812**, log in (or seed auth state), navigate to `/disponibilidade`, open a weekday in the **day-by-day view**, change `startTime`/`endTime`, save, assert the success toast, **reload**, and assert the new hours are still shown (persistence).
- `navbar link is reachable` — the "Disponibilidade" nav item is visible and routes to the page.
- `empty state` — with no active days, the "Define o teu horário" CTA is shown.
- (desktop sanity) `≥641px shows the weekly grid; ≤640px shows the day-by-day view`.

**Component / unit (where the project runs frontend tests):**
- Dynamic hour-window derivation (earliest start / latest end; fallback when none active).
- "Copiar para os dias úteis" issues exactly the weekday updates (Seg–Sex) in parallel and refetches once.
- Empty-state detection (no `isActive` day → CTA).

**Backend:** none new — `getSchedules`/`updateSchedule` already have their behaviour; F01 changes no backend code. (Multi-tenant isolation of `/schedules` is already enforced by tenant-scoped queries in `scheduleController.js`; no new resource is introduced, so no new isolation test is mandated by F01, though the cross-tenant `404` on `updateSchedule` remains true.)

**Cross-feature note (verified later):** F02 will add the date-exception layer the "Excepções desta data" placeholder anticipates; F03/F04 will read the base schedule authored here. Not tested in F01.

---

## 8. Assumptions / Decisions

- **[Auto-Accept] Mobile breakpoint = 640px (Tailwind `sm`).** The PRD specifies "≤640px → day-by-day". Implementation uses Tailwind's `sm` breakpoint: grid is `hidden sm:block` and the day-by-day list is `block sm:hidden`. Verified primary target: 375px.
- **[Auto-Accept] Day-by-day view = accordion/list, not tabs.** An expandable list of the 7 days (each row shows label + active state + a summary like "09:00–18:00 · pausa 12:00–13:00" and an "Editar" affordance) reuses the existing `EditScheduleModal`. Accordion suits a single-column phone layout and a 7-item set better than tabs.
- **[Auto-Accept] "Copiar para os dias úteis" = copy active+start/end+pause to weekdays Seg–Sex (dayOfWeek 1–5).** Triggered from an edited/selected day; issues parallel `updateSchedule` calls for the other weekdays and refetches once. "Dias úteis" chosen over "todos os dias" as the safer default (weekend kept as configured); a future variant could add "copiar para todos".
- **[Auto-Accept] Dynamic hour window = `min(active startTime)` → `max(active endTime)`, rounded to the hour, fallback `08:00–20:00` when no day is active.** Replaces the hardcoded `08:00–19:30` loop; keeps 30-min rows.
- **[Auto-Accept] "Excepções desta data" is a labelled, visually-distinct placeholder in F01** (e.g. a card stating exceptions arrive next, or a disabled section) — it exists to establish the base-vs-exception mental model now; F02 makes it functional. No model/API for it in F01.
- **[Auto-Accept] Page reachable to any authenticated staff via the navbar; no new RBAC added in F01.** Acceptance says "loads for owner/admin"; the existing `/schedules` routes only require `authenticate`. Since F01 adds no enforcement and the data is tenant-scoped, no new role gate is introduced (consistent with "no enforcement, no model change"). Tightening roles, if desired, is a separate decision.
- **[Auto-Accept] Legacy `/schedules` response contract is preserved (not migrated to `{ success, data }`).** Refactoring it would touch `getAvailableSlots` consumers planned for F03/F04 and is out of F01 scope; `scheduleService.ts` already adapts to the raw shapes.
- **[Auto-Accept] Playwright spec path `laura-saas-frontend/tests/e2e/disponibilidade.spec.ts`.** If the repo already has an E2E folder/convention, follow it; the binding requirement is the 375px edit-and-persist flow, not the exact path.
