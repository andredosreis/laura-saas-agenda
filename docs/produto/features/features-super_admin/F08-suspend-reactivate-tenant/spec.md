# F08 — Suspend / Reactivate Tenant · Spec

## Component Overview
- `src/modules/admin/adminController.js` — `suspenderTenant` + `reactivarTenant` (the `work`s).
- `src/modules/admin/adminRoutes.js` — `POST /tenants/:id/suspender` and `POST /tenants/:id/reactivar` via `adminMutation`.
- Depends on **F05**. **Reuses the existing `requirePlan` enforcement** (`src/middlewares/auth.js`): a tenant whose `plano.status ∉ {ativo, trial}` already gets 403 on product routes — so suspension needs **no new enforcement**, only the status change.

## Scope
**Included:** suspend (`status → suspenso`) and reactivate (`status → ativo`), atomically + audited, with an optional reason.
**Out of scope:** deleting tenants; data export; pausing the IA specifically (suspension already blocks product access via `requirePlan`).

## Requirements / Business Rules
- `POST /admin/tenants/:id/suspender` — body `{ motivo? }`. `adminMutation('tenant.suspend', …)`: set `plano.status = 'suspenso'`; put `motivo` in audit `metadata`; `before/after = { status }`.
- `POST /admin/tenants/:id/reactivar` — `adminMutation('tenant.reactivate', …)`: set `plano.status = 'ativo'`.
- ObjectId validation (400); non-existent tenant → 404.
- **Idempotent:** suspending an already-suspended tenant succeeds and is still audited.
- A suspended tenant's staff get 403 on product routes (existing `requirePlan`); the super-admin can still list/view/configure/reactivate it.

## API Contracts
- `POST /api/v1/admin/tenants/:id/suspender` `{ motivo? }` → `200 { success, data: { status: 'suspenso' } }`
- `POST /api/v1/admin/tenants/:id/reactivar` → `200 { success, data: { status: 'ativo' } }`
- `400` invalid id · `404` not found / non-super-admin

## Data Model
No new model. Updates `Tenant.plano.status` via `adminMutation`. `requirePlan` is reused as-is (no change).

## Error Handling
- Invalid id → 400; non-existent tenant → 404.
- Transaction failure → rollback + `status:'error'` audit.

## Testing Strategy
- **`MongoMemoryReplSet`** harness (F05).
- Tests: suspend sets `status=suspenso` + one `tenant.suspend` audit entry (`motivo` in metadata, before/after); **integration** — a suspended tenant's user gets **403** on a product route (set status, then call a product route with that tenant's token); reactivate restores `ativo` + product access; idempotent suspend; non-super-admin → 404 (sweep).

## Assumptions / Decisions
- **[Key]** Suspension reuses the existing `requirePlan` enforcement — F08 only flips `plano.status`; no new gate.
- **[Auto-Accept]** Dedicated suspend/reactivate endpoints (not F07's plano endpoint) for clear, distinct audit (`tenant.suspend` / `tenant.reactivate`) plus the optional reason.
