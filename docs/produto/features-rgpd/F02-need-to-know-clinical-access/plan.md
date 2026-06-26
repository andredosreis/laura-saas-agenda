# F02 — Need-to-Know Clinical Access Control — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 3

## Prerequisites
- Project running locally (backend per `CLAUDE.md` → Environment).
- Patterns confirmed: `src/models/AuditLog.js` (append-only + `statics.record()`), `src/models/Cliente.js` (anamnese fields, lines 68–89; tenant schema export), `src/modules/clientes/` (controller/routes/schemas + `clienteInternalRoutes.js`), `src/middlewares/{auth,validate}.js` (`req.user.role`, superadmin bypass, `requireServiceToken`).
- F01 in place (or alongside) — `AcessoClinicoLog` follows the same tenant-model + registry idiom as F01's `ConsentLog`. F02 has **no functional dependency** on F01 (PRD §8: F02 deps = None); they only share the registry file.

## Phase 1 — Model, registry & shared clinical rule
1. **AcessoClinicoLog model** — Create `src/models/AcessoClinicoLog.js` mirroring the `AuditLog` append-only idiom (`timestamps:{createdAt:true,updatedAt:false}`, `statics.record()`, indexes from spec §3 including the ~12-month TTL on `createdAt`). Export `AcessoClinicoLogSchema` (named, for registry) and a default model, as `Cliente.js` does.
2. **Register in tenant registry** — Add `AcessoClinicoLog` to `getModels(db)` in `src/models/registry.js` so it is available as `req.models.AcessoClinicoLog`.
3. **Clinical fields module** — Create `src/modules/clientes/clinicalFields.js` exporting `CLINICAL_FIELDS` (the anamnese block), `CLINICAL_ROLES = ['admin','gerente','terapeuta']`, `podeLerClinico(role)` (true for those roles or `superadmin`), and `stripClinicalFields(doc)` (returns a copy with every clinical key removed; works on plain/`.lean()` objects). Single source of truth, reused by every read path.

## Phase 2 — Enforce in clientes read paths
4. **`getCliente` gate + audit** — In `clienteController.js`, after fetching the tenant-scoped client: if `podeLerClinico(req.user.role)` return the record with clinical fields and append exactly one `AcessoClinicoLog` entry via `record()` (`clienteId`, `userId: req.user._id`, `ip: req.ip`, `origem: 'detalhe'`) — best-effort, wrapped so a logging failure never breaks the read (spec R9). Otherwise return `stripClinicalFields(record)` and write no audit.
5. **`getAllClientes` minimization** — Map the list through `stripClinicalFields` for all roles (list never serves anamnesis); no audit on list (spec R4).
6. **AI path hardening** — In `clienteInternalRoutes.js`, route any response that returns a `Cliente` document through `stripClinicalFields` as a defensive invariant and make the narrow `.select()` projections explicit, so no clinical field can reach `ia-service` (spec R5). (Note residual gap: Python `mongo_reader` direct DB access is out of scope — flag where its projection is defined.)

## Phase 3 — Tests & gates
7. **Tests** — Create `tests/clientes-clinical-access.test.js` covering acceptance (recepcionista strip, permitted-role read + exactly one audit, internal-path no clinical, append-only audit, list strip) and multi-tenant isolation + superadmin bypass + audit-failure-non-blocking, per spec §7.
8. **Gates** — Run `npm run lint` and `npm test` until green; then ready for `/implement-evaluate`.
