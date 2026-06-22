# F08 — Suspend / Reactivate Tenant · Plan

## Prerequisites
- F05 (`adminMutation`); `MongoMemoryReplSet` harness.

## Phase 1 — suspend / reactivate (TDD)
1. Test + impl: `POST /tenants/:id/suspender` sets `plano.status='suspenso'`, audited with `motivo` in metadata + before/after; non-existent → 404. Route via `adminMutation('tenant.suspend', …)`.
2. Test + impl: `POST /tenants/:id/reactivar` sets `plano.status='ativo'`. Route via `adminMutation('tenant.reactivate', …)`.

## Phase 2 — enforcement integration
3. Test: a suspended tenant's user gets **403** on a product route (existing `requirePlan`); after reactivate, the same route returns 200.
4. Test: suspending an already-suspended tenant is idempotent and still audited.

## Phase 3 — verify
5. Gates (`lint` + `test`) green; sweep test auto-covers the two new routes' 404. Set F08 `status: "Implemented"` in `docs/PRDProgress.json`.
