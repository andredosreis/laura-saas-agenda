# F09 — Communications Consent Capture — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 3

> Consolidated 2026-07-20 with [../RECONCILIATION.md](../RECONCILIATION.md) R8 — the previous plan had staff granting consent via a booking checkbox in `CriarAgendamento.jsx`; that is superseded. The titular grant lives on the F04 form; F09's panel does withdrawals + evidence-backed assisted grants.

## Prerequisites
- **F01 implemented and merged (v2, R7)** — hard dependency: `src/modules/gdpr/` exists with `ConsentLog` (incl. `actor`/`evidencia`/`textoHash`), the `evidencia`-required-on-staff-grant rule (F01 R8), `POST /gdpr/consent`, `GET /gdpr/consent`, the `estadoAtual` helper, `POLICY_VERSION`, and dual-mount in `src/app.js`. F09 extends, never re-creates, these.
- F04 is **not** a build dependency (the form checkboxes are owned by F04), but the panel UI references "Enviar ficha" (F05) — render that affordance only when F05 exists.
- Project running locally (backend per `CLAUDE.md` → Environment); frontend per `CLAUDE.md`.
- Patterns confirmed: `src/middlewares/{auth,validate}.js`; `laura-saas-frontend/src/services/api.js`; `EditarCliente.jsx` (tabs idiom, `Dados do Cliente` tab).

## Phase 1 — Backend: current-state derivation read
1. **Schema** — In `src/modules/gdpr/gdprSchemas.js`, add `consentEstadoParamsSchema` validating `:id` as a Mongoose ObjectId (mirror F01's clienteId validation).
2. **Controller** — In `src/modules/gdpr/gdprController.js`, add `estadoComunicacoes`: validate the client exists in `req.tenantId` (404 otherwise); call **F01's `estadoAtual` helper** (R3 — no re-implementation) and expose only the comms slice, including each latest entry's `actor` (R8 — so the UI can label assisted grants); fill missing types with `{ estado: 'pendente', data: null, versao: null, actor: null }`. Return the `{ whatsapp_optin, marketing }` shape (spec §4).
3. **Route** — In `src/modules/gdpr/gdprRoutes.js`, add `GET /clientes/:id/consent-estado` with `authorize('admin','gerente')` + `validate(consentEstadoParamsSchema, 'params')`. No new mount needed (F01 already dual-mounts `/gdpr`).

## Phase 2 — Frontend: panel section (withdrawals + assisted grants)
4. **EditarCliente.jsx** — In the `Dados do Cliente` tab, add a "Comunicações" section with two independent toggles (WhatsApp opt-in, Marketing), per R8:
   - On mount, `api.get('/gdpr/clientes/:id/consent-estado')` to initialise (`granted`→on, `withdrawn`/`pendente`→off); show a **"declaração assistida"** badge when the granted state's `actor === 'funcionario'`.
   - Toggling **off** → `api.post('/gdpr/consent', { clienteId, tipo, accao: 'withdrawn', origem: 'painel' })` immediately (no modal), then refresh + toast.
   - Toggling **on** → open a confirmation modal requiring the `evidencia` text ("Que evidência suporta este consentimento?"); only then `api.post('/gdpr/consent', { clienteId, tipo, accao: 'granted', origem: 'painel', evidencia })`; cancel closes with no write. Surface the 400 (missing evidencia) inline.
   - Show an inline hint that the recommended grant path is the client's own form, with an **"Enviar ficha"** affordance (F05's endpoint) when available. Reflect-don't-substitute: state always comes from the backend derivation.

## Phase 3 — Tests & gates
5. **Tests** — Create `tests/gdpr-consent-comunicacoes.test.js` covering acceptance (assisted grant with `evidencia` → 201 + `actor: 'funcionario'`; grant without `evidencia` → 400 no entry; latest-per-type derivation incl. `actor`; immediate withdrawal without evidence; withdrawal-without-prior; granularity; 400/404), the cross-feature POLICY_VERSION stamp, and multi-tenant isolation + role gate, per spec §7.
6. **Gates** — Run `npm run lint` + `npm test` (backend) and `cd laura-saas-frontend && npm run lint && npm run build` until green; then ready for `/implement-evaluate`.
