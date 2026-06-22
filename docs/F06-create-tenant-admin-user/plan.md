# F06 — Create Tenant + Admin User · Plan

## Prerequisites
- F05 (`adminMutation`) implemented; `MongoMemoryReplSet` test harness available.
- E-mail service mockable in tests.

## Phase 1 — work + route (TDD)
1. **Atomic create** — test: `POST /admin/tenants` commits Tenant + admin User + audit atomically (replset). Implement `criarTenant` and the route via `adminMutation('tenant.create', …)`.
2. **No mass assignment** — test: `role`/`plano.status`/`limites`/`tenantId` in the body are ignored. Harden the field whitelist.
3. **Duplicate e-mail** — test: existing admin e-mail → 409, nothing created. Implement the conflict path.

## Phase 2 — e-mail + edges
4. **Verification e-mail** — send after commit, outside the transaction, mocked in tests. Test: a send failure does not roll back the creation.
5. **Rollback** — test: a failure mid-creation leaves no orphan Tenant/User and writes a `status:'error'` entry.

## Phase 3 — verify
6. **Gates** — `npm run lint` + `npm test` green; the sweep test auto-covers the new route's 404. Set F06 `status: "Implemented"` in `docs/PRDProgress.json`.
