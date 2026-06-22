# F08 — Suspend / Reactivate Tenant · Contract (GWT)

## C1 — Suspend
- **GIVEN** a super-admin and an active tenant
- **WHEN** `POST /api/v1/admin/tenants/:id/suspender` with `{ motivo }`
- **THEN** the tenant's `plano.status` becomes `suspenso` AND one `tenant.suspend` audit entry exists with the previous/new status and `motivo` in metadata.

## C2 — Suspension blocks the tenant (reuses requirePlan)
- **GIVEN** a tenant just suspended
- **WHEN** one of its staff calls a normal product route with their token
- **THEN** they get 403 (existing `requirePlan` enforcement), while the super-admin can still manage the tenant.

## C3 — Reactivate
- **GIVEN** a suspended tenant
- **WHEN** `POST /api/v1/admin/tenants/:id/reactivar`
- **THEN** the tenant's `plano.status` becomes `ativo`, its staff regain product access, and one `tenant.reactivate` audit entry exists.

## C4 — Idempotent
- **GIVEN** an already-suspended tenant
- **WHEN** suspend is called again
- **THEN** it succeeds, the status stays `suspenso`, and the action is still audited.

## C5 — Not found / hidden
- **GIVEN** an invalid id, a non-existent tenant, or a non-super-admin token
- **WHEN** the endpoint is called
- **THEN** it returns 400, 404, or 404 respectively.

## Prerequisites (the evaluator must ensure these exist)
- F05 `adminMutation` + `MongoMemoryReplSet` test environment.
- The existing `requirePlan` middleware (unchanged).
