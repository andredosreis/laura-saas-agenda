# F08 — Suspend / Reactivate Tenant · Eval Report

**Feature:** F08
**Date:** 2026-06-22
**Evaluator:** Gemini (Antigravity)
**Branch:** `F08-suspend-reactivate-tenant`
**Commit:** `f80b5cc`
**PR:** [#40](https://github.com/andredosreis/laura-saas-agenda/pull/40)

---

## 1. Gate Results

| Gate | Result | Notes |
|---|---|---|
| **ESLint** | ✅ 0 errors | 4 pre-existing warnings in unrelated maintenance scripts |
| **Jest** | ✅ 14/14 passed | `tests/admin-tenant-suspend-reactivate.test.js` (27.2s) |

---

## 2. Contract Verification

### C1 — Suspend ✅ PASSED

- **GIVEN** a super-admin and an active tenant
- **WHEN** `POST /api/v1/admin/tenants/:id/suspender` with `{ motivo }`
- **THEN** the tenant's `plano.status` becomes `suspenso` AND one `tenant.suspend` audit entry exists with the previous/new status and `motivo` in metadata.

**Evidence:**
- Test `suspende tenant ativo → plano.status = suspenso + AuditLog com motivo` — verifies DB persistence, audit log action `tenant.suspend`, `before.status === 'ativo'`, `after.status === 'suspenso'`, `metadata.motivo === 'Falta de pagamento'`.
- Test `suspende tenant sem motivo — motivo não aparece no metadata` — verifies optional nature of `motivo`.
- **Code-level:** `adminMutation` was expanded backward-compatibly to accept `ctx.metadata`, successfully merging `{ motivo }` into the audit log.

### C2 — Suspension blocks the tenant (reuses requirePlan) ✅ PASSED

- **GIVEN** a tenant just suspended
- **WHEN** one of its staff calls a normal product route with their token
- **THEN** they get 403 (existing `requirePlan` enforcement), while the super-admin can still manage the tenant.

**Evidence:**
- Test `staff de tenant suspenso recebe 403 em rota de produto` — simulates an authenticated staff user calling a `requirePlan` protected route after tenant suspension. Result is `403 Forbidden` with `planoStatus: 'suspenso'`.
- Test `super-admin continua a conseguir gerir tenant suspenso` — verifies that `GET /api/v1/admin/tenants/:id` still works for the superadmin.
- **Code-level:** Uses the existing `requirePlan` gate without modification, adhering strictly to the architecture spec.

### C3 — Reactivate ✅ PASSED

- **GIVEN** a suspended tenant
- **WHEN** `POST /api/v1/admin/tenants/:id/reactivar`
- **THEN** the tenant's `plano.status` becomes `ativo`, its staff regain product access, and one `tenant.reactivate` audit entry exists.

**Evidence:**
- Test `reativa tenant suspenso → plano.status = ativo + AuditLog` — verifies status returns to `ativo` and audit log `tenant.reactivate` is written.
- Test `staff recupera acesso após reactivação` — verifies that a previously `403` blocked staff user gets `200 OK` on the product route after reactivation.

### C4 — Idempotent ✅ PASSED

- **GIVEN** an already-suspended tenant
- **WHEN** suspend is called again
- **THEN** it succeeds, the status stays `suspenso`, and the action is still audited.

**Evidence:**
- Test `suspender tenant já suspenso → sucesso + auditado` — returns 200, `plano.status` remains `suspenso`, and audit is written with `before/after` both being `suspenso`.
- Test `reactivar tenant já ativo → sucesso + auditado` — identical idempotent behavior for activation.

### C5 — Not found / hidden ✅ PASSED

- **GIVEN** an invalid id, a non-existent tenant, or a non-super-admin token
- **WHEN** the endpoint is called
- **THEN** it returns 400, 404, or 404 respectively.

**Evidence:**
- 6 sweep tests executed successfully covering `suspender` and `reactivar` endpoints with Invalid IDs (400), Non-existent Tenants (404), and Non-superadmin tokens (404).

---

## 3. Summary

| Metric | Value |
|---|---|
| **Passed** | 5 / 5 |
| **Failed** | 0 |
| **Indeterminate** | 0 |
| **Gate: ESLint** | ✅ 0 errors |
| **Gate: Jest** | ✅ 14/14 |

### Files Implemented

| File | Layer | Change |
|---|---|---|
| `src/modules/admin/adminSchemas.js` | Validation | +1 Zod schema (`suspenderTenantSchema`) |
| `src/modules/admin/adminController.js` | Service | +2 functions (`suspenderTenant`, `reactivarTenant`) |
| `src/modules/admin/adminRoutes.js` | API | +2 POST routes via `adminMutation` |
| `src/modules/admin/adminMutation.js` | Infrastructure | Expanded to support `ctx.metadata` |
| `tests/admin-tenant-suspend-reactivate.test.js` | Test | [NEW] 14 tests (C1–C5) |
| `docs/produto/PRDProgress.json` | Tracking | F08 → done |

---

**Verdict: ✅ ALL CRITERIA PASSED — F08 is DONE.**
