# F01 — Reopen Availability UI · Eval Report

**Evaluated:** 2026-07-01 · **Branch:** `F01-reopen-availability-ui`
**Contract:** `./contract.md` · **Spec:** `./spec.md` · **Method:** Harness Engineering (evaluator)
**Result:** **10 passed · 0 failed · 0 indeterminate** (1 cosmetic note, non-blocking)

---

## 1. Environment & gates

Frontend-only feature (no backend/model change). Gates run from `laura-saas-frontend/`:

| Gate | Command | Result |
|---|---|---|
| Build (TSC + Vite) | `npm run build` | ✅ pass — built, PWA generated |
| ESLint | `npm run lint` | ✅ **0 errors** (6 pre-existing warnings in untouched files: `HistoricoAtendimentos.jsx`, `AuthContext.jsx`, `ThemeContext.jsx`, `FunilAvaliacaoModal*.jsx`; **0 introduced by F01**) |
| Unit tests | `npx vitest run` | ✅ **36 passed** (10 files) |
| E2E (contract) | `npx playwright test disponibilidade` | ✅ **5 passed** (C1, C2/C3, C4, C5, C6) |

> Backend gates (`npm run lint` / `npm test`) not required: `git diff` confirms **zero** backend/model files changed (C9).

---

## 2. Contract verification (C1–C10)

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| **C1** | Navbar link active + page loads in `ProtectedLayout` | ✅ passed | E2E `C1`; screenshot `C1-C4-C8-desktop-grid.png` — sidebar "Disponibilidade" highlighted. *(Note: real nav is `Sidebar.jsx`; `Navbar.jsx` is dead code — link added to Sidebar.)* |
| **C2** | Edit base hours persists via `PUT /schedules/:dayOfWeek` (only `{isActive,startTime,endTime,breakStartTime,breakEndTime}`) + success toast + survives reload | ✅ passed | E2E `C2/C3` (edit→save→toast→reload→persisted); screenshot `C2-edit-modal.png` |
| **C3** | Mobile day-by-day operable at 375px; 8×24 grid hidden | ✅ passed | E2E `C2/C3` + `C4` at 375px; screenshot `C3-mobile-daybyday.png` |
| **C4** | Desktop (≥641px) keeps weekly grid; mobile list hidden | ✅ passed | E2E `C4` asserts `week-grid` visible / `day-by-day` hidden at 1280, inverse at 375 |
| **C5** | Empty-state "Define o teu horário" CTA (not blank grey grid), opens editor | ✅ passed | E2E `C5`; screenshot `C5-empty-state.png` |
| **C6** | "Copiar para os dias úteis" → parallel `updateSchedule` Seg–Sex (no await-in-loop), refetch + toast, partial failure surfaces error | ✅ passed | E2E `C6` asserts exactly PUTs to days `[1,2,3,4,5]`; code uses `Promise.allSettled` |
| **C7** | Dynamic hour window (earliest start → latest end), not hardcoded `08:00–19:30`; fallback when none active | ✅ passed | Screenshot `C7-dynamic-hour-window.png` — active 07:00–21:00 renders window **07:00 → 20:30**; fallback `08:00–20:00` in code |
| **C8** | "Horário base" labelled distinctly + "Excepções desta data" placeholder present | ✅ passed | Screenshots `C1-C4-C8-desktop-grid.png` / `C3` — "Horário base · Recorrente" heading + "Excepções desta data · EM BREVE" card |
| **C9** | No enforcement / no model change — only `Schedule` data written | ✅ passed | `git diff` shows no `src/**` changes; `Schedule.js`/`scheduleController.js`/`scheduleRoutes.js` untouched |
| **C10** | All API via `scheduleService.ts` → `api.js` (no direct `fetch`, no `localStorage` outside `AuthContext`) | ✅ passed | `grep` on `Disponibilidade.tsx`: only `getSchedules`/`updateSchedule` imported; no `fetch`/`localStorage`/`axios` |

---

## 3. Notes (non-blocking)

- **Cosmetic:** in capture screenshots two red "Não foi possível se conectar ao servidor" toasts appear. These come from an **unmocked Sidebar badge/notification call** in the isolated Playwright capture (only `/schedules` + `/auth/me` mocked) — **not** a defect in the Disponibilidade page. In the real app those endpoints resolve.
- **Native time-input rendering:** the `<input type="time">` shows locale 12h-style text in the modal screenshot; the stored value round-trips correctly (persistence E2E proved 10:00–17:00 saved & reloaded).
- **Nav discrepancy (resolved):** spec targeted `Navbar.jsx`, but the active navigation is `Sidebar.jsx` (`Navbar.jsx` only referenced in `App.tsx.backup`). Link added to `Sidebar.jsx` (AGENDAMENTO group, `perm: 'verAgendamentos'`). Recorded for F02–F05.

---

## 4. Artifacts

- Screenshots: `./screenshots/` (C1/C4/C8 desktop, C2 modal, C3 mobile, C5 empty, C7 dynamic window)
- E2E spec: `laura-saas-frontend/tests/e2e/disponibilidade.spec.ts`

## 5. Multi-tenant note

F01 introduces no new tenant-scoped resource (reuses `/schedules`, already tenant-scoped in `scheduleController.js`; cross-tenant `updateSchedule` returns 404). No new isolation test mandated.

---

**Conclusion:** all 10 contract criteria pass deterministically; no failures; no items pending human verification. F01 is **done**.

---

## 6. Post-eval fix (2026-07-01) — blank screen with real data

**Reported:** page went blank right after login on `/disponibilidade` (real tenant, live dev server). Not reproducible with the mocked E2E data.

**Root cause:** `AgendamentoSlot` dereferenced `agendamento.cliente.nome` / `.telefone`. Real bookings can have `cliente = null` (unpopulated / lead-origin). With no error boundary catching it, one bad record blanked the whole page. Confirmed live via Chrome console: *"An error occurred in the `<AgendamentoSlot>` component."*

**Fix:**
- `Disponibilidade.tsx` — `AgendamentoSlot` made null-safe (`cliente?.nome ?? 'Sem cliente'`, telefone rendered only when present).
- `scheduleService.ts` — `Agendamento.cliente` typed optional/nullable (reflects reality).
- **Regression test** `src/pages/__tests__/Disponibilidade.regression.test.tsx` — renders the page with an `agendamento` whose `cliente` is `null`; asserts it shows "Sem cliente" and does not crash (vitest; **37 passed** total).
- **E2E hardening** — `seedAuth` now blocks unmocked `localhost:5001` calls with a benign 200, so background 401s can't spawn "Autenticação inválida" toasts that race the success toast. All 5 E2E green.

**Verified live:** `/disponibilidade` renders for the real tenant; console clean.

---

## 7. Design change (2026-07-01) — compact editor, grid dropped (owner decision)

**Feedback:** owner (Laura) noted the page was very tall and overlapped in purpose with the **Calendário** — because the desktop grid also drew the bookings.

**Decision (owner-approved):** the Disponibilidade page is purely for **authoring the base weekly schedule**; viewing bookings stays in the **Calendário**. The full time-grid (7×48) + bookings overlay was **removed** and replaced by a **compact day-card editor** (the same view on mobile and desktop): 7 weekday cards (label, active badge, hours summary, "Editar"), the "Copiar para os dias úteis" action (in the modal), empty-state CTA, and the "Excepções desta data" placeholder.

**Contract impact:** this **supersedes C4** ("desktop keeps the weekly grid") and **C7** ("dynamic hour window") — both were grid-specific and no longer apply, by explicit product decision. C1, C2, C3, C5, C6, C8, C9, C10 remain satisfied. The compact editor is strictly simpler and removes the crash surface entirely (no `AgendamentoSlot`).

**Gates after change:** build ✅ (chunk 22 kB → 15 kB), lint 0 errors, vitest **37 passed**, Playwright **5/5** (C4 rewritten to assert the compact editor renders 7 day-cards on both viewports). Verified live for the real tenant.

**Data observations surfaced by the clearer UI (tenant data, not a bug):** Segunda inactive; Domingo active `00:00–18:00` (the source of the old midnight-start grid). Owner can fix both via "Editar".
