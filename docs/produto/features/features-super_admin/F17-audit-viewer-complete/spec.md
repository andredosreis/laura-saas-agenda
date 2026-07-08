# F17 — Complete Audit Viewer · Spec

Frontend-only. The backend already records `before/after` diffs and accepts `from`/`to` date filters (`listarAuditSchema`), but the viewer never shows the diffs, never exposes the date filters, shows metadata only on hover (inaccessible on touch), and double-toasts errors. This feature makes the viewer show what the audit log actually contains.

## Mandatory reading
- `laura-saas-frontend/src/pages/admin/AuditLogPage.tsx` (entire file)
- `laura-saas-frontend/src/hooks/useAdminAudit.ts` + `src/hooks/useAdminTenants.ts` (the tenants hook shows the correct no-toast pattern, see its comments)
- `laura-saas-frontend/src/types/admin.ts` (`AuditLogEntry` — `before`/`after` already typed at `:65-66`)
- `laura-saas-frontend/src/components/admin/ConsoleUI.tsx` (console primitives + styles)

## Component Overview
- `src/hooks/useAdminAudit.ts` — remove the duplicate toast; align the effect pattern with `useAdminTenants`.
- `src/pages/admin/AuditLogPage.tsx` — date filters, expandable rows, copy-ID.
- `src/pages/admin/TenantsListPage.tsx` + `TenantDetailPage.tsx` — copy-ID affordance (feeds the audit filters).

## Scope
**Included:** date-range filters UI, expandable row with `before/after` + `metadata`, duplicate-toast fix, copy-ID buttons.
**Out of scope:** backend changes (none needed), audit export/CSV, live tail.

## Requirements / Business Rules
- **Toast fix:** delete `toast.error(msg)` from `useAdminAudit.ts` catch (`:40`) — the `api.js` interceptor already toasts; keep `setError` for the inline error box. Add the same explanatory comment used in `useAdminTenants.ts:20`.
- **Date filters:** two `<input type="date">` fields (De / Até) in the existing filter form, mapped to the hook's `from`/`to` (already wired at `useAdminAudit.ts:32-33`). Send ISO dates; "Até" is inclusive — send end-of-day (`T23:59:59.999Z` after converting the picked date) or verify how the backend `to` comparison works (`adminSchemas.js:93-102` / `listarAudit`) and match it. "Limpar" resets both.
- **Expandable rows (replaces the hover tooltip):** each row gets a chevron toggle (button element — keyboard and touch accessible, `aria-expanded`). Expanded content renders inside a full-width row: `metadata`, `before`, `after` as pretty-printed JSON in `<pre className="font-console-mono text-xs overflow-x-auto">` blocks, each labelled, omitting empty ones. Remove the `group-hover` tooltip (`AuditLogPage.tsx:166-174`).
- **Copy-ID:**
  - Audit rows: actor and target-tenant cells get a small copy icon button → `navigator.clipboard.writeText(id)` + `toast.success('ID copiado')`.
  - `TenantsListPage` rows and `TenantDetailPage` header: same affordance for the tenant `_id` (stop the row-level `navigate` from firing on the copy click — `e.stopPropagation()`).
- Keep the console visual language: flat cards, `rounded-[3px]`, existing `inputClass` styles (F22 will consolidate them later — do not block on it).
- Effect hygiene: if touching the fetch effect, prefer the `useAdminTenants` dependency pattern over the current `eslint-disable exhaustive-deps` (`useAdminAudit.ts:48`); do not introduce new disables.

## API Contracts
None new. Consumes `GET /api/v1/admin/audit?from=&to=` as already implemented.

## Error Handling
- Clipboard API failure (older browsers) → `toast.error('Não foi possível copiar')`; no crash.
- Invalid date range (from > to): disable Filtrar or swap client-side; the backend Zod will 400 otherwise — surface the inline error box as today.

## Testing Strategy
- Component tests (follow the pattern of `src/components/__tests__/ProtectedRoute.test.tsx` / existing admin tests):
  1. Hook: error path sets `error` and does NOT call `toast.error` (spy on react-toastify).
  2. Page: expanding a row shows formatted `before`/`after`/`metadata`; collapsed by default; toggle works via keyboard (fire `click` on the button role).
  3. Date filters appear in the query string passed to `apiHelpers.get` (mock it) with inclusive `to`.
- `npm run build` + `npm run lint` clean.

## Assumptions / Decisions
- **[Auto-Accept]** Expandable row over modal: keeps the operator in the table flow, no new modal shell before F22 consolidates modals.
- **[Auto-Accept]** No backend paging changes; expanding is per-row client rendering of data already fetched.
