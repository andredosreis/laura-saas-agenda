# F11 — Panel Frontend: Tenant Management UI · Eval Report

**Date:** 2026-06-22
**Branch:** `F11-frontend-tenant-management`
**Evaluator:** automated (gates) + Playwright CLI (E2E, dev-superadmin@marcai.pt, real Atlas dev DB)

## Summary

**5 passed, 0 failed, 0 indeterminate.**

## Gates

| Gate | Result | Evidence |
|---|---|---|
| Backend `npm run lint` | ✅ pass | 0 errors, 4 pre-existing warnings (unrelated scripts/maintenance files) |
| Frontend `npm run build` (tsc + Vite) | ✅ pass | `✓ built in 6.85s`, no type errors |
| Frontend `npm run lint` | ✅ pass | 0 errors, 6 pre-existing warnings (unrelated `.jsx` files / contexts, not part of F11 diff) |

Backend has no diff for F11 (frontend-only feature per spec.md scope) — full Jest suite not re-run; F06/F07/F08 endpoints exercised live below with real 200 responses.

## Contract verification (Given/When/Then)

### C1 — Create a tenant — ✅ passed
Filled the create form (`F11 Eval Studio`, admin name/email, **Plano left at default placeholder**) and submitted via `POST /admin/tenants`. New row appeared in the list with slug `f11-eval-studio`, plan `basico`, status `Trial`.
Screenshot: `eval-screenshots/c1-create-success.png`

> Regression note: this run intentionally left the "Plano" select at its default `<option value="">` to catch a bug found during implementation — `criarTenantSchema.planoTipo` was `z.enum(...).optional()`, which rejects `""` and silently blocked submission with no visible error. Fixed with `z.preprocess` in `src/schemas/admin.ts:17` before this eval. Confirmed fixed: submission succeeded.

### C2 — Edit plan/limits — ✅ passed
- Plan sub-form: changed `tipo` to `elite`, saved → `PUT /admin/tenants/:id/plano` returned **200 OK**.
- Limits sub-form: `maxClientes` 50→80, checked `Analytics`, saved → `PUT /admin/tenants/:id/limites` returned **200 OK**.
- Detail page re-render confirmed via DOM snapshot: `Tipo de plano: elite`, `Clientes: 0 / 80`, `Analytics: Activo`.
Screenshot: `eval-screenshots/c2-edit-toast.png`

### C3 — Suspend with confirmation — ✅ passed
Clicked "Suspender" → confirmation dialog appeared (real DOM modal, not `window.confirm`) with optional "Motivo" textarea. Filled motivo, clicked "Confirmar suspensão" → `POST /admin/tenants/:id/suspender` returned **200 OK**. Status pill changed to `Suspenso`, action button swapped to `Reactivar`.
Screenshot: `eval-screenshots/c3-suspend-confirm-dialog.png`

### C4 — Reactivate — ✅ passed
Clicked "Reactivar" → confirmation dialog appeared, confirmed → `POST /admin/tenants/:id/reactivar` returned **200 OK**. Status pill back to `Activo`.

### C5 — Validation & conflict — ✅ passed
- **409 duplicate email:** submitted create form reusing an existing admin email → `POST /admin/tenants` returned **409 Conflict**; inline message "Este email já está registrado" rendered under the email field; form retained all entered values (nomeEmpresa, adminNome, adminEmail all still populated); no `alert()`.
- **Client-side validation:** cleared the required "Nome da empresa" field and submitted → Zod inline error "Nome da empresa deve ter no mínimo 2 caracteres" rendered; confirmed via network log that **no additional POST was sent** (validation blocked client-side before any request); no `alert()`/native dialog encountered (would have hung the CLI run).
Screenshot: `eval-screenshots/c5-validation-errors.png`

## Multi-tenant isolation

Not applicable — F11 operates exclusively within the superadmin admin module (ADR-024 sanctioned exception, no `tenantId` scoping by design; see `.claude/rules/multi-tenant.md`). No new backend endpoints were added by this feature; F06/F07/F08 already carry their own isolation/authorization (`requireSuperadmin`).

## Artifacts

- Screenshots: `docs/F11-frontend-tenant-management/eval-screenshots/{c1-create-success,c2-edit-toast,c3-suspend-confirm-dialog,c5-validation-errors}.png`
- This report: `docs/F11-frontend-tenant-management/eval-report.md`

## Result

All 5 contract criteria passed deterministically with hard evidence (HTTP status codes + DOM snapshots + screenshots). No pending/indeterminate items requiring human judgement. `PRDProgress.json["F11"].status` → `"done"`.
