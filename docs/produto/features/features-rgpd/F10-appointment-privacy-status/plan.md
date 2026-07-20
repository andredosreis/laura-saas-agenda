# F10 — Privacy Status & Note on Appointment — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 4

> Consolidated 2026-07-20 with [../RECONCILIATION.md](../RECONCILIATION.md) R10 — the note is the new `Cliente.notaOperacional` (never `observacoes`, which feeds the AI prompt); AI-exclusion regression required.

## Prerequisites
- Project running locally (backend + frontend per `CLAUDE.md` → Environment).
- **F01 done:** `ConsentLog` model + `{ tenantId:1, tipo:1, createdAt:-1 }` index (latest-by-type), `gdpr` module scaffolding.
- **F04 done:** `FichaToken` model with `status` lifecycle (`ativo`/`usado`/`revogado`) registered in `registry.js`.
- **F05 done:** `POST /gdpr/clientes/:id/enviar-ficha` + the "Enviar ficha…" button on `EditarCliente.jsx`.
- Patterns confirmed: `src/modules/gdpr/{gdprController,gdprRoutes,gdprSchemas}.js`, F09's `consent-estado` derivation idiom, `src/middlewares/{auth,validate}.js`; frontend `Agendamentos.jsx` (card + status-pill), `AppointmentDetailModal.jsx`, `EditarCliente.jsx` (Dados tab), `FunilAvaliacaoModal.jsx` (lead-closing), `services/api.js`, `contexts/AuthContext`; backend `src/models/Cliente.js` + clientes update allow-list + agendamento populate select (gain `notaOperacional` — R10).

## Phase 0 — `notaOperacional` field + AI exclusion (R10)
0. **Model + paths** — Add `notaOperacional: { type: String, trim: true, maxlength: 200, default: '' }` to `src/models/Cliente.js`; add it to the cliente-update allow-list (`clienteSchemas`/controller) and to the `GET /agendamentos` cliente populate `select`; add it to **no** internal/AI projection. Regression tests: `notaOperacional` absent from `/api/internal/clientes/*` payloads (Jest) and from the `client_orchestrator.py` `db.clientes` projection (ia-service pytest).

## Phase 1 — Backend read endpoints (status derivation)
1. **Schemas** — In `src/modules/gdpr/gdprSchemas.js` add `estadoPrivacidadeParamsSchema` (`:id` ObjectId) and `estadoPrivacidadeQuerySchema` (`clienteIds` CSV → array, ≤100, each ObjectId), following `clienteSchemas.js`/F09.
2. **Controller** — In `src/modules/gdpr/gdprController.js` add `estadoPrivacidade` (single) and `estadoPrivacidadeBatch` (map). Derive, tenant-scoped: `consentimentoSaude` via F01's `estadoAtual` helper (R3); `fichaPreenchida`/`fichaEnviada` from `FichaToken` (`usado` → filled; else `ativo` → sent). Single read also returns `notaOperacional` (R10). Run the two queries with `Promise.all` (no `await` in loop). Single validates the client exists in tenant (404); batch silently omits unknown/cross-tenant ids. **Return no clinical fields.**
3. **Routes** — In `src/modules/gdpr/gdprRoutes.js` add `GET /clientes/:id/estado-privacidade` and `GET /estado-privacidade`, both `authorize('admin','gerente','recepcionista','terapeuta')` + validate. (Dual-mount is inherited from F01's `apiResources` entry.)

## Phase 2 — Reusable frontend status UI
4. **Badge component** — Create `laura-saas-frontend/src/components/PrivacyStatusBadge.tsx` (pure, typed props `{ fichaPreenchida, fichaEnviada, consentimentoSaude, size? }`): ✓ preenchida / ⏳ pendente pill, "ficha por preencher" alert when pending, consent indicator (Dado a DD-MM-AAAA / Pendente / Retirado via luxon). Design system; **no clinical content**.
5. **Status hook** — Create `laura-saas-frontend/src/hooks/usePrivacyStatus.ts` with `usePrivacyStatus(clienteIds[])` (batch → `api.get('/gdpr/estado-privacidade?clienteIds=...')`, deduped) and `usePrivacyStatusOne(clienteId)` (single). Loading/error states; failures degrade gracefully (no throw to the page).

## Phase 3 — Wire the badge + note into the appointment surfaces
6. **Agenda** — In `laura-saas-frontend/src/pages/Agendamentos.jsx`: after appointments load, collect unique `cliente._id`s (skip lead-only), call `usePrivacyStatus` once, render `<PrivacyStatusBadge>` + `ag.cliente.notaOperacional` on each client card/row (populate select updated in Phase 0).
7. **Detail modal** — In `src/components/AppointmentDetailModal.jsx`: render `<PrivacyStatusBadge>` (single read) + `notaOperacional` for client appointments; surface the F05 "Enviar ficha de consentimento" action.
8. **Client record** — In `laura-saas-frontend/src/pages/EditarCliente.jsx` (Dados tab): show `<PrivacyStatusBadge>` + the new `notaOperacional` input (label "Nota operacional — sem dados de saúde", max 200, saved via `api.put('/clientes/:id')`; the legacy `observacoes` textarea stays untouched); reuse the F05 send button (relabel to "Enviar ficha de consentimento" if needed).
9. **Lead-closing** — In `src/components/FunilAvaliacaoModal.jsx`: add the `notaOperacional` input (same label/guidance) persisted to the **converted** client (`PUT /clientes/:id`) and a "Enviar ficha de consentimento" button (F05) enabled once the converted client id exists.

## Phase 4 — Tests & gates
10. **Tests** — Create `tests/gdpr-estado-privacidade.test.js` covering single + batch derivation, no-clinical-content, `notaOperacional` persistence (≤200; >200 → 400) + AI-exclusion regressions (Phase 0), role gate (recepcionista allowed, status only), validation, and multi-tenant isolation, per spec §8.
11. **Gates** — Run `npm run lint` + `npm test` (backend) and `npm run build` + `npm run lint` (frontend) until green; then ready for `/implement-evaluate`.
