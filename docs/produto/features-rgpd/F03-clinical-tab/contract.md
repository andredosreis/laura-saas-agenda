# F03 — Clinical Tab in Client Record · Contract (GWT)

## C1 — Tab gated to permitted roles
- **GIVEN** a logged-in user on the client-record page (`EditarCliente`)
- **WHEN** `useAuth().user.role` is `admin`, `gerente`, `terapeuta` or `superadmin`
- **THEN** a "Clínico" tab button is shown
- **AND GIVEN** the role is `recepcionista` (or unknown), the tab button is **not rendered at all** (not merely disabled).

## C2 — Receptionist never reaches clinical data
- **GIVEN** a `recepcionista` session
- **WHEN** the client record is open
- **THEN** the clinical read endpoint (F02) is **never called** and no clinical content appears anywhere in the page.

## C3 — Sensitivity badge present
- **GIVEN** a permitted user opens the Clinical tab
- **WHEN** the tab content renders
- **THEN** the badge **"🔒 Dados clínicos sensíveis"** is visible.

## C4 — Consent status reflects F01 (pending)
- **GIVEN** a client with **no** `dados_saude` consent entry
- **WHEN** the Clinical tab renders
- **THEN** the consent indicator shows **Pendente**.

## C5 — Consent status reflects F01 (granted with date)
- **GIVEN** the latest `dados_saude` entry is `accao: granted` with `createdAt` = 2026-06-25
- **WHEN** the Clinical tab renders
- **THEN** the indicator shows **Dado a 25-06-2026** (zero-padded `DD-MM-AAAA`, `Europe/Lisbon`).

## C6 — Consent status reflects F01 (withdrawn)
- **GIVEN** the latest `dados_saude` entry is `accao: withdrawn`
- **WHEN** the Clinical tab renders
- **THEN** the indicator shows **Retirado**.

## C7 — Opening the tab triggers the F02 read-audit
- **GIVEN** a permitted user
- **WHEN** the Clinical tab is opened
- **THEN** the F02 clinical read endpoint is called **exactly once** (that call is what records the `AcessoClinicoLog` entry)
- **AND** re-rendering the tab for the same client does not re-issue the call.

## C8 — Anamnesis rendered for permitted user
- **GIVEN** the F02 read path returns clinical fields
- **WHEN** the Clinical tab renders
- **THEN** the anamnesis fields are displayed read-only alongside the sensitivity and consent badges.

## C9 — States: loading, empty, error
- **GIVEN** the clinical read is pending → a loading indicator is shown (no frozen screen, no `alert()`).
- **GIVEN** the permitted user but an empty anamnesis → an empty state is shown (badge + "sem dados clínicos registados").
- **GIVEN** the clinical read fails (network/500) → an inline error with a retry affordance is shown and the tab stays usable.

## C10 — Consent failure degrades gracefully
- **GIVEN** the F01 consent request fails but the clinical read succeeds
- **WHEN** the Clinical tab renders
- **THEN** the clinical fields still render and the consent indicator shows an unavailable/"—" state instead of blocking the tab.

## C11 — Design system & conventions
- **GIVEN** the new components
- **THEN** they use the design system (indigo/purple, slate, glassmorphism), are authored as `.tsx`/`.ts`, use `react-toastify`/inline messages (never `alert()`), and call the backend only through `src/services/api.js`.

## Prerequisites (the evaluator must ensure these exist)
- **F01** deployed: `GET /gdpr/consent?clienteId=` returns `dados_saude` history sorted `createdAt` desc.
- **F02** deployed: a role-gated clinical read path (assumed `GET /clientes/:id/clinico`) that returns anamnesis for permitted roles and writes one `AcessoClinicoLog` per call; 403/404 for non-permitted/cross-tenant.
- Frontend test stack: Vitest + @testing-library/react with `src/services/api` and `useAuth` mockable; Playwright for the E2E gate + audit-trigger check.
- Seed data: a client with (a) no consent, (b) latest `dados_saude` granted, (c) latest `dados_saude` withdrawn; users for roles `admin`/`gerente`/`terapeuta`/`recepcionista`.
