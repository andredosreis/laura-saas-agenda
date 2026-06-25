# F07 — Configure Tenant Plan, Limits & Feature Flags · Plan

## Prerequisites
- F05 (`adminMutation`); `MongoMemoryReplSet` harness.

## Phase 1 — plano (TDD)
1. Test + impl: `PUT /tenants/:id/plano` updates `tipo`/`dataExpiracao`, audited with `before/after`; out-of-enum `tipo` → 400; non-existent tenant → 404. Route via `adminMutation('tenant.plano.update', …)`.

## Phase 2 — limites
2. Test + impl: `PUT /tenants/:id/limites` updates limits + flags, audited; negative limit / wrong flag type → 400; extra body keys ignored. Route via `adminMutation('tenant.limites.update', …)`.

## Phase 3 — verify
3. Gates (`lint` + `test`) green; sweep test auto-covers the two new routes' 404. Set F07 `status: "Implemented"` in `docs/produto/PRDProgress.json`.
