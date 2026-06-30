# F02 — Date Exceptions & Note on Schedule — Plan

**Spec:** `./spec.md` · **Complexity:** medium · **Phases:** 5

## Prerequisites
- Project running locally (backend port 5001, frontend 5173, per `CLAUDE.md` → Environment).
- **F01 complete** (Wave 1): the Disponibilidade link is active in the navbar and `Disponibilidade.tsx` loads for owner/admin; the `/schedules` API (`getSchedules`, `updateSchedule`, `getAvailableSlots`) is reused unchanged.
- Patterns confirmed: `src/models/Schedule.js` (tenant schema export), `src/models/registry.js` (DB-per-tenant registration), `src/modules/clientes/clienteSchemas.js` (Zod style), `src/middlewares/{auth,validate}.js`, the dual-mount `apiResources` loop in `src/app.js`.
- Migration reference only (do **not** migrate here — that is F03): `ia-service/src/ia_service/services/agent_business_rules.py` (`DATE_OVERRIDES_PER_TENANT`).

## Phase 1 — Model & registry
1. **ScheduleException model** — Create `src/models/ScheduleException.js` with the schema from spec §3.1 (`data` as `"YYYY-MM-DD"` string, `tipo` enum, `inicio`/`fim`, `observacao` maxlength 280, unique `(tenantId, data)`). Export `ScheduleExceptionSchema` (named, for registry) + default model, as `Schedule.js` does.
2. **Extend Schedule** — Add optional `observacao: { type: String, default: '', maxlength: 280 }` to `src/models/Schedule.js` (no new index).
3. **Register in tenant registry** — Add `ScheduleException` to `getModels(db)` in `src/models/registry.js` so it is available as `req.models.ScheduleException`.

## Phase 2 — Validation schemas
4. **Zod schemas** — Create `src/routes/scheduleSchemas.js`: `criarExcecaoSchema` (body: `data` YYYY-MM-DD, `tipo` enum, conditional `inicio`/`fim` required + `inicio < fim` when not `fechado`, `observacao` ≤280), `actualizarExcecaoSchema` (same rules), `listarExcecoesQuerySchema` (optional `from`/`to`), `excecaoIdParamSchema` (ObjectId), and extend the base-day update with optional `observacao`. Follow `clienteSchemas.js` style; rely on `validate.js` stripping server-managed keys.

## Phase 3 — Controller & routes (API)
5. **Controller** — In `src/controllers/scheduleController.js` add `listarExcecoes` (tenant-scoped, optional range, sorted by `data`), `criarExcecao` (server-set `tenantId`, force `inicio/fim=null` for `fechado`, handle duplicate → 409), `actualizarExcecao` (validate ObjectId, tenant-scoped `findOneAndUpdate`, 404 if absent), `removerExcecao` (tenant-scoped delete, 404 if absent) — all using the canonical `{ success, data/error }` envelope.
6. **Extend getAvailableSlots** — In the same controller, before reading the weekday `Schedule`, look up a `ScheduleException` for `(tenantId, date)`: `fechado` → return `{ availableSlots: [] }`; `horas-extra`/`horario-especial` → compute slots within `inicio`..`fim` (reuse existing break + bookings logic); otherwise existing behaviour. **Keep the response shape** `{ availableSlots }`.
7. **Extend updateSchedule** — Accept optional `observacao` in the destructured body; keep the legacy raw-document response shape.
8. **Routes** — In `src/routes/scheduleRoutes.js` add (keeping existing routes): `GET /excecoes` (validate query) for any staff; `POST /excecoes` (`authorize('admin','gerente')` + validate body); `PUT /excecoes/:id` and `DELETE /excecoes/:id` (`authorize('admin','gerente')` + validate params/body). No `app.js` change needed — `/schedules` is already in `apiResources` (dual-mount).

## Phase 4 — Frontend (UI)
9. **Service** — In `laura-saas-frontend/src/services/scheduleService.ts` add `ScheduleException` type and `getExcecoes`, `criarExcecao`, `actualizarExcecao`, `removerExcecao` (via `api.js`, reading the `{ success, data }` envelope); add optional `observacao?` to the `Schedule` type and the base-day update payload.
10. **Exception editor UI** — In `laura-saas-frontend/src/pages/Disponibilidade.tsx` add an **"Excepções desta data"** panel (visually separate from "Horário base"): pick a date, choose `tipo` (Fechar este dia / Horas extra / Horário especial), set `inicio`/`fim` for non-`fechado`, write an `observacao`; list existing exceptions with their note and edit/remove actions. Add the `observacao` field to the base-day edit modal. Use the design system (indigo/purple/slate); inline validation + `react-toastify`. **Mobile-responsive** (usable at 375px — stacked/day-by-day layout, usable touch targets).

## Phase 5 — Tests & gates
11. **Backend tests** — Create `tests/schedule-excecoes.test.js` covering acceptance (create fechado/extra with note, precedence, `getAvailableSlots` honors exceptions, validation 400s, duplicate 409, base-day note, update/delete) and multi-tenant isolation + role gate, per spec §7.1.
12. **E2E** — Playwright CLI flow (spec §7.2): owner creates a `fechado` exception with a note and sees it in the UI, including a 375px mobile viewport. Use the `playwright-cli` skill.
13. **Gates** — Backend: `npm run lint` + `npm test` until green. Frontend: `cd laura-saas-frontend && npm run build && npm run lint`. Then ready for `/implement-evaluate`.
