# F03 — Clinical Tab in Client Record · Contract (GWT)

> Consolidated 2026-07-19 with [../RECONCILIATION.md](../RECONCILIATION.md) R2/R3/R4 — consent state comes from the single F02 `/clinico` payload; there is no separate F01 consent call.

## C1 — Tab gated to permitted roles
- **GIVEN** a logged-in user on the client-record page (`EditarCliente`)
- **WHEN** `useAuth().user.role` is `admin`, `gerente`, `terapeuta` or `superadmin`
- **THEN** a "Clínico" tab button is shown
- **AND GIVEN** the role is `recepcionista` (or unknown), the tab button is **not rendered at all** (not merely disabled).

## C2 — Receptionist never reaches clinical data
- **GIVEN** a `recepcionista` session
- **WHEN** the client record is open
- **THEN** `GET /clientes/:id/clinico` is **never called** and no clinical content appears anywhere in the page.

## C3 — Sensitivity badge present
- **GIVEN** a permitted user opens the Clinical tab
- **WHEN** the tab content renders
- **THEN** the badge **"🔒 Dados clínicos sensíveis"** is visible.

## C4 — Consent status from the payload (pending)
- **GIVEN** the `/clinico` payload carries `consentimentoSaude.estado === 'pendente'`
- **WHEN** the Clinical tab renders
- **THEN** the consent indicator shows **Pendente** and the anamnesis fields render normally (legacy data stays visible — R4).

## C5 — Consent status from the payload (granted with date)
- **GIVEN** the `/clinico` payload carries `consentimentoSaude: { estado: 'granted', data: 2026-06-25T... }`
- **WHEN** the Clinical tab renders
- **THEN** the indicator shows **Dado a 25-06-2026** (zero-padded `DD-MM-AAAA`, `Europe/Lisbon`).

## C6 — Withdrawn state (R4): badge, no clinical content, CTAs
- **GIVEN** the `/clinico` payload carries `consentimentoSaude.estado === 'withdrawn'` (and therefore zero clinical keys)
- **WHEN** the Clinical tab renders
- **THEN** the indicator shows **Retirado**, **no** anamnesis content is rendered, and the CTAs **"Reenviar ficha"** (F05) and **"Apagar dados"** (F07) are shown — each rendered/enabled only where its feature exists (F05 is wave 3).

## C7 — Opening the tab triggers the F02 read-audit
- **GIVEN** a permitted user
- **WHEN** the Clinical tab is opened
- **THEN** `GET /clientes/:id/clinico` is called **exactly once** (that call is what records the `AcessoClinicoLog` entry) — and it is the **only** call (no `GET /gdpr/consent`)
- **AND** re-rendering the tab for the same client does not re-issue the call.

## C8 — Anamnesis rendered for permitted user
- **GIVEN** the `/clinico` payload returns clinical fields (state granted/pendente)
- **WHEN** the Clinical tab renders
- **THEN** the anamnesis fields are displayed read-only alongside the sensitivity and consent badges.

## C9 — States: loading, empty, error
- **GIVEN** the `/clinico` read is pending → a loading indicator is shown (no frozen screen, no `alert()`).
- **GIVEN** a permitted user but an empty anamnesis → an empty state is shown (badge + "sem dados clínicos registados").
- **GIVEN** the `/clinico` read fails (network/500) → an inline error with a retry affordance is shown and the tab stays usable.

## C10 — Missing consent state degrades gracefully
- **GIVEN** the `/clinico` payload unexpectedly lacks `consentimentoSaude` but carries clinical fields
- **WHEN** the Clinical tab renders
- **THEN** the clinical fields still render and the consent indicator shows an unavailable/"—" state instead of blocking the tab.

## C11 — Design system & conventions
- **GIVEN** the new components
- **THEN** they use the design system (indigo/purple, slate, glassmorphism), are authored as `.tsx`/`.ts`, use `react-toastify`/inline messages (never `alert()`), and call the backend only through `src/services/api.js`.

## Prerequisites (the evaluator must ensure these exist)
- **F02** deployed per its consolidated contract: `GET /clientes/:id/clinico` returns anamnesis + `consentimentoSaude` in one payload for permitted roles, writes one `AcessoClinicoLog` per call, 403 for `recepcionista`, 404 cross-tenant, and the R4 withdrawn shape (consent state only). F01 is only a transitive dependency (F02's helper); F03 needs no F01 endpoint.
- Frontend test stack: Vitest + @testing-library/react with `src/services/api` and `useAuth` mockable; Playwright for the E2E gate + audit-trigger check.
- Seed data: clients whose `/clinico` state resolves to (a) `pendente`, (b) `granted` (with date), (c) `withdrawn` (seeded via F01 `dados_saude` entries in the backend); users for roles `admin`/`gerente`/`terapeuta`/`recepcionista`.
