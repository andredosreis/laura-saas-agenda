# F07 — Data Subject Erasure & Anonymization — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 3

## Prerequisites
- Project running locally (backend per `CLAUDE.md` → Environment).
- **F01 implemented**: `src/modules/gdpr/` exists (controller + routes + schemas mounted via `apiResources`), `src/models/ConsentLog.js` with `ConsentLog.record()` is registered in `src/models/registry.js`.
- Patterns confirmed: `src/models/Cliente.js` (PII + anamnese fields, `{tenantId, telefone}` unique index), `src/models/{Transacao,Pagamento}.js` (fiscal — preserved), `src/middlewares/{auth,validate}.js`.

## Phase 1 — Model fields
1. **Cliente fields** — Add `anonimizado` (Boolean, default false), `pendingDeletion` (Boolean, default false), `deletionRequestedAt` (Date, default null) to `clienteSchema` in `src/models/Cliente.js`. No index/backfill needed (F08 adds the grace-query index later).

## Phase 2 — Service + API (extend gdpr module)
2. **Grace config** — Create `src/modules/gdpr/gdprConfig.js` exporting `GRACE_PERIOD_DAYS = 30` (consumed by F08).
3. **Anonymization service** — Create `src/modules/gdpr/gdprService.js` with `anonimizarCliente(models, tenantId, clienteId)`: load `Cliente` by `{ _id, tenantId }`; if missing → return null (404 upstream); if already `anonimizado` → return it (idempotent no-op); else replace PII + ALL anamnese/clinical fields with anonymized tokens/empty (`telefone = 'ANON-' + clienteId`, `email = null`, etc., per spec §3), clear `historicoMensagens`, set `anonimizado = true`, `pendingDeletion = false`; scrub `Pagamento.dadosMBWay.telefone` for that client; **never** delete/alter fiscal amounts on `Transacao`/`Pagamento`. Return the updated client. **This function is Provided to F08.**
4. **Validation schema** — Add `apagarClienteSchema` (body `{ confirmar?: boolean }`, default false) to `src/modules/gdpr/gdprSchemas.js`.
5. **Controller** — Add `apagarCliente` to `src/modules/gdpr/gdprController.js`: validate ObjectId (400) and client exists in tenant (404); append `ConsentLog (accao: 'withdrawn', tipo: 'politica_privacidade', origem: 'painel')` via `ConsentLog.record()` (server-set tenantId/registadoPor/ip); if `confirmar` → call `anonimizarCliente` (path a); else set `pendingDeletion = true`, `deletionRequestedAt = now` (path b). Return the relevant flags per spec §4.
6. **Route** — Add `POST /clientes/:id/apagar` to `src/modules/gdpr/gdprRoutes.js` with `authorize('admin')` + `validate(apagarClienteSchema)`. (Router already dual-mounted via the F01 `['/gdpr', gdprRoutes]` entry in `src/app.js`.)

## Phase 3 — Tests & gates
7. **Tests** — Create `tests/gdpr-erasure.test.js` covering acceptance (grace path flags + `withdrawn` entry, immediate `confirmar` anonymize, PII/clinical cleared, fiscal preserved + no hard-delete, 400/404), service-level (idempotent, unique-telefone), and multi-tenant isolation + admin-only role gate, per spec §7.
8. **Gates** — Run `npm run lint` and `npm test` until green; then ready for `/implement-evaluate`.
