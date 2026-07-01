# F05 — Backend Availability Enforcement (optional) — Plan

**Spec:** `./spec.md` · **Complexity:** medium · **Phases:** 4

## Prerequisites
- Project running locally (backend per `CLAUDE.md` → Environment).
- **F02 complete** — `ScheduleException` model + `getAvailableSlots` honoring exception precedence (`fechado` → no slots; `horas-extra`/`horario-especial` → window).
- **F03 complete** — the shared pure helper **`resolveAvailableSlots({ Schedule, ScheduleException, Agendamento, tenantId, date, duration })`** is exported from `src/controllers/scheduleController.js` (the single slot calculation reused by the AI and the panel). F05 imports and reuses it unchanged.
- **F04 complete** — the manual-booking slot picker reads `getAvailableSlots`, so the panel already offers exactly the availability F05 will enforce (parity).
- Patterns confirmed: the commented enforcement block + `{ message }` rejection idiom + raw-document success in `src/modules/agendamento/agendamentoController.js`; `req.user.role` / `superadmin` bypass in `src/middlewares/auth.js`; `.strict()` body validation in `src/middlewares/validate.js`; `Agendamento` schema + partial-unique slot index in `src/models/Agendamento.js`.

## Phase 1 — Model & schema (record the override)
1. **`Agendamento` extend** — Add the optional `encaixe` sub-document (`forcado`, `motivo` ≤280, `autorizadoPor` ref `User`, `autorizadoEm`) to `agendamentoSchema` in `src/models/Agendamento.js`, defaults as in spec §3. No new index; do not touch `ocupaSlot`, the slot pre/update hooks, or `tenant_datahora_ocupaslot_unique`.
2. **Create schema** — In `src/modules/agendamento/agendamentoSchemas.js` add `forcarEncaixe` (`z.boolean().optional()`, treated as default `false`) and `motivoEncaixe` (`z.string().trim().max(280).optional()`) to `createAgendamentoSchema` (keep `.strict()`).

## Phase 2 — Enforcement in `createAgendamento`
3. **Import the shared helper** — `import { resolveAvailableSlots } from '../../controllers/scheduleController.js';` (F03 export) into `agendamentoController.js`; pull `ScheduleException` from `req.models` alongside `Agendamento`/`Schedule`.
4. **Reactivate enforcement (inline)** — Replace the commented block (controller §~96–124) with: derive `date`/`time` from `agendamentoDateTime` (`Europe/Lisbon`); if the tenant has a `Schedule`, call `resolveAvailableSlots({ ..., tenantId: req.tenantId, date, duration: 60 })`; if `time` is **not** in the returned slots, apply the override decision (spec §4 step 5) — reject 400 (no override) / 403 (override by non-admin) / proceed-and-record (admin override). Skip enforcement when no `Schedule` is configured (permissive, D4). Place this **after** the past-date check and **before** the existing conflict/auto-heal block so a hard double-book still returns 409.
5. **Stamp the record** — When an admin override is applied, set `encaixe = { forcado:true, motivo: motivoEncaixe ?? null, autorizadoPor: req.user._id, autorizadoEm: DateTime.now().setZone('Europe/Lisbon').toJSDate() }` on the `new Agendamento({ ... })`; otherwise leave defaults (`forcado:false`). Keep the existing raw-document `201` response (now carrying `encaixe`) and the `{ message }` error shape (D6).

## Phase 3 — Enforcement in AI internal routes

**Two additional write paths bypass `createAgendamento` and call `models.Agendamento.create(...)` directly — they must receive identical `resolveAvailableSlots` enforcement.** Both are invoked by the Python `ia-service` via `X-Service-Token`; the AI **never** overrides (`forcarEncaixe` is not accepted on these routes).

6. **`src/modules/leads/leadInternalRoutes.js`** — In the `POST /:id/agendamento` handler (~line 426): import `resolveAvailableSlots` from `../../controllers/scheduleController.js`; before the `models.Agendamento.create(...)` call, derive `date`/`time` from `dataHora` (`Europe/Lisbon`), call `resolveAvailableSlots` (skip enforcement if no `Schedule` configured), and reject with a non-200 error if `time` is not in the returned slots. Any `forcarEncaixe` in the body is **ignored** — no override on the AI path. Use this route's existing error shape (`{ success, error }`).
7. **`src/modules/clientes/clienteInternalRoutes.js`** — In the `POST /:id/agendamentos` handler (~line 168): same enforcement as step 6 — import `resolveAvailableSlots`, derive `date`/`time`, reject if outside availability, no override accepted. Use this route's existing error shape.

## Phase 4 — Tests & gates
8. **Tests** — Create `tests/agendamento-enforcement.test.js` covering acceptance (out-of-hours 400, in-hours 201, admin override 201 + recorded, `fechado` date 400, non-admin override 403, pause 400), parity with `resolveAvailableSlots` / a `horas-extra` window, multi-tenant isolation, the permissive no-`Schedule` rollout case, **and AI internal routes (C10: `leadInternalRoutes` + `clienteInternalRoutes` enforce without override)**, per spec §7. Mock push/Evolution/notifications per `.claude/rules/testing.md`.
9. **Gates** — Run `npm run lint` and `npm test` until green (confirm no regression in the existing agendamento tests — past-date, conflict pre-check 400, conflict race 409, RBAC); then ready for `/implement-evaluate`.
