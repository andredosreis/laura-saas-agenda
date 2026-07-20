# F04 — Self-Service Anamnesis & Consent Form · Contract (GWT)

> Consolidated 2026-07-20 with [../RECONCILIATION.md](../RECONCILIATION.md) R7 (proof model v2: one `ConsentLog dados_saude` + `NoticeReceipt`, `actor`/`textoHash`/`fichaTokenId`) and R8 (communications checkboxes are Core here), plus the transactional submit (spec R13/R14).

## C1 — Issue a token scoped to {tenantId, clienteId}
- **GIVEN** an authenticated staff user and a `Cliente` in their tenant
- **WHEN** `POST /api/v1/gdpr/clientes/:id/ficha-token`
- **THEN** it returns 201 with `{ token, url, expiresAt, clienteId }`, `expiresAt ≈ now + 14 days`
- **AND** the stored `FichaToken` holds only `tokenHash` (no plaintext token in the DB).

## C2 — Regeneration invalidates the previous token
- **GIVEN** a previously issued, still-`ativo` token for a client
- **WHEN** a new token is issued for the same client
- **THEN** the previous token's `GET /ficha/:oldToken` returns 404 (revoked) and the new token resolves normally.

## C3 — Public render only for a valid token, serving the full Art. 13 notice
- **GIVEN** a valid (`ativo`, unexpired) token
- **WHEN** `GET /ficha/:token`
- **THEN** it returns 200 with the render payload (`clienteNome`, `clinicaNome`, `politicaVersao`, `politicaHash`, `politicaTexto` — the sectioned Art. 13 notice with the clinic interpolated — blank `campos`) and no enumerable PII (no `clienteId`, telefone, email).

## C4 — Friendly errors for expired / used / invalid tokens (no leak)
- **GIVEN** an expired token → `GET/POST /ficha/:token` returns 410 with a friendly message
- **AND GIVEN** an already-submitted (`usado`) token → 410 with "request a new link"
- **AND GIVEN** a revoked / unknown / malformed token → 404 flat, with no signal that distinguishes it and no data leak.

## C5 — Consent is required and not pre-checked
- **GIVEN** a valid token and a submit body without `consentimento === true`
- **WHEN** `POST /ficha/:token`
- **THEN** it returns 400, writes nothing to the `Cliente`, and creates no `ConsentLog`/`NoticeReceipt` entry (the form is preserved client-side).

## C6 — Successful submit writes anamnese + consent + notice receipt (R7)
- **GIVEN** a valid token and a valid body with `consentimento: true`
- **WHEN** `POST /ficha/:token`
- **THEN** the allow-listed anamnese fields are written to the `Cliente`
- **AND** exactly one `ConsentLog` entry is appended — `tipo:'dados_saude'`, `accao:'granted'`, `actor:'titular'`, `origem:'formulario'`, `versao:POLICY_VERSION`, `textoHash` equal to the render's `politicaHash`, `fichaTokenId` set, `registadoPor: null`
- **AND** exactly one `NoticeReceipt` is appended (`versao`, same `textoHash`, `canal:'formulario'`)
- **AND** the token becomes `status:'usado'` with `usadoEm` set — all writes in one transaction (spec R14).

## C7 — Single-use (already submitted)
- **GIVEN** a token that was already used by a successful submit
- **WHEN** `POST /ficha/:token` again
- **THEN** it returns 410 and creates no duplicate anamnese/consent/notice writes.

## C8 — No mass assignment on submit
- **GIVEN** a submit body that also includes `tenantId` / `_id` / `status` / arbitrary keys
- **WHEN** the submission is processed
- **THEN** only the allow-listed anamnese fields + `consentimento` are honored; server-controlled fields take server values.

## C9 — Tenant isolation
- **GIVEN** a Tenant B staff user
- **WHEN** issuing a token for a Tenant A client → it returns 404
- **AND GIVEN** a Tenant A token whose `tenantId` segment is tampered → the hash lookup misses and `GET/POST /ficha/:token` returns 404; a Tenant A token never writes to Tenant B.

## C10 — Public endpoints are rate-limited
- **GIVEN** the public router
- **WHEN** `/ficha/:token` is mounted
- **THEN** `GET` is behind `fichaViewLimiter` and `POST` behind `fichaSubmitLimiter` (429 on excess in non-test env), and the routes are mounted OUTSIDE the authenticated `apiResources` loop (no JWT required).

## C11 — Issuance requires authentication
- **GIVEN** no/invalid JWT
- **WHEN** `POST /api/v1/gdpr/clientes/:id/ficha-token`
- **THEN** it returns 401; an invalid `:id` ObjectId returns 400; a client not in the tenant returns 404 (never 403).

## C12 — Public form page (frontend)
- **GIVEN** the SPA route `/ficha/:token`
- **WHEN** an unauthenticated visitor opens it
- **THEN** the page renders OUTSIDE `ProtectedLayout` (no `useAuth`, no login redirect), shows the clinic name + the Art. 13 notice **before** the checkboxes, the anamnese form with a non-pre-checked required health-consent checkbox and two non-pre-checked optional communications checkboxes, and on success shows a confirmation screen; expired/invalid tokens render the friendly error state. Requests go to the backend origin **without** the `/api/v1` suffix.

## C13 — Communications checkboxes are optional, granular and titular-attributed (R8)
- **GIVEN** a valid token and a submit with `comunicacoes: { whatsapp_optin: true }` (and `marketing` unticked)
- **WHEN** the submission succeeds
- **THEN** exactly one additional `ConsentLog` entry exists — `tipo:'whatsapp_optin'`, `accao:'granted'`, `actor:'titular'`, `origem:'formulario'`, `fichaTokenId` set — and **no** `marketing` entry is created
- **AND GIVEN** a submit with no `comunicacoes`, no communications entry is created (the F01 `estadoAtual` reads `pendente`).

## C14 — Concurrent double-submit has exactly one winner (spec R13)
- **GIVEN** two concurrent `POST /ficha/:token` requests on the same valid token
- **WHEN** both race the atomic claim
- **THEN** exactly one returns 200 (with the full write set) and the other returns 410 with zero writes — verified by exact `ConsentLog`/`NoticeReceipt` counts.

## C15 — Transaction failure compensates the claim (spec R14)
- **GIVEN** a valid submit whose post-claim transaction is forced to fail
- **WHEN** `POST /ficha/:token`
- **THEN** it returns 500, the token is back to `status:'ativo'` (retry possible), and no `Cliente`/`ConsentLog`/`NoticeReceipt` write survives.

## Prerequisites (the evaluator must ensure these exist)
- **F01 is implemented (v2, R7)**: `ConsentLog` (with `actor`/`evidencia`/`textoHash`/`fichaTokenId`) + `NoticeReceipt` + `record()` statics, `src/modules/gdpr/` router (dual-mounted), `POLICY_VERSION` and `privacyNotice.js` (created here).
- **`MongoMemoryReplSet`** test environment for this suite (the submit transaction requires a replica set); seeded `Cliente` in the acting tenant; JWT/auth test helper for roles.
- `process.env.FRONTEND_URL` set (used to build the `url`).
- Rate limiters `skip` in `NODE_ENV==='test'`; external services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
