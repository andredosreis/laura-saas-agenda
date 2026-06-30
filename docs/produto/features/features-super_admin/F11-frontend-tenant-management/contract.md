# F11 — Panel Frontend: Tenant Management UI · Contract (GWT)

## C1 — Create a tenant
- **GIVEN** a super-admin on the panel
- **WHEN** they fill the create form (company, plan, admin name/e-mail) and submit
- **THEN** the tenant is created via `POST /admin/tenants` (F06), a success toast appears, and the new tenant shows in the list.

## C2 — Edit plan/limits
- **GIVEN** a tenant's detail page (pre-filled from F03)
- **WHEN** the super-admin changes the plan or a limit/flag and saves
- **THEN** the change is sent via `PUT .../plano` / `.../limites` (F07) and the updated values are reflected.

## C3 — Suspend with confirmation
- **GIVEN** an active tenant
- **WHEN** the super-admin clicks suspend
- **THEN** a confirmation dialog (with optional reason) appears, and only on confirm is `POST .../suspender` (F08) called and the status shown as suspended.

## C4 — Reactivate
- **GIVEN** a suspended tenant
- **WHEN** the super-admin reactivates it
- **THEN** `POST .../reactivar` (F08) is called and the status shows active again.

## C5 — Validation & conflict
- **GIVEN** an invalid form (missing field) or a duplicate slug/e-mail
- **WHEN** the super-admin submits
- **THEN** an inline field message (or a specific 409 message) is shown, the form keeps its values, and no partial state is presented (no `alert()`).

## Prerequisites (the evaluator must ensure these exist)
- F06/F07/F08 endpoints + F10 host pages; a super-admin account. Verified with Playwright.
