# F06 — Create Tenant + Admin User · Spec

## Component Overview
- `src/modules/admin/adminController.js` — add `criarTenant` (the `work` for the mutation).
- `src/modules/admin/adminRoutes.js` — `router.post('/tenants', adminMutation('tenant.create', criarTenant))`.
- Depends on **F05** (`adminMutation`). Reuses the Tenant+User creation pattern from `src/modules/auth/authController.js` (register) and the `User` password helper.

## Scope
**Included:** a super-admin creates a `Tenant` + its first admin `User` atomically (one transaction), audited; the admin receives an e-mail verification link (idempotent, after commit).
**Deferred:** tenant self-service; bulk import; the operator choosing the admin's password (admin sets it via verification/reset).

## Requirements / Business Rules
- `POST /admin/tenants` body (whitelisted): `nomeEmpresa` (2–100), `slug?` (auto from name; lowercase `[a-z0-9-]`; unique), `planoTipo` (`basico`|`pro`|`elite`|`custom`), `adminNome`, `adminEmail`.
- Server-set, never from body: `User.role='admin'`, `emailVerificado=false`, `plano.status='trial'`, `limites` from the plan defaults, `tenantId`.
- `criarTenant` (inside `adminMutation`'s transaction): create `Tenant` (`[...],{session}`) with a unique slug; create the admin `User` (`[...],{session}`) with a hashed random initial password. Returns `{ data: { tenantId, adminUserId }, targetTenantId, after: { tenant: {nome,slug,planoTipo}, admin: {email} } }`.
- The e-mail verification link is sent **after** commit (outside the transaction), idempotent; a send failure is logged, not rolled back.
- Slug collision → retry with a numeric suffix; a hard unique violation surfaces 409.
- Admin e-mail already registered globally → 409, nothing created.

## API Contracts
`POST /api/v1/admin/tenants`
- Request: `{ nomeEmpresa, slug?, planoTipo, adminNome, adminEmail }`
- `201`: `{ success: true, data: { tenantId, adminUserId } }`
- `400`: missing/invalid field · `409`: duplicate e-mail (or hard slug conflict) · `404`: non-super-admin

## Data Model
No new model. Writes `Tenant` + `User` (existing, shared `laura-saas`) + `AuditLog` (via `adminMutation`). **Decision:** create the `User` within the session — pass `{ session }` into `User.createWithPassword` (small adaptation) rather than duplicate the hashing inline.

## Error Handling
- Missing `nomeEmpresa`/`adminNome`/`adminEmail` → 400 with the field.
- Duplicate admin e-mail → 409, no tenant.
- E-mail send failure → tenant+user kept (e-mail is retryable), failure logged.
- Transaction failure → full rollback (no orphan tenant/user) + `status:'error'` audit.

## Testing Strategy
- Uses the **`MongoMemoryReplSet`** harness (F05) for the transaction.
- Tests: create commits Tenant+User+audit atomically; server-set fields not overridable from body (mass-assignment); duplicate e-mail → 409 + nothing created; rollback on failure (no orphan).
- **Mock the e-mail service** — never send real e-mail in tests (`.claude/rules/testing.md`).

## Assumptions / Decisions
- **[Auto-Accept]** Reuse the register flow's Tenant+User creation, moved into `adminMutation`'s transaction (replacing the register's manual rollback with a real transaction).
- **[Auto-Accept]** The initial admin password is random; the admin sets a real one through the existing e-mail verification/reset flow.
- **[Decision]** `User.createWithPassword` is extended to accept an optional `{ session }`.
