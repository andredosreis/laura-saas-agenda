# F22 — Console UI Consolidation · Spec

Frontend-only refactor, **last feature of the phase** (it touches files F17/F18/F19/F21 also edit — sequence after them). Zero behaviour change: extract duplicated UI primitives, unify the console's two competing card languages, and strengthen the colour guard test.

## Mandatory reading
- `laura-saas-frontend/src/components/admin/ConsoleUI.tsx` (all primitives + `STATUS_STYLES`/`PLAN_STYLES`)
- The duplication sites: `CreateTenantForm.tsx:47-53`, `EditPlanLimitsForm.tsx:21-23,160-161`, `SuspendReactivateControls.tsx:31-48`, `AuditLogPage.tsx:5-6,186-208`, `TenantsListPage.tsx:127-147`
- `src/components/admin/__tests__/no-cream-rust.test.ts`
- `.claude/rules/react-components.md` (components = pure UI; `index.css:4` documents the console's deliberate visual identity)

## Component Overview
New `laura-saas-frontend/src/components/admin/ui/`:
- `Modal.tsx` — the shell duplicated **4×** (`fixed inset-0 z-50 … bg-black/60` overlay + console card, title, close, `aria-modal`, Escape-to-close).
  - ⚠️ Corrigido 2026-07-17: esta spec foi escrita a 2026-07-08 e dizia 3×. Os sites reais hoje são `CreateTenantForm.tsx`, `EditPlanLimitsForm.tsx`, `SuspendReactivateControls.tsx` **e `pages/admin/SecurityPage.tsx`** (o diálogo de desactivar 2FA, criado a 2026-07-14 pelo F16 — posterior a esta spec). O `SecurityPage` já traz focus-trap + Escape próprios: é o candidato mais rico e a melhor referência para a API do `Modal`.
  - Depois do F21, o `WhatsAppCard.tsx` também entra no âmbito de adopção (QR/confirmação de logout) — confirmar o que ele trouxe antes de começar.
- `PaginationFooter.tsx` — the footer duplicated between `TenantsListPage` and `AuditLogPage` (props: `pagination`, `onPageChange`).
- `Spinner.tsx` — the `border-primary-500 border-t-transparent animate-spin` block from the 3 pages.
- Form-field primitives: export `inputClass`/`labelClass` (or a `Field` component) from ONE place — extend `ConsoleUI.tsx` or add `ui/Field.tsx`; delete the 4 copies.

## Scope
**Included:** extraction + adoption in all console files; card-language unification; guard-test upgrade.
**Out of scope:** any visual redesign beyond the unification below, touching product (non-admin) pages, converting `.jsx` files.

## Requirements / Business Rules
- **Unify on the flat operator language** (decision: the console's identity is flat/terminal — `index.css:4`): restyle `KpiCard` and `PlanDistributionBar` (`ConsoleUI.tsx:105,125`) from glass (`bg-white/5 backdrop-blur … rounded-2xl`) to the `ConsoleCard` language (`bg-dark-800 border border-white/10 rounded-[3px]`). Everything inside `/admin` then shares one card style.
- Adopt the new primitives everywhere in `pages/admin` + `components/admin`; `git grep` the old class strings afterwards — zero duplicates may remain.
- `Modal`: focus is trapped or at minimum moved to the dialog on open; `Escape` closes; overlay click behaviour matches the current forms (check each — `SuspendReactivateControls` keeps the dialog open on error deliberately, `:87-89` — preserve that).
- **Guard test upgrade** (`no-cream-rust.test.ts` or a sibling `console-design-guard.test.ts`):
  1. Keep the cream/rust hex denylist.
  2. Add: **no raw hex colours at all** (`/#[0-9a-fA-F]{3,8}\b/` in class strings) in `components/admin` + `pages/admin` — tokens only (allow exceptions via an explicit in-test allowlist if a legitimate case exists; today there should be none).
  3. Add positive assertions: every file in `pages/admin` references at least one `primary-` or `dark-` token; no `rounded-2xl`/`rounded-xl`/`rounded-3xl` in console files (the flat language uses `rounded-[2px|3px|5px]`) — this locks the unification in.

## API Contracts
None.

## Error Handling
None new.

## Testing Strategy
- Existing admin component tests must pass unchanged (behaviour is identical).
- New: `Modal` unit test (renders children, Escape calls `onClose`); upgraded guard test red before the KpiCard restyle, green after (do the guard last so it proves the work).
- `npm run build` + `npm run lint` clean; manual visual pass on the three pages (list, detail, audit) in dark mode.

## Assumptions / Decisions
- **[Key]** Flat wins over glass **inside the console only** — the product keeps glassmorphism; the console keeps its deliberate operator identity, now consistently.
- **[Auto-Accept]** Primitives live under `components/admin/ui/` (console-scoped), NOT `components/` — they encode console styling and must not leak into product pages.
- **[Auto-Accept]** No new dependencies (no headless-ui/radix) — the 4 existing modals are simple; a 40-line `Modal.tsx` covers them.
