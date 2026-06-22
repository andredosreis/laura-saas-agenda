# F07 — Configure Tenant Plan, Limits & Feature Flags · Contract (GWT)

## C1 — Update plan type/expiry
- **GIVEN** a super-admin and an existing tenant
- **WHEN** `PUT /api/v1/admin/tenants/:id/plano` with `{ tipo, dataExpiracao }`
- **THEN** the tenant's `plano.tipo`/`plano.dataExpiracao` are updated AND one `tenant.plano.update` audit entry exists with a `before/after` of only those fields.

## C2 — Update limits & flags
- **GIVEN** a super-admin and an existing tenant
- **WHEN** `PUT /api/v1/admin/tenants/:id/limites` with limit numbers and/or flags
- **THEN** the tenant's `limites` are updated AND one `tenant.limites.update` audit entry exists with the minimal diff.

## C3 — Validation
- **GIVEN** an out-of-enum `tipo`, a limit `< -1`, or a non-boolean flag
- **WHEN** the corresponding endpoint is called
- **THEN** it returns 400 naming the offending field and changes nothing.

## C4 — No mass assignment / no status change
- **GIVEN** a body that also includes `plano.status`, `tenantId`, or other non-whitelisted keys
- **WHEN** the endpoint is called
- **THEN** those keys are ignored — in particular `plano.status` is NOT changed by F07.

## C5 — Not found / hidden
- **GIVEN** an invalid id, a non-existent tenant, or a non-super-admin token
- **WHEN** the endpoint is called
- **THEN** it returns 400 (invalid id), 404 (non-existent), or 404 (non-super-admin) respectively.

## Prerequisites (the evaluator must ensure these exist)
- F05 `adminMutation` + `MongoMemoryReplSet` test environment.
