# F20 — Environment Badge & 404 Catch-All · Spec

Frontend-only, small. The console gives no visual signal of which environment it is pointed at — for the one surface that deliberately crosses tenant isolation, an unmistakable "PRODUÇÃO" badge is a standard operator-console safety feature. Bundled with two routing gaps: `/admin` (no suffix) renders blank, and the app has no catch-all route.

## Mandatory reading
- `laura-saas-frontend/src/components/admin/ConsoleChrome.tsx` (header layout `:23,71,86`)
- `laura-saas-frontend/src/App.tsx` (routes `:100-203`, AdminLayout `:72-86`)
- Vite env docs if unsure: `import.meta.env.PROD` / `VITE_*` vars are compile-time

## Component Overview
- `ConsoleChrome.tsx` — environment badge in the header.
- `App.tsx` — `/admin` index redirect + global `*` route.
- New `src/pages/NotFoundPage.tsx`.

## Scope
**Included:** badge, `/admin` redirect, app-wide 404 page.
**Out of scope:** per-environment API-URL display, staging deploys (there is only prod + local dev today).

## Requirements / Business Rules
- **Badge:** label = `import.meta.env.VITE_ENV_LABEL` if set, else `import.meta.env.PROD ? 'PRODUÇÃO' : 'DEV'`.
  - PRODUÇÃO → red pill: `bg-red-500/15 text-red-300 border border-red-500/40 font-console-mono text-xs tracking-widest uppercase rounded-[2px] px-2 py-0.5`.
  - Anything else → emerald equivalent (`bg-emerald-500/15 text-emerald-300 border-emerald-500/40`).
  - Placed in the `ConsoleChrome` header next to the console title; always visible (also on mobile — keep it outside any collapsed nav).
  - Document `VITE_ENV_LABEL` in the frontend README/env example if one exists; set nothing on Vercel (PROD default is correct).
- **`/admin` index:** inside the admin routes block, add `<Route index element={<Navigate to="/admin/tenants" replace />} />` (adjust to the actual route nesting in `App.tsx` — the admin routes are currently flat paths, so alternatively add `<Route path="/admin" element={<Navigate .../>} />` under `AdminLayout`).
- **Catch-all:** `<Route path="*" element={<NotFoundPage />} />` as the LAST route. `NotFoundPage`: product design system (not console styling — it serves the whole app): dark slate background, glass card, "404 — Página não encontrada", SPA `<Link>` to `/dashboard`. Public: it must not leak auth state (no user data; it renders outside `ProtectedLayout`).

## API Contracts
None.

## Error Handling
None beyond routing.

## Testing Strategy
- Component tests:
  1. `ConsoleChrome` renders the badge; with `VITE_ENV_LABEL` mocked → that label wins (mock `import.meta.env` via vitest/jest config as the project's frontend tests already do — check `src/components/__tests__/` setup).
  2. Router test: unknown path renders `NotFoundPage`; `/admin` redirects to `/admin/tenants` for a superadmin session (reuse the auth mocking from `ProtectedRoute.test.tsx`).
- `npm run build` + `npm run lint` clean.

## Assumptions / Decisions
- **[Auto-Accept]** Badge signal derives from the build (`PROD`) with an env override — no runtime API call; the frontend build on Vercel IS the production build.
- **[Auto-Accept]** One global 404 page for the whole app (not console-specific) — the console inherits it; the gap was app-wide.
