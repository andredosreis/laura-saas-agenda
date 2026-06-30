# F10 — Privacy Status & Note on Appointment — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 4

## Prerequisites
- Project running locally (backend + frontend per `CLAUDE.md` → Environment).
- **F01 done:** `ConsentLog` model + `{ tenantId:1, tipo:1, createdAt:-1 }` index (latest-by-type), `gdpr` module scaffolding.
- **F04 done:** `FichaToken` model with `status` lifecycle (`ativo`/`usado`/`revogado`) registered in `registry.js`.
- **F05 done:** `POST /gdpr/clientes/:id/enviar-ficha` + the "Enviar ficha…" button on `EditarCliente.jsx`.
- Patterns confirmed: `src/modules/gdpr/{gdprController,gdprRoutes,gdprSchemas}.js`, F09's `consent-estado` derivation idiom, `src/middlewares/{auth,validate}.js`; frontend `Agendamentos.jsx` (card + status-pill), `AppointmentDetailModal.jsx`, `EditarCliente.jsx` (Dados tab + `observacoes`), `FunilAvaliacaoModal.jsx` (lead-closing), `services/api.js`, `contexts/AuthContext`.

## Phase 1 — Backend read endpoints (status derivation)
1. **Schemas** — In `src/modules/gdpr/gdprSchemas.js` add `estadoPrivacidadeParamsSchema` (`:id` ObjectId) and `estadoPrivacidadeQuerySchema` (`clienteIds` CSV → array, ≤100, each ObjectId), following `clienteSchemas.js`/F09.
2. **Controller** — In `src/modules/gdpr/gdprController.js` add `estadoPrivacidade` (single) and `estadoPrivacidadeBatch` (map). Derive, tenant-scoped: `consentimentoSaude` from the latest `dados_saude` `ConsentLog` (aggregation `$sort`+`$group`+`$first`, or `findOne` sorted desc for single); `fichaPreenchida`/`fichaEnviada` from `FichaToken` (`usado` → filled; else `ativo` → sent). Run the two queries with `Promise.all` (no `await` in loop). Single validates the client exists in tenant (404); batch silently omits unknown/cross-tenant ids. **Return no clinical fields.**
3. **Routes** — In `src/modules/gdpr/gdprRoutes.js` add `GET /clientes/:id/estado-privacidade` and `GET /estado-privacidade`, both `authorize('admin','gerente','recepcionista','terapeuta')` + validate. (Dual-mount is inherited from F01's `apiResources` entry.)

## Phase 2 — Reusable frontend status UI
4. **Badge component** — Create `laura-saas-frontend/src/components/PrivacyStatusBadge.tsx` (pure, typed props `{ fichaPreenchida, fichaEnviada, consentimentoSaude, size? }`): ✓ preenchida / ⏳ pendente pill, "ficha por preencher" alert when pending, consent indicator (Dado a DD-MM-AAAA / Pendente / Retirado via luxon). Design system; **no clinical content**.
5. **Status hook** — Create `laura-saas-frontend/src/hooks/usePrivacyStatus.ts` with `usePrivacyStatus(clienteIds[])` (batch → `api.get('/gdpr/estado-privacidade?clienteIds=...')`, deduped) and `usePrivacyStatusOne(clienteId)` (single). Loading/error states; failures degrade gracefully (no throw to the page).

## Phase 3 — Wire the badge + note into the appointment surfaces
6. **Agenda** — In `laura-saas-frontend/src/pages/Agendamentos.jsx`: after appointments load, collect unique `cliente._id`s (skip lead-only), call `usePrivacyStatus` once, render `<PrivacyStatusBadge>` + `ag.cliente.observacoes` on each client card/row.
7. **Detail modal** — In `src/components/AppointmentDetailModal.jsx`: render `<PrivacyStatusBadge>` (single read) + note for client appointments; surface the F05 "Enviar ficha de consentimento" action.
8. **Client record** — In `laura-saas-frontend/src/pages/EditarCliente.jsx` (Dados tab): show `<PrivacyStatusBadge>` near the existing `observacoes` textarea (save path already exists); reuse the F05 send button (relabel to "Enviar ficha de consentimento" if needed).
9. **Lead-closing** — In `src/components/FunilAvaliacaoModal.jsx`: add a free-text observation persisted to the **converted** client's `Cliente.observacoes` (`PUT /clientes/:id`) and a "Enviar ficha de consentimento" button (F05) enabled once the converted client id exists.

## Phase 4 — Tests & gates
10. **Tests** — Create `tests/gdpr-estado-privacidade.test.js` covering single + batch derivation, no-clinical-content, role gate (recepcionista allowed, status only), validation, and multi-tenant isolation, per spec §8.
11. **Gates** — Run `npm run lint` + `npm test` (backend) and `npm run build` + `npm run lint` (frontend) until green; then ready for `/implement-evaluate`.
