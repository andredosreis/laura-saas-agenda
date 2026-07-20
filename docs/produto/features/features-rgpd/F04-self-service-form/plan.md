# F04 — Self-Service Anamnesis & Consent Form — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 5

## Prerequisites
- **F01 implemented (v2, Reconciliation R7)** — `ConsentLog` (with `actor`/`evidencia`/`textoHash`/`fichaTokenId`) + `NoticeReceipt` + `record()` statics, `src/modules/gdpr/` (router dual-mounted, `gdprSchemas.js`), and `src/modules/gdpr/policyVersion.js` (`POLICY_VERSION` + `noticeHash()`) exist. F04 extends them; do not re-create the module scaffolding.
- Project running locally (backend per `CLAUDE.md` → Environment); `process.env.FRONTEND_URL` set.
- Patterns confirmed: `src/models/Cliente.js` (anamnese fields), `src/config/tenantDB.js` + `src/models/registry.js` (token-driven tenant DB resolution), `src/middlewares/{auth,validate,rateLimiter}.js`, `src/app.js` (`/webhook` mounted outside `apiResources`).

## Phase 1 — FichaToken model & registry
1. **FichaToken model** — Create `src/models/FichaToken.js` per spec §3: `tokenHash` (unique), `clienteId`, `status` enum, `expiresAt`, `usadoEm`, `emitidoPor`, indexes. Add statics: `emitir({ models, tenantId, clienteId, emitidoPor })` (revokes prior `ativo`, generates `<tenantId>.<secret>`, stores `sha256(raw)`, returns the raw token) and `resolver({ models, rawToken })` (hash + find + validity check → `{ token, cliente }` or a typed reason: `expired` | `usado` | `invalid`). Export `FichaTokenSchema` (named) + default model.
2. **Register in tenant registry** — Add `FichaToken` to `getModels(db)` in `src/models/registry.js`.

## Phase 2 — Issuance endpoint (authenticated)
3. **Controller** — Add `emitirFichaToken` to a new `src/modules/gdpr/fichaController.js`: validate `:id` ObjectId, confirm `Cliente` exists in `req.tenantId` (else 404), call `FichaToken.emitir`, build `url` from `FRONTEND_URL`, return `201 { token, url, expiresAt, clienteId }`.
4. **Route** — In the existing `src/modules/gdpr/gdprRoutes.js` (already behind `authenticate`), add `POST /clientes/:id/ficha-token` with `authorize('admin','gerente','recepcionista','terapeuta')` + `validate(objectIdParamSchema,'params')`.

## Phase 3 — Public endpoints (no auth, rate-limited)
5. **Rate limiters** — In `src/middlewares/rateLimiter.js` add `fichaViewLimiter` (30/15min) and `fichaSubmitLimiter` (10/h), both `skip: isTestEnv`.
5b. **Privacy notice (Art. 13)** — Create `src/modules/gdpr/privacyNotice.js`: `NOTICE_SECTIONS` structured template (controlador+contacto, finalidades, bases legais, destinatários/sub-processadores, transferências, retenção, direitos incl. queixa à CNPD, contacto — wording placeholder pendente do jurista, matriz Q1) + `renderNotice(tenant)` → `{ texto, versao, hash }` (sha256 of the exact interpolated text).
6. **Submit schema** — In `src/modules/gdpr/gdprSchemas.js` add `submeterFichaSchema` (Zod): allow-listed anamnese fields (spec §7) + `consentimento: z.literal(true)` with a friendly message + optional `comunicacoes: { whatsapp_optin?: z.literal(true), marketing?: z.literal(true) }` (R8); `.strip()`/omit unknowns.
7. **Public controller handlers** — In `fichaController.js` add `renderFicha` (GET: `FichaToken.resolver` → map reason to 410/404; return `{ clienteNome, clinicaNome, politicaVersao, politicaHash, politicaTexto, campos }` via `renderNotice(tenant)`) and `submeterFicha` (POST, R13/R14): **atomic claim** `findOneAndUpdate({ tokenHash, status:'ativo', expiresAt:{$gt:now} } → 'usado')` (loser → 410) → **Mongo transaction** writing anamnese to `Cliente` + `ConsentLog.record()` `dados_saude` (`actor:'titular'`, `origem:'formulario'`, `textoHash: politicaHash`, `fichaTokenId`, `ip`) + one entry per ticked `comunicacoes` checkbox + `NoticeReceipt.record()` → **compensation** (token → `ativo`, alert-level log) if the transaction fails. Both handlers resolve tenant DB from the token (`getTenantDB`+`getModels`), never from JWT.
8. **Public router** — Create `src/modules/gdpr/fichaRoutes.js` (NO `authenticate`): `GET /:token` → `fichaViewLimiter`, `renderFicha`; `POST /:token` → `fichaSubmitLimiter`, `validate(submeterFichaSchema)`, `submeterFicha`.
9. **Mount** — In `src/app.js` mount `app.use('/ficha', fichaRoutes)` **OUTSIDE** the `apiResources` loop (place near `/webhook`), unversioned. Do NOT add to `apiResources`.

## Phase 4 — Public frontend page
10. **Schema** — `laura-saas-frontend/src/schemas/fichaSchema.ts` mirroring the backend submit schema (consent `literal(true)`).
11. **Page** — `laura-saas-frontend/src/pages/FichaPublica.tsx`: reads `:token` from the URL, `GET {ORIGIN}/ficha/:token` to render (handle 410/404 friendly states), shows `clinicaNome` + the **Art. 13 notice** (inline/expandable) **before** the checkboxes, single-page anamnese form, **non-pre-checked** required health-consent checkbox + two optional non-pre-checked communications checkboxes (R8), `POST {ORIGIN}/ficha/:token`, confirmation screen on success. Design system (indigo/purple, slate, glass); inline field errors; loading/error states. Must NOT use `useAuth`/`api.js` interceptors — plain fetch/axios; `{ORIGIN}` = backend origin **without** the `/api/v1` suffix (the `/ficha` routes are mounted at root — strip the suffix from `VITE_API_URL` or use a dedicated `VITE_PUBLIC_API_ORIGIN`).
12. **Route** — In `laura-saas-frontend/src/App.tsx` register `/ficha/:token` as a **public** route (outside `ProtectedLayout`), alongside `/login`, `/reset-senha/:token`.

## Phase 5 — Tests & gates
13. **Tests** — Create `tests/gdpr-ficha.test.js` (**`MongoMemoryReplSet`** — the submit transaction, R14) covering acceptance (issue/regenerate/revoke, render incl. notice+hash, consent-required, successful submit writes anamnese + `ConsentLog dados_saude` (actor titular, textoHash, fichaTokenId) + `NoticeReceipt` + comms entries when ticked, single-use 410, concurrent race R13, compensation R14), isolation (cross-tenant issue → 404; tampered tenant segment → 404), and security (hash-only storage), per spec §8.
14. **Gates** — Run `npm run lint` + `npm test` (backend) and `cd laura-saas-frontend && npm run build && npm run lint` (frontend) until green; then ready for `/implement-evaluate`.
