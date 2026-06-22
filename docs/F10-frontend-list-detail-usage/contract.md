# F10 — Panel Frontend: List, Detail & Usage · Contract (GWT)

## C1 — List
- **GIVEN** a logged-in super-admin
- **WHEN** they open `/admin`
- **THEN** they see a paginated, searchable list of tenants (name, slug, plan, status), rendered from `GET /admin/tenants`.

## C2 — Detail + usage
- **GIVEN** the tenant list
- **WHEN** the super-admin opens a tenant
- **THEN** they see its plan, limits, configuration and user count (F03) plus its usage counts (F04).

## C3 — Audit view
- **GIVEN** the panel
- **WHEN** the super-admin opens the audit view and applies a filter (tenant/action/status/date)
- **THEN** the filtered audit entries from `GET /admin/audit` (F09) are shown.

## C4 — Super-admin only
- **GIVEN** a logged-in non-super-admin (any tenant role)
- **WHEN** they try to reach `/admin`
- **THEN** the panel is not shown (redirected away) and no admin nav entry is visible.

## C5 — States
- **GIVEN** any panel view
- **WHEN** it is loading, empty, or errors
- **THEN** it shows a loading, empty, or error state respectively (no blank screen, no `alert()`).

## Prerequisites (the evaluator must ensure these exist)
- F02/F03/F04/F09 endpoints reachable; a super-admin account and at least one tenant with some data (for usage/detail/audit). Verified with Playwright.
