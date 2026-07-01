# F04 — Self-Service Anamnesis & Consent Form — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 5

## Prerequisites
- **F01 implemented** — `ConsentLog` model + `ConsentLog.record()`, `src/modules/gdpr/` (router dual-mounted, `gdprSchemas.js`), and `src/modules/gdpr/policyVersion.js` (`POLICY_VERSION`) exist. F04 extends them; do not re-create the module scaffolding.
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
6. **Submit schema** — In `src/modules/gdpr/gdprSchemas.js` add `submeterFichaSchema` (Zod): allow-listed anamnese fields (spec §7) + `consentimento: z.literal(true)` with a friendly message; `.strip()`/omit unknowns.
7. **Public controller handlers** — In `fichaController.js` add `renderFicha` (GET: `FichaToken.resolver` → map reason to 410/404; return minimal `{ clienteNome, politicaVersao, campos }`) and `submeterFicha` (POST: resolve token; write allow-listed anamnese to `Cliente`; set token `usado`/`usadoEm`; append two `ConsentLog.record()` entries `dados_saude`+`politica_privacidade` `granted`/`formulario`/`POLICY_VERSION`/`ip`). Both resolve tenant DB from the token (`getTenantDB`+`getModels`), never from JWT.
8. **Public router** — Create `src/modules/gdpr/fichaRoutes.js` (NO `authenticate`): `GET /:token` → `fichaViewLimiter`, `renderFicha`; `POST /:token` → `fichaSubmitLimiter`, `validate(submeterFichaSchema)`, `submeterFicha`.
9. **Mount** — In `src/app.js` mount `app.use('/ficha', fichaRoutes)` **OUTSIDE** the `apiResources` loop (place near `/webhook`), unversioned. Do NOT add to `apiResources`.

## Phase 4 — Public frontend page
10. **Schema** — `laura-saas-frontend/src/schemas/fichaSchema.ts` mirroring the backend submit schema (consent `literal(true)`).
11. **Page** — `laura-saas-frontend/src/pages/FichaPublica.tsx`: reads `:token` from the URL, `GET {API}/ficha/:token` to render (handle 410/404 friendly states), single-page anamnese form, **non-pre-checked** consent checkbox (required), `POST {API}/ficha/:token`, confirmation screen on success. Design system (indigo/purple, slate, glass); inline field errors; loading/error states. Must NOT use `useAuth`/`api.js` interceptors that assume a JWT — use a plain fetch/axios call to the public endpoint.
12. **Route** — In `laura-saas-frontend/src/App.tsx` register `/ficha/:token` as a **public** route (outside `ProtectedLayout`), alongside `/login`, `/reset-senha/:token`.

## Phase 5 — Tests & gates
13. **Tests** — Create `tests/gdpr-ficha.test.js` covering acceptance (issue/regenerate/revoke, render validity states, consent-required, successful submit writes anamnese + two ConsentLog entries, single-use 410), isolation (cross-tenant issue → 404; tampered tenant segment → 404), and security (hash-only storage), per spec §8.
14. **Gates** — Run `npm run lint` + `npm test` (backend) and `cd laura-saas-frontend && npm run build && npm run lint` (frontend) until green; then ready for `/implement-evaluate`.
