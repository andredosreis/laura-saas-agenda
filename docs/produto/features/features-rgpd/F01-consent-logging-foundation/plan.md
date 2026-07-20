# F01 — Consent Logging Foundation — Plan

**Spec:** `./spec.md` · **Complexity:** simple · **Phases:** 3

## Prerequisites
- Project running locally (backend per `CLAUDE.md` → Environment).
- Patterns confirmed: `src/models/AuditLog.js` (append-only), `src/models/Cliente.js` (tenant schema export), `src/modules/clientes/` (module layout), `src/middlewares/{auth,validate}.js`.
- No feature dependencies (F01 is the Foundation of this PRD).

## Phase 1 — Models & registry
1. **ConsentLog model (v2)** — Create `src/models/ConsentLog.js` mirroring the `AuditLog` append-only idiom (`timestamps:{createdAt:true,updatedAt:false}`, `statics.record()`, indexes from spec §3), with the R7 proof fields: `actor` (titular|funcionario), `evidencia`, `textoHash`, `fichaTokenId`; `tipo` enum **without** `politica_privacidade`. Export `ConsentLogSchema` (named, for registry) and a default model, as `Cliente.js` does.
2. **NoticeReceipt model** — Create `src/models/NoticeReceipt.js` (R7): append-only, `statics.record()`, fields `clienteId`/`versao`/`textoHash`/`canal`/`ip` + index from spec §3. No routes; written by F04.
3. **Register in tenant registry** — Add `ConsentLog` and `NoticeReceipt` to `getModels(db)` in `src/models/registry.js` so they are available as `req.models.*`.

## Phase 2 — gdpr module (API)
4. **Policy version** — Create `src/modules/gdpr/policyVersion.js` exporting the current `POLICY_VERSION` constant + a `noticeHash()` helper (sha256 of the current notice text — used as `textoHash` on staff entries; F04 replaces the input with the actually-served text).
5. **Validation schemas** — Create `src/modules/gdpr/gdprSchemas.js` with Zod `registarConsentimentoSchema` (body: `clienteId`, `tipo` — enum **sem** `politica_privacidade` (R7) — `accao`, `origem`, `evidencia?`; **no `versao`/`actor`/`textoHash`**, all server-derived (R6/R7); `.superRefine`: `accao === 'granted'` requires `evidencia` on this staff path — R7/R8) and `consentQuerySchema` (query: clienteId + pagination), following `clienteSchemas.js`.
6. **Controller** — Create `src/modules/gdpr/gdprController.js` with `registarConsentimento` (validate client exists in tenant; stamp `POLICY_VERSION`/`textoHash`/`registadoPor`/`ip`/`actor: 'funcionario'` — all server-derived, R6/R7 — append via `ConsentLog.record`) and `historicoConsentimento` (tenant-scoped paginated history), per spec §4–§6.
7. **Routes** — Create `src/modules/gdpr/gdprRoutes.js`: `router.use(authenticate)`; `POST /consent` (validate body) for any staff; `GET /consent` with `authorize('admin','gerente')` + query validate.
8. **Mount** — Add `['/gdpr', gdprRoutes]` to the `apiResources` array in `src/app.js` (gets dual-mount automatically).

## Phase 3 — Tests & gates
9. **Tests** — Create `tests/gdpr-consent.test.js` covering acceptance (record incl. `actor`/`textoHash` server-set, staff-grant-requires-`evidencia` (400/201), `politica_privacidade` → 400, immutability, pagination, validation, server-set fields) plus `NoticeReceipt` model-level assertions (record works, no routes), and multi-tenant isolation + role gate, per spec §7.
10. **Gates** — Run `npm run lint` and `npm test` until green; then ready for `/implement-evaluate`.
