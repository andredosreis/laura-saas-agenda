# F09 — Communications Consent Capture — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 4

## Prerequisites
- **F01 implemented and merged** (hard dependency): `src/modules/gdpr/` exists with `ConsentLog`, `POST /gdpr/consent`, `GET /gdpr/consent`, `POLICY_VERSION`, and dual-mount in `src/app.js`. F09 extends, never re-creates, these.
- Project running locally (backend per `CLAUDE.md` → Environment); frontend per `CLAUDE.md`.
- Patterns confirmed: `src/middlewares/{auth,validate}.js`; `laura-saas-frontend/src/services/api.js`; `EditarCliente.jsx` (tabs idiom, `Dados do Cliente` tab) and `CriarAgendamento.jsx` (booking form + `clienteSelecionado`).

## Phase 1 — Backend: current-state derivation read
1. **Schema** — In `src/modules/gdpr/gdprSchemas.js`, add `consentEstadoParamsSchema` validating `:id` as a Mongoose ObjectId (mirror F01's clienteId validation).
2. **Controller** — In `src/modules/gdpr/gdprController.js`, add `estadoComunicacoes`: validate the client exists in `req.tenantId` (404 otherwise); query `ConsentLog` for the client filtered to `tipo ∈ {whatsapp_optin, marketing}`, sorted `createdAt: -1`; reduce to the latest entry per type (or aggregation `$sort`+`$group`+`$first`); map `accao→estado`, fill missing types with `{ estado: 'pendente', data: null, versao: null }`. Return the `{ whatsapp_optin, marketing }` shape (spec §4).
3. **Route** — In `src/modules/gdpr/gdprRoutes.js`, add `GET /clientes/:id/consent-estado` with `authorize('admin','gerente')` + `validate(consentEstadoParamsSchema, 'params')`. No new mount needed (F01 already dual-mounts `/gdpr`).

## Phase 2 — Frontend: booking opt-in checkbox
4. **CriarAgendamento.jsx** — Add a non-pre-checked checkbox ("Aceito receber comunicações por WhatsApp / marketing", off by default) in the booking form, using the design system. On successful booking, when ticked, call `api.post('/gdpr/consent', { clienteId, tipo, accao: 'granted', origem: 'booking' })` for each ticked type (`whatsapp_optin` and/or `marketing`). Consent recording is best-effort: a failure shows a toast but does not roll back the appointment.

## Phase 3 — Frontend: record opt-out toggle
5. **EditarCliente.jsx** — In the `Dados do Cliente` tab, add a "Comunicações" section with two independent toggles (WhatsApp opt-in, Marketing). On mount, `api.get('/gdpr/clientes/:id/consent-estado')` to initialise toggle states (`granted`→on, `withdrawn`/`pendente`→off). On change, `api.post('/gdpr/consent', { clienteId, tipo, accao: on?'granted':'withdrawn', origem: 'painel' })`, then refresh state and toast. Reflect-don't-substitute: state always comes from the backend derivation.

## Phase 4 — Tests & gates
6. **Tests** — Create `tests/gdpr-consent-comunicacoes.test.js` covering acceptance (opt-in write + stamped version, latest-per-type derivation, immediate withdrawal, withdrawal-without-prior, granularity, 400/404), the cross-feature POLICY_VERSION stamp, and multi-tenant isolation + role gate, per spec §7.
7. **Gates** — Run `npm run lint` + `npm test` (backend) and `cd laura-saas-frontend && npm run lint && npm run build` until green; then ready for `/implement-evaluate`.
