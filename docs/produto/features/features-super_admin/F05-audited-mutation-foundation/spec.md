# F05 — Audited Mutation Foundation · Spec

## Component Overview
- `src/modules/admin/adminMutation.js` (**NEW**) — the `adminMutation(action, work)` factory used by every panel write.
- Reuses (already implemented): `src/models/AuditLog.js` (append-only audit, registered on the default `laura-saas` connection), `src/modules/admin/auditMiddleware.js` (initialises `req.audit`, reads `req.audit.committed`), the default Mongoose connection (control plane).
- Lint gate already in place (`eslint.config.js`, #9): raw `router.post/put/patch/delete` inside `src/modules/admin/` is forbidden → every mutation MUST go through this factory.

## Scope
**Included:**
- A single transactional, audited mutation wrapper for all panel writes.
- Atomic write of the change **and** its `AuditLog` entry in the same session/transaction.
- Failed-mutation audit trail (`status:'error'`, best-effort, outside the transaction).
- Coordination with `auditMiddleware` via `req.audit.committed` (no duplicate read entry).
- Test infrastructure for transactions (replica-set in-memory Mongo).

**Deferred / Out of scope:**
- Concrete mutation endpoints (F06/F07/F08 consume this factory).
- Cross-database (`tenant_<id>`) mutations — panel mutations are control-plane only.
- The append-only Atlas per-collection credential (infra; verified in staging, not in CI).

## Requirements / Business Rules
- `adminMutation(action, work)` returns an Express handler.
- It opens a session on the default connection (`mongoose.startSession()`), runs `session.withTransaction`, calls `work(req, { session })` which returns `{ data, targetTenantId, targetResourceId?, before?, after? }`, then writes the `AuditLog` entry with the **same** `session`.
- Success: set `req.audit.committed = true`; respond `{ success: true, data }`.
- Failure: best-effort `AuditLog` entry `status:'error'` **outside** the transaction; set `req.audit.committed = true`; call `next(err)`.
- `work` performs ONLY database operations (`withTransaction` may retry the callback); external side-effects (e.g. e-mail) run outside the transaction and must be idempotent.
- Mutations are restricted to the control plane (`laura-saas`): `Tenant`, `User`, `UserSubscription`.
- `before`/`after` are GDPR-minimal diffs (only changed fields / created-doc summary).

## API Contracts
F05 exposes no HTTP endpoint of its own. Its contract is the factory signature and the `work` return shape (above). Consumers mount routes as `router.post('/tenants/:id/suspender', adminMutation('tenant.suspend', work))`.

## Data Model
No new model. Uses the existing `AuditLog`: `actorUserId`, `actorEmail`, `action`, `targetTenantId`, `before`, `after`, `status` (`ok`|`denied`|`error`), `metadata`, `ip`, `createdAt`. Transactional write: `AuditLog.create([{ ... }], { session })`. (`AuditLog.record(...)` stays the best-effort path used by reads/denials/errors.)

## Error Handling
- `work` throws (validation/business error) → transaction rolls back → best-effort `status:'error'` audit → `next(err)` → existing error middleware returns the appropriate status.
- The `AuditLog` write fails **inside** the transaction → the whole transaction rolls back; the change does NOT commit (atomicity guarantee).
- Mongo unreachable / session error → propagates to `next(err)`.

## Testing Strategy
- **Transactions require a replica set.** The shared `tests/setup.js` uses a standalone `MongoMemoryServer` (no transaction support). F05's tests spin up their own **`MongoMemoryReplSet`** (own `beforeAll`/`afterAll`), isolated from the 40+ existing suites.
- Tests:
  1. **Atomic success** — a wrapped mutation commits the change AND exactly one `status:'ok'` audit entry; the finish-middleware adds no duplicate (`req.audit.committed`).
  2. **Atomic failure** — when `work` throws, no change is committed and a `status:'error'` entry exists.
  3. **Audit-failure rollback** — if the audit write inside the transaction fails, the change is rolled back.
  4. **Lint gate** — a raw `router.post` in `admin/` fails ESLint (already covered by #9; re-asserted).
- `MONGO_TENANT_RO_URI` is not needed (F05 is control-plane only).

## Assumptions / Decisions
- **[Auto-Accept]** Factory shape and behaviour taken from the `marcai-superadmin-route` playbook (A3) and the already-implemented `auditMiddleware`/`AuditLog`.
- **[Auto-Accept]** Transaction tests use a per-file `MongoMemoryReplSet` — the shared standalone setup is left untouched to avoid disturbing the existing suite.
- **[Auto-Accept]** `AuditLog.create([...], { session })` is the transactional write path; `AuditLog.record(...)` remains the best-effort path.
- **[Flag]** The append-only Atlas per-collection credential is infra; its enforcement is proven in staging, not asserted in CI.
