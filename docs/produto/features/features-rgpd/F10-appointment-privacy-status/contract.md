# F10 — Privacy Status & Note on Appointment · Contract (GWT)

## C1 — Appointment shows a non-clinical privacy badge
- **GIVEN** an authenticated staff user and an appointment whose client has a submitted anamnesis form (`FichaToken.status === 'usado'`) and a `dados_saude` consent `granted`
- **WHEN** the appointment surface (agenda card / detail modal) loads the client's status
- **THEN** it shows the form as **✓ preenchida** and the health-consent as **Dado**, plus the client's note (`Cliente.observacoes`)
- **AND** it renders/returns **no** clinical/anamnese content.

## C2 — Pending form shows the alert
- **GIVEN** a client with no submitted form but a link awaiting fill (only an `ativo` `FichaToken`, no `usado`)
- **WHEN** the status loads
- **THEN** the form reads **⏳ pendente** with the **"ficha por preencher"** alert and `consentimentoSaude.estado` is `pendente`.

## C3 — No clinical content exposed to any role (incl. recepcionista)
- **GIVEN** a `recepcionista` token
- **WHEN** `GET /api/v1/gdpr/clientes/:id/estado-privacidade` (or the batch read)
- **THEN** it returns `200` with status only (booleans + enum + date + note)
- **AND** the payload contains **no** anamnese keys (`alergias`, `historicoMedico`, `medicamentosEmUso`, `observacoesAdicionaisAnamnese`, …) — clinical detail remains only in the gated tab (F03).

## C4 — Filled form with withdrawn consent (independence)
- **GIVEN** a client with a `usado` `FichaToken` and a `dados_saude` history of `granted` then `withdrawn`
- **WHEN** the status loads
- **THEN** `fichaPreenchida` is `true` and `consentimentoSaude.estado` is `withdrawn` (the form-filled signal and the consent state are independent).

## C5 — Health-consent reflects the latest F01 entry
- **GIVEN** the latest `dados_saude` `ConsentLog` entry for a client
- **WHEN** the status is derived
- **THEN** `consentimentoSaude.estado` equals that entry's action (`granted`/`withdrawn`), with its date; no entry → `pendente` with `data: null`.

## C6 — Batch read for the agenda (no N+1)
- **GIVEN** an agenda page with multiple client appointments
- **WHEN** `GET /api/v1/gdpr/estado-privacidade?clienteIds=...` is called once with the unique ids (≤100)
- **THEN** it returns a map keyed by `clienteId` with each client's `fichaPreenchida`/`fichaEnviada`/`consentimentoSaude`
- **AND** unknown or cross-tenant ids are silently omitted from the map (no enumeration, no 404).

## C7 — Note reuses Cliente.observacoes (no new field)
- **GIVEN** staff editing the client record (or closing a lead)
- **WHEN** they save a free-text observation
- **THEN** it persists to the existing `Cliente.observacoes` via `PUT /clientes/:id` (no new backend field) and the saved note appears on the appointment/record status.

## C8 — Lead-closing observation + send action
- **GIVEN** a lead being closed and converted to a client
- **WHEN** staff fill the observation and click "Enviar ficha de consentimento"
- **THEN** the observation is written to the **converted** client's `Cliente.observacoes`
- **AND** the send invokes F05's `POST /gdpr/clientes/:id/enviar-ficha` for the converted client (F10 adds no new send logic and writes no `ConsentLog`).

## C9 — Lead-only appointments have no badge
- **GIVEN** an appointment of `tipo: 'Avaliacao'` with no `cliente` (a lead)
- **WHEN** the agenda renders it
- **THEN** no privacy badge is shown (the form targets `Cliente` only; the badge appears after conversion).

## C10 — Validation
- **GIVEN** an invalid `:id` (single) or malformed/over-limit `clienteIds` (batch, >100 or non-ObjectId)
- **WHEN** the read endpoint is called
- **THEN** it returns `400` with the offending field; an unknown client on the single read → `404`.

## C11 — Tenant isolation
- **GIVEN** a Tenant B token
- **WHEN** reading Tenant A's client status
- **THEN** the single read returns `404` and the batch omits A's id from B's map — Tenant A's data is never returned.

## C12 — Graceful degradation
- **GIVEN** the privacy-status read fails (network/error)
- **WHEN** the agenda renders
- **THEN** appointments still render (the badge shows a neutral/loading state); privacy status never blocks the agenda; errors surface via toast, never `alert()`.

## Prerequisites (the evaluator must ensure these exist)
- F01 (`ConsentLog` + latest-by-type index), F04 (`FichaToken` with `status` lifecycle), F05 (`POST /gdpr/clientes/:id/enviar-ficha`) implemented and registered.
- `mongodb-memory-server` test environment; seeded `Cliente`, `FichaToken`, and `ConsentLog` rows in the acting tenant; JWT/auth test helper for roles (`admin`, `gerente`, `recepcionista`, `terapeuta`).
- Frontend: design-system tokens available; `api.js`, `useAuth`, `react-toastify`, luxon present. External services (Evolution/WhatsApp for the F05 send) mocked per `.claude/rules/testing.md`.
