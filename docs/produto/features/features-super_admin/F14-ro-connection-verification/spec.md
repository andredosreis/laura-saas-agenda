# F14 — Read-Only Connection Runtime Verification · Spec

Gate 4b (`getTenantDBAdmin`) is only as strong as the credential behind `MONGO_TENANT_RO_URI`. If that env var is (mis)configured with a read-write credential, the panel silently becomes able to write into tenant databases and nothing detects it (`tests/admin-tenant-uso.test.js:13-16` admits this is unverified). This feature adds a runtime canary that proves the credential is read-only — and fails closed if it is not.

## Mandatory reading
- `src/modules/admin/getTenantDBAdmin.js` (entire file — it is small and the contract lives in its docblock)
- `src/server.js` (startup sequence)
- `tests/admin-getTenantDBAdmin.test.js` (existing fail-closed test)

## Component Overview
- `src/modules/admin/getTenantDBAdmin.js` — new exported `verifyTenantROEnforcement()`, new module-level `roCompromised` flag consulted by `getTenantDBAdmin()`.
- `src/server.js` — call `verifyTenantROEnforcement()` once after the main DB connect, when `MONGO_TENANT_RO_URI` is set and `NODE_ENV !== 'test'`.

## Scope
**Included:** startup canary write, fail-closed flag, loud logging + Sentry.
**Out of scope:** crashing the whole backend (tenants must keep working even if the admin RO credential is broken), periodic re-verification, Atlas role provisioning docs.

## Requirements / Business Rules
- `verifyTenantROEnforcement()`:
  1. Opens (or reuses) the RO connection, targets a **sentinel namespace** that no tenant uses: `useDb('tenant_ro_canary')`, collection `ro_canary`.
  2. Attempts `insertOne({ canary: true, at: new Date() })` via the native driver (`db.collection(...)`).
  3. **Expected outcome: the insert THROWS an authorization error** (Mongo "not authorized on ... to execute command insert"). That proves the credential is read-only → resolve, log `info` ("Gate 4b verificado: credencial RO recusa escrita").
  4. **If the insert SUCCEEDS**: the credential is writable — Gate 4b is compromised. Best-effort delete the canary doc, set `roCompromised = true`, log `error` via the project logger, `Sentry.captureException` (Sentry usage pattern: see `src/server.js` / existing `@sentry/node` wiring; it degrades gracefully when unconfigured).
  5. Distinguish auth errors from connectivity errors: a network/timeout failure must NOT mark the credential as verified — log `warn` and leave `roCompromised = false` (the existing fail-closed throw on missing URI still governs; connectivity issues will surface on first real use).
- `getTenantDBAdmin(tenantId)`: if `roCompromised === true`, throw `new Error('MONGO_TENANT_RO_URI tem permissões de escrita — Gate 4b comprometido; painel recusa leituras cross-tenant.')`. The `/tenants/:id/uso` route then 500s with a generic message (existing error handling), which is the fail-closed behaviour we want.
- Export a test-only `_resetROState()` (or accept the connection/flag reset via `closeTenantDBAdmin()`) so tests can exercise both paths.
- Document the required Atlas setup in the module docblock: a dedicated DB user with the built-in `read` role on `tenant_*` databases only.

## API Contracts
No new routes. Behavioural change: with a compromised credential, `GET /admin/tenants/:id/uso` → `500 { success:false, error:'Erro interno' }` (and an `AuditLog` `status:'error'` read entry via the existing middleware).

## Data Model
None (the canary namespace `tenant_ro_canary` is never created when the credential is correct — the insert is refused before any write).

## Error Handling
- Writable credential → refuse all cross-tenant reads (throw in `getTenantDBAdmin`), loud log + Sentry once at startup.
- Missing URI → existing behaviour (throw on first use) unchanged.
- Connectivity error during verification → warn, do not block.

## Testing Strategy
- Extend `tests/admin-getTenantDBAdmin.test.js` (memory-server is RW by nature — perfect for the compromised path):
  1. Point `MONGO_TENANT_RO_URI` at the memory server → `verifyTenantROEnforcement()` detects the successful write → subsequent `getTenantDBAdmin()` throws the Gate-4b error; the canary document is cleaned up.
  2. Simulate the healthy path: stub the insert to reject with an error whose message/code matches Mongo's not-authorized shape (e.g. `codeName: 'Unauthorized'`/code 13) → verification resolves and `getTenantDBAdmin()` works.
  3. Simulate a network error (insert rejects with `MongoNetworkError`-like) → verification warns, does not mark compromised.
  4. Existing fail-closed test (missing URI) still passes.
- Route-level: in `tests/admin-tenant-uso.test.js`, add one case — after forcing the compromised state, `GET /admin/tenants/:id/uso` → 500 with contract body. Update its lines 13-16 comment: the RO enforcement is now runtime-verified.

## Assumptions / Decisions
- **[Key]** Fail-closed but not fatal: a broken admin credential must never take the product down for tenants — only the admin cross-tenant reads are refused.
- **[Auto-Accept]** Startup-only verification (no periodic recheck): the credential can only change with a deploy/env edit, which restarts the container.
- **[Auto-Accept]** Detection by attempting a real insert (not `connectionStatus`/`usersInfo` commands): it tests the exact thing we rely on, requires no extra privileges, and works on Atlas.
