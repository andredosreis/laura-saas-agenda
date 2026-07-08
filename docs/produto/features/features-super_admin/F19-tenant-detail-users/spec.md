# F19 — Tenant Users Listing · Spec

The tenant detail page shows only a user **count**; the operator cannot see who owns/administers a client account — the single most-needed datum when operating a done-for-you client. Add a control-plane users listing and a Users card in the detail page.

## Mandatory reading
- `src/modules/admin/adminController.js` — `obterTenant` (pattern for control-plane reads + audit action)
- `src/models/User.js` — fields + `toSafeObject` (`:282`); note `User` lives in the shared DB with a `tenantId` field (control-plane — no `getTenantDBAdmin` involved)
- `laura-saas-frontend/src/pages/admin/TenantDetailPage.tsx` + `src/components/admin/ConsoleUI.tsx`

## Component Overview
- Backend: `listarUsersTenant` handler + `GET /tenants/:id/users` route (read-only — no `adminMutation`).
- Frontend: `useAdminTenantUsers` hook + "Utilizadores" card in `TenantDetailPage`.

## Scope
**Included:** paginated read-only user list per tenant with safe fields; owner highlighted.
**Out of scope:** creating/editing/deactivating users from the panel (would need `adminMutation` + a dedicated spec), password/2FA resets, impersonation.

## Requirements / Business Rules
- `GET /admin/tenants/:id/users`:
  - Validate ObjectId (existing manual pattern); confirm the tenant exists first (`Tenant.findById`) → else 404 (business 404, same as `obterTenant`).
  - Query: `User.find({ tenantId: id }).select('nome email role ativo emailVerificado ultimoLogin createdAt').sort({ createdAt: 1 }).skip/limit` + `countDocuments` in `Promise.all`. **Explicit allowlist select** — never the full document (`permissoes`, `notificacoes`, `dadosBancarios`, security fields stay out; assert in tests).
  - Pagination: page ≥ 1, limit default 20 cap 100 (house pattern from `listarTenants:18-19`).
  - `req.audit.set({ action: 'tenant.users', targetTenantId: id })` — this is a PII read (staff names/emails); the audit entry is the GDPR trail.
  - Sort `createdAt: 1` so the **first admin (owner)** appears first.
- Frontend — `TenantDetailPage`:
  - New `ConsoleCard` "Utilizadores" listing rows: nome, email, `role` (small badge, reuse `StatusPill`/`PLAN_STYLES` styling approach), ativo/inactivo dot, último login (formatted `pt-PT`, `Europe/Lisbon`).
  - The first `role==='admin'` user is tagged "Dono" (owner) with a distinct badge.
  - States: spinner while loading, inline error box, "Sem utilizadores" empty state (house patterns from the page).
  - Types in `src/types/admin.ts` (`AdminTenantUser`).

## API Contracts
- `GET /api/v1/admin/tenants/:id/users?page=&limit=` → `200 { success, data: [{ _id, nome, email, role, ativo, emailVerificado, ultimoLogin, createdAt }], pagination }` · 400 invalid id · 404 tenant not found / non-superadmin

## Data Model
None.

## Error Handling
- Tenant with zero users (shouldn't happen — F06 creates one, but legacy data may) → 200 with empty `data`, UI empty state.

## Testing Strategy
- `tests/admin-tenant-users.test.js`:
  1. Seeds tenant + 3 users (1 admin first, then others) → list ordered with admin first, only allowlisted fields present (`expect(Object.keys(user)).toEqual(expect.arrayContaining([...]))` + assert absence of `passwordHash`, `refreshTokens`, `dadosBancarios`, `permissoes`, `twoFactor`).
  2. Pagination caps at 100; page 2 works.
  3. Non-existent tenant → 404; invalid id → 400; audit entry `tenant.users` with `targetTenantId` written.
  4. Sweep test picks the route up automatically (no action needed — just don't break it).
  5. **Isolation sanity:** users of another tenant never appear (two tenants seeded, filter asserted).

## Assumptions / Decisions
- **[Key]** Read stays in the shared DB (`User` is control-plane with `tenantId`) — `getTenantDBAdmin` is NOT involved; this is the same class of read as `obterTenant`.
- **[Auto-Accept]** "Owner" = earliest-created admin user; the F06 creation flow guarantees that ordering for panel-created tenants.
