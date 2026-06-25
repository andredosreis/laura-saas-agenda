# F07 — Configure Tenant Plan, Limits & Feature Flags · Spec

## Component Overview
- `src/modules/admin/adminController.js` — add `atualizarPlano` + `atualizarLimites` (the `work`s).
- `src/modules/admin/adminRoutes.js` — `PUT /tenants/:id/plano` and `PUT /tenants/:id/limites` via `adminMutation`.
- Depends on **F05** (`adminMutation`).

## Scope
**Included:** edit a tenant's plan **type** + expiry, its **limits**, and its **feature flags** — atomically and audited.
**Moved to F08:** plan **status** transitions (suspend/reactivate). F07 does **not** change `plano.status` (avoids two ways to do the same thing).

## Requirements / Business Rules
- `PUT /admin/tenants/:id/plano` — body whitelist: `{ tipo? (basico|pro|elite|custom), dataExpiracao? (ISO date) }`. Wrapped by `adminMutation('tenant.plano.update', …)`.
- `PUT /admin/tenants/:id/limites` — body whitelist: `{ maxClientes?, maxUsuarios?, maxAgendamentosMes?, maxLeads? (int ≥ 0, or -1 = unlimited), iaAtiva?, leadsAtivo?, whatsappAutomacao?, … (booleans) }`. Wrapped by `adminMutation('tenant.limites.update', …)`.
- ObjectId validation (400); non-existent tenant → 404.
- The `work` reads the tenant `before`, applies a **whitelisted** `$set` with `{ session }`, and returns `{ data, targetTenantId, before, after }` with only the changed fields (GDPR-minimal diff). Never `req.body` spread; never write `plano.status` here.
- Validation: enum for `tipo`; numbers ≥ -1 for limits; booleans for flags.

## API Contracts
- `PUT /api/v1/admin/tenants/:id/plano` → `200 { success, data: { plano } }`
- `PUT /api/v1/admin/tenants/:id/limites` → `200 { success, data: { limites } }`
- `400` invalid id/field · `404` not found / non-super-admin

## Data Model
No new model. Updates `Tenant.plano.{tipo,dataExpiracao}` / `Tenant.limites.{…}` (shared `laura-saas`) via `adminMutation` (`findOneAndUpdate` with the session; read `before` for the diff).

## Error Handling
- Invalid id → 400; non-existent tenant → 404.
- Out-of-enum `tipo`, limit `< -1`, wrong type for a flag → 400 with the offending field.
- Transaction failure → rollback + `status:'error'` audit.

## Testing Strategy
- **`MongoMemoryReplSet`** harness (F05).
- Tests: plano update persists + audited `before/after`; limites update persists + audited; out-of-enum / negative → 400; mass-assignment (extra body keys) ignored; non-super-admin → 404 (sweep).

## Assumptions / Decisions
- **[Decision]** Status transitions excluded from F07 — owned by F08 (resolves the PRD's plano.status overlap).
- **[Auto-Accept]** Two focused endpoints (plano, limites) with distinct audit actions, rather than one `PATCH` — clearer audit + validation.
- **[Auto-Accept]** Feature flags live under `Tenant.limites` (existing schema: `iaAtiva`, `leadsAtivo`, …).
