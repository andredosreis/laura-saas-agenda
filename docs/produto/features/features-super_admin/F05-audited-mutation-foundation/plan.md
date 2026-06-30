# F05 — Audited Mutation Foundation · Plan

## Prerequisites
- F01 (AuditLog + auditMiddleware + adminRouter) — done.
- The "no raw `router.<verb>` in `admin/`" lint gate — done (#9).
- `mongodb-memory-server` (already a dependency) provides `MongoMemoryReplSet`.

## Phase 1 — Test infrastructure
1. **ReplSet harness** — add a per-file `MongoMemoryReplSet` setup helper for F05's transaction tests (connect in `beforeAll`, stop in `afterAll`), without changing the shared `tests/setup.js`.

## Phase 2 — The factory (TDD, red → green)
2. **Atomic success** — test: a wrapped mutation commits the change + one `status:'ok'` audit entry, with no duplicate from the finish-middleware. Implement `adminMutation` (session + `withTransaction` + `AuditLog.create([...],{session})` + `req.audit.committed`).
3. **Failure path** — test: `work` throws → no change committed + best-effort `status:'error'` entry. Implement the catch block (error audit outside the txn + `next(err)`).
4. **Audit-failure rollback** — test: forcing the audit insert to fail rolls back the change. Confirm the audit write sits inside the transaction.

## Phase 3 — Verify
5. **Gates** — `npm run lint` + `npm test` green; confirm the lint gate still rejects raw `router.<verb>` in `admin/`.
6. **Track** — set F05 `status: "Implemented"` in `docs/produto/PRDProgress.json`.
