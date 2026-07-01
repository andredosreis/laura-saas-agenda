# F02 — Date Exceptions & Note on Schedule · Eval Report

**Evaluated:** 2026-07-01 · **Branch:** `F01-reopen-availability-ui`
**Contract:** `./contract.md` · **Spec:** `./spec.md` · **Method:** Harness Engineering (evaluator)
**Result:** **12 passed · 0 failed · 0 indeterminate**

Full-stack feature (backend model/API + frontend calendar). Prerequisite F01 implemented ✅.

---

## 1. Gates

| Gate | Command | Result |
|---|---|---|
| Backend ESLint | `eslint` (F02 files) | ✅ 0 errors/0 warnings |
| Backend tests | `npm test -- schedule-excecoes` | ✅ **14 passed** (C1–C11) |
| Backend regression | `multiTenant` + `lead-multitenant` | ✅ 11 passed (no regression from `updateSchedule`/routes changes) |
| Frontend build (TSC + Vite) | `npm run build` | ✅ pass |
| Frontend ESLint | `npm run lint` | ✅ 0 errors (6 pre-existing warnings, none in F02 files) |
| Frontend unit | `npx vitest run` | ✅ **37 passed** |
| Frontend E2E | `npx playwright test disponibilidade` | ✅ **6 passed** (incl. C12) |

---

## 2. Contract verification (C1–C12)

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| **C1** | Create `fechado` exception with note (inicio/fim null), round-trips in list | ✅ passed | `schedule-excecoes` C1 |
| **C2** | Create `horas-extra`/`horario-especial` with window + note | ✅ passed | `schedule-excecoes` C2 |
| **C3** | Precedence: `fechado` date → `availableSlots: []` on an active weekday | ✅ passed | `schedule-excecoes` C3 |
| **C4** | Precedence: extra/special date → slots within `inicio`..`fim` (base 09:00 absent) | ✅ passed | `schedule-excecoes` C4 |
| **C5** | Validation (400): `inicio>=fim`, `observacao>280`, bad `data`, out-of-enum `tipo` | ✅ passed | `schedule-excecoes` C5 (×4) |
| **C6** | One exception per date → 409 on duplicate; no second entry | ✅ passed | `schedule-excecoes` C6 |
| **C7** | Base weekday `observacao` persists via `PUT /:dayOfWeek`; >280 → 400 | ✅ passed | `schedule-excecoes` C7 |
| **C8** | Update then delete an exception; gone from list afterwards | ✅ passed | `schedule-excecoes` C8 |
| **C9** 🔴 | Tenant isolation: B never sees A's; B update/delete A's → **404**, not mutated | ✅ passed | `schedule-excecoes` C9 (critical isolation test present) |
| **C10** | Write role gate: `recepcionista` GET 200, POST/PUT/DELETE → 403 | ✅ passed | `schedule-excecoes` C10 |
| **C11** | Legacy endpoints keep raw shapes (`{disponibilidade,agendamentos}`, `{availableSlots}`, raw doc) | ✅ passed | `schedule-excecoes` C11 |
| **C12** | UI: pick a date → "Fechar este dia" + note → save; appears in calendar; operable at 375px | ✅ passed | E2E C12 (mobile 375px create→save→cell badge+note) + screenshots |

---

## 3. UI evidence (screenshots/)

- `C12-desktop-calendar-notes.png` — monthly calendar with three exceptions rendering **type + note** in each cell: 15 `Fechado · Feriado` (red), 22 `18:00–21:00 · Evento noturno` (indigo), 8 `10:00–13:00 · Só de manhã` (indigo). Legend + month nav.
- `C12-mobile-exception-modal.png` — exception modal at 390px: date header, type radios (Fechado preselected), note field (`Feriado`, 7/280), Remover/Cancelar/Guardar.

---

## 4. Multi-tenant (critical)

C9 isolation test **present and passing** — a Tenant B token cannot list, update, or delete Tenant A's exceptions (cross-tenant write → 404, never 403, never mutated). All exception queries are `{ tenantId }`-scoped, and `getAvailableSlots` looks up exceptions by `tenantId`. No 🔴 finding.

---

## 5. Design note (owner-requested enhancement)

The exceptions UI shipped as a **monthly calendar** (owner's explicit choice over a flat list). Per a follow-up request, each day cell now also renders the **`observacao`** under the type/hours (truncated; full text in tooltip and edit modal). Contract C12 (create closed-day-with-note and see it in the calendar) is satisfied and the note-in-cell is covered by the E2E assertion.

---

## 6. Notes

- Endpoints new to F02 use the canonical `{ success, data/error }` envelope; the legacy `/schedules`, `/available-slots`, `PUT /:dayOfWeek` keep their raw shapes (C11) — F01/PWA unaffected.
- **Live check (read-only):** `GET /api/schedules/excecoes` returned **200** from the real backend (`localhost:5001`, restarted with F02). No exception was created live — `.env` points to the production Atlas cluster, so a create would write real tenant data; deferred to the owner.

---

**Conclusion:** all 12 contract criteria pass deterministically; no failures; nothing pending. F02 is **done**.
