# F06 — Create Tenant + Admin User · Contract (GWT)

## C1 — Atomic create
- **GIVEN** a super-admin and a valid body
- **WHEN** `POST /api/v1/admin/tenants`
- **THEN** a `Tenant` and an admin `User` (role `admin`) are committed together, and one `tenant.create` `AuditLog` entry exists with the created tenant id
- **AND** the new tenant appears in `GET /admin/tenants` (F02).

## C2 — No mass assignment
- **GIVEN** a body that also includes `role` / `plano.status` / `limites` / `tenantId`
- **WHEN** the tenant is created
- **THEN** those server-managed fields take the server defaults, not the body values.

## C3 — Duplicate e-mail
- **GIVEN** an `adminEmail` already registered globally
- **WHEN** `POST /api/v1/admin/tenants`
- **THEN** it returns 409 and creates no `Tenant` or `User`.

## C4 — Rollback on failure
- **GIVEN** a failure during creation (e.g. user creation throws)
- **WHEN** `POST /api/v1/admin/tenants`
- **THEN** neither the `Tenant` nor the `User` is committed (no orphan) and a `status:'error'` audit entry exists.

## C5 — Non-super-admin hidden
- **GIVEN** a non-super-admin token
- **WHEN** `POST /api/v1/admin/tenants`
- **THEN** it returns 404 (covered by the sweep test).

## Prerequisites (the evaluator must ensure these exist)
- F05 `adminMutation` + `MongoMemoryReplSet` test environment.
- The e-mail service mocked in tests.
