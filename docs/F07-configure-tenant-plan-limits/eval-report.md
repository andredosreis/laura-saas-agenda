# F07 — Configure Tenant Plan, Limits & Feature Flags · Eval Report

**Feature:** F07
**Date:** 2026-06-22
**Evaluator:** Gemini (Antigravity)
**Branch:** `F07-configure-tenant-plan-limits`
**Commit:** `c73aedf`
**PR:** [#39](https://github.com/andredosreis/laura-saas-agenda/pull/39)

---

## 1. Gate Results

| Gate | Result | Notes |
|---|---|---|
| **ESLint** | ✅ 0 errors | 4 pre-existing warnings in unrelated maintenance scripts |
| **Jest** | ✅ 15/15 passed | `tests/admin-tenant-plan-limits.test.js` (16.2s) |

---

## 2. Contract Verification

### C1 — Update plan type/expiry ✅ PASSED

- **GIVEN** a super-admin and an existing tenant
- **WHEN** `PUT /api/v1/admin/tenants/:id/plano` with `{ tipo, dataExpiracao }`
- **THEN** the tenant's `plano.tipo`/`plano.dataExpiracao` are updated AND one `tenant.plano.update` audit entry exists with a `before/after` of only those fields.

**Evidence:**
- Test `atualiza tipo e dataExpiracao + cria AuditLog com before/after` — verifies DB persistence, audit log action, status `ok`, `before.tipo === 'basico'`, `after.tipo === 'elite'`, `targetTenantId` set.
- Test `atualiza só tipo sem dataExpiracao` — verifies partial update works.
- Controller uses explicit whitelist (`$set['plano.tipo']`, `$set['plano.dataExpiracao']`); `before`/`after` objects contain ONLY changed fields (GDPR-minimal).

### C2 — Update limits & flags ✅ PASSED

- **GIVEN** a super-admin and an existing tenant
- **WHEN** `PUT /api/v1/admin/tenants/:id/limites` with limit numbers and/or flags
- **THEN** the tenant's `limites` are updated AND one `tenant.limites.update` audit entry exists with the minimal diff.

**Evidence:**
- Test `atualiza limites numéricos e flags + cria AuditLog com before/after` — sends `{ maxClientes: 500, iaAtiva: true, maxLeads: -1 }`, verifies DB values, audit `before.maxClientes === 50` (default), `after.maxClientes === 500`, `before.iaAtiva === false`, `after.iaAtiva === true`.
- Controller iterates `LIMITES_WHITELIST` array — only known keys produce `$set` entries.

### C3 — Validation ✅ PASSED

- **GIVEN** an out-of-enum `tipo`, a limit `< -1`, or a non-boolean flag
- **WHEN** the corresponding endpoint is called
- **THEN** it returns 400 naming the offending field and changes nothing.

**Evidence:**
- Test `rejeita tipo fora do enum → 400` — `tipo: 'inexistente'` → 400, DB unchanged.
- Test `rejeita limite < -1 → 400` — `maxClientes: -5` → 400.
- Test `rejeita flag não-booleana → 400` — `iaAtiva: 'sim'` → 400.
- Test `rejeita body vazio (nenhum campo) → 400` — empty `{}` → 400 (Zod `.refine` requires at least one field).
- Zod schemas: `z.enum(...)` for tipo, `z.number().int().min(-1)` for limits, `z.boolean()` for flags.

### C4 — No mass assignment / no status change ✅ PASSED

- **GIVEN** a body that also includes `plano.status`, `tenantId`, or other non-whitelisted keys
- **WHEN** the endpoint is called
- **THEN** those keys are ignored — in particular `plano.status` is NOT changed by F07.

**Evidence:**
- Test `ignora plano.status, tenantId e campos extra no body do plano` — sends `{ tipo: 'pro', status: 'ativo', tenantId: 'hack', preco: 999 }`, verifies `plano.status` remains `'trial'` and `plano.preco` remains `49`.
- Test `ignora campos extra no body de limites` — sends `{ maxClientes: 200, tenantId: 'hack', nome: 'Hack' }`, verifies `nome` remains original.
- **Code-level:** Zod schemas without `.strict()` silently strip unknown keys. Controller uses explicit whitelist (`$set['plano.tipo']` / `LIMITES_WHITELIST` iteration) — never `req.body` spread.

### C5 — Not found / hidden ✅ PASSED

- **GIVEN** an invalid id, a non-existent tenant, or a non-super-admin token
- **WHEN** the endpoint is called
- **THEN** it returns 400 (invalid id), 404 (non-existent), or 404 (non-super-admin) respectively.

**Evidence:**
- 6 tests covering both endpoints:
  - `ID inválido → 400 (plano)` ✓
  - `ID inválido → 400 (limites)` ✓
  - `tenant inexistente → 404 (plano)` ✓
  - `tenant inexistente → 404 (limites)` ✓
  - `não-superadmin → 404 (plano)` ✓ (role `admin` → 404, not 403)
  - `não-superadmin → 404 (limites)` ✓
- `requireSuperadmin` middleware at router level returns 404 (never 403) — surface not revealed.

---

## 3. PRD §9 Acceptance Criteria Cross-Check

| Criterion (PRD §9, F07) | Status |
|---|---|
| Changing plan type, expiry, limits or flags persists and takes effect for that tenant | ✅ |
| An out-of-enum value or a negative limit returns 400 with the offending field | ✅ |
| The audit `before/after` contains only the changed fields | ✅ |

### Spec Decision: plano.status excluded from F07

The PRD §6 mentions `plano.status` as an editable field in F07. The spec-writer made a deliberate decision to exclude it:

> *[Decision] Status transitions excluded from F07 — owned by F08 (resolves the PRD's plano.status overlap).*

This is architecturally correct: F08 (Suspend/Reactivate) owns status transitions with dedicated semantics (suspenso/ativo + reason). Having two endpoints mutate the same field would be ambiguous. The implementation honours the spec's decision, and C4 explicitly verifies that `plano.status` is NOT changed.

---

## 4. Summary

| Metric | Value |
|---|---|
| **Passed** | 5 / 5 |
| **Failed** | 0 |
| **Indeterminate** | 0 |
| **Gate: ESLint** | ✅ 0 errors |
| **Gate: Jest** | ✅ 15/15 |

### Files Implemented

| File | Layer | Change |
|---|---|---|
| `src/modules/admin/adminSchemas.js` | Validation | +2 Zod schemas (plano, limites) |
| `src/modules/admin/adminController.js` | Service | +2 functions (atualizarPlano, atualizarLimites) |
| `src/modules/admin/adminRoutes.js` | API | +2 PUT routes via adminMutation |
| `tests/admin-tenant-plan-limits.test.js` | Test | [NEW] 15 tests (C1–C5) |
| `docs/PRDProgress.json` | Tracking | F07 → done |

---

**Verdict: ✅ ALL CRITERIA PASSED — F07 is DONE.**
