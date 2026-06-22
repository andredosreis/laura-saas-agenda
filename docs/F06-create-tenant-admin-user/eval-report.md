# F06 — Create Tenant + Admin User · Eval Report

**Evaluated:** 2026-06-22
**Branch:** `F06-create-tenant-admin-user`
**Evaluator:** evaluator agent (deterministic, no UI involved — F06 is a backend API endpoint)

## Summary

**5 passed · 0 failed · 0 indeterminate**

| ID | Criterion | Result |
|---|---|---|
| C1 | Atomic create | ✅ passed |
| C2 | No mass assignment | ✅ passed |
| C3 | Duplicate e-mail | ✅ passed |
| C4 | Rollback on failure | ✅ passed |
| C5 | Non-super-admin hidden | ✅ passed |

## Gates

### `npm run lint`

```
✖ 4 problems (0 errors, 4 warnings)
```

0 errors. The 4 warnings are pre-existing, in `scripts/maintenance/*.js` (unused `eslint-disable` directives). **Gate: pass.**

### `npm test` (specific suites)

All tests passed successfully, including:
- `tests/admin-tenant-create.test.js` (5/5 tests passed)
- `tests/admin-superadmin-sweep.test.js` (5/5 tests passed)

No regressions detected in the full suite test run. **Gate: pass.**

---

## Contract verification (`contract.md`)

### C1 — Atomic create
**GIVEN** a super-admin and a valid request body to `POST /api/v1/admin/tenants`
**WHEN** called successfully
**THEN** verified via `tests/admin-tenant-create.test.js` → `C1 — sucesso atómico`:
- A new `Tenant` document is created with a unique generated slug (e.g. `'salao-beleza-nova'`) and `plano.status` set to `'trial'`.
- A new admin `User` is created with role `'admin'` and `emailVerificado` set to `false`.
- Both are linked correctly (`user.tenantId` matches tenant ID, and `tenant.criadoPor` matches user ID).
- Exactly one `AuditLog` entry is committed in the same transaction with `status: 'ok'`, `action: 'tenant.create'`, and `targetTenantId`.
- The new tenant is visible in the GET `/api/v1/admin/tenants` list.

**Result: passed.**

### C2 — No mass assignment
**GIVEN** a request body containing extra server-managed properties (like `role: 'superadmin'`, `plano.status: 'ativo'`, `limites: { maxUsuarios: 9999 }`)
**WHEN** the tenant is created
**THEN** verified via `C2 — mass-assignment`:
- The Zod validation schema `criarTenantSchema` automatically strips unwhitelisted properties (since it has no `.strict()` blocker).
- The created user is assigned the default `admin` role.
- The created tenant gets the default `'trial'` status and default plan limits (`maxUsuarios = 1`).

**Result: passed.**

### C3 — Duplicate e-mail
**GIVEN** an `adminEmail` that is already registered globally in another tenant
**WHEN** a POST request is made to create a new tenant with that email
**THEN** verified via `C3 — e-mail duplicado`:
- The server returns `409 Conflict` with the error message `"Este email já está registrado"`.
- No new `Tenant` or `User` is created.

**Result: passed.**

### C4 — Rollback on failure
**GIVEN** a database failure during user creation (e.g., user creation throws an error)
**WHEN** the tenant creation is attempted
**THEN** verified via `C4 — rollback em falha`:
- The database transaction rolls back completely (aborts), leaving no orphan `Tenant` or `User` records in the database.
- An `AuditLog` entry with `status: 'error'` is registered with the failure message.

**Result: passed.**

### C5 — Non-super-admin hidden
**GIVEN** a non-super-admin user token (e.g. `recepcionista` or `admin`)
**WHEN** a request is made to `POST /api/v1/admin/tenants`
**THEN** verified via `C5 — não-superadmin` and the dynamic sweep check:
- The route returns `404 Not Found` to hide the existence of the endpoint.

**Result: passed.**

---

## Files involved

- `src/models/User.js` (modified `User.createWithPassword` to support mongoose options safely)
- `src/modules/admin/adminSchemas.js` (new - Zod schema for input validation)
- `src/modules/admin/adminController.js` (modified - added `criarTenant` handler)
- `src/modules/admin/adminRoutes.js` (modified - added `POST /tenants` endpoint)
- `tests/admin-tenant-create.test.js` (new - unit tests for F06)
- `docs/PRDProgress.json` (modified - updated F06 status to "Implemented")

## Pending manual checks

None. F06 is a backend-only feature with no UI components, so no manual user verification or screenshots are required. All criteria are fully covered by automated regression tests.

## Verdict

**F06 is DONE.** All automated quality gates are passing, and all contract criteria have been verified with concrete automated test evidence.
