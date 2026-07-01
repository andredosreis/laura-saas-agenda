# F01 — Consent Logging Foundation — Plan

**Spec:** `./spec.md` · **Complexity:** simple · **Phases:** 3

## Prerequisites
- Project running locally (backend per `CLAUDE.md` → Environment).
- Patterns confirmed: `src/models/AuditLog.js` (append-only), `src/models/Cliente.js` (tenant schema export), `src/modules/clientes/` (module layout), `src/middlewares/{auth,validate}.js`.
- No feature dependencies (F01 is the Foundation of this PRD).

## Phase 1 — Model & registry
1. **ConsentLog model** — Create `src/models/ConsentLog.js` mirroring the `AuditLog` append-only idiom (`timestamps:{createdAt:true,updatedAt:false}`, `statics.record()`, indexes from spec §3). Export `ConsentLogSchema` (named, for registry) and a default model, as `Cliente.js` does.
2. **Register in tenant registry** — Add `ConsentLog` to `getModels(db)` in `src/models/registry.js` so it is available as `req.models.ConsentLog`.

## Phase 2 — gdpr module (API)
3. **Policy version** — Create `src/modules/gdpr/policyVersion.js` exporting the current `POLICY_VERSION` constant.
4. **Validation schemas** — Create `src/modules/gdpr/gdprSchemas.js` with Zod `registarConsentimentoSchema` (body) and `consentQuerySchema` (query: clienteId + pagination), following `clienteSchemas.js`.
5. **Controller** — Create `src/modules/gdpr/gdprController.js` with `registarConsentimento` (validate client exists in tenant, stamp version/registadoPor/ip, append via `ConsentLog.record`) and `historicoConsentimento` (tenant-scoped paginated history), per spec §4–§6.
6. **Routes** — Create `src/modules/gdpr/gdprRoutes.js`: `router.use(authenticate)`; `POST /consent` (validate body) for any staff; `GET /consent` with `authorize('admin','gerente')` + query validate.
7. **Mount** — Add `['/gdpr', gdprRoutes]` to the `apiResources` array in `src/app.js` (gets dual-mount automatically).

## Phase 3 — Tests & gates
8. **Tests** — Create `tests/gdpr-consent.test.js` covering acceptance (record, immutability, pagination, validation, server-set fields) and multi-tenant isolation + role gate, per spec §7.
9. **Gates** — Run `npm run lint` and `npm test` until green; then ready for `/implement-evaluate`.
