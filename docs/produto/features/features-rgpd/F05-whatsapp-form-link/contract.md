# F05 — WhatsApp Form Link Delivery · Contract (GWT)

## C1 — Send delivers the form link over WhatsApp
- **GIVEN** an authenticated staff user, a `Cliente` with a `telefone` in the tenant, and a tenant with an active connection (`whatsapp.instanceName` set)
- **WHEN** `POST /api/v1/gdpr/clientes/:id/enviar-ficha`
- **THEN** it returns 200 `{ success:true, data:{ enviado:true, ... } }`
- **AND** `sendWhatsAppMessage` is called exactly once with the client's `telefone`, the tenant's `instanceName`, and a message containing the link `${FRONTEND_URL}/ficha/<token>`
- **AND** exactly one `ativo` `FichaToken` for that client now exists (issued via F04's `FichaToken.emitir`).

## C2 — Transactional, not marketing (no consent gate, no consent write)
- **GIVEN** a client with no `whatsapp_optin`/`marketing` consent on record
- **WHEN** the link is sent
- **THEN** the send still succeeds (it is a transactional/service message, not gated by the F09 opt-in)
- **AND** no `ConsentLog` entry is created by the send.

## C3 — Send failure is idempotent for retry (token stays valid)
- **GIVEN** the Evolution send fails (`sendWhatsAppMessage` → `{ success:false }`)
- **WHEN** `POST /api/v1/gdpr/clientes/:id/enviar-ficha`
- **THEN** it returns 502 with a clear error
- **AND** the just-issued `FichaToken` remains `ativo` (not revoked, not used)
- **AND** a subsequent retry (send succeeding) returns 200 and delivers a fresh valid link.

## C4 — No active WhatsApp connection → clear message, nothing issued
- **GIVEN** a tenant without `whatsapp.instanceName`
- **WHEN** `POST /api/v1/gdpr/clientes/:id/enviar-ficha`
- **THEN** it returns 409 with a "connect WhatsApp first" message
- **AND** no `FichaToken` is created and `sendWhatsAppMessage` is never called.

## C5 — Input validation
- **GIVEN** an invalid `:id` ObjectId → 400 `ID inválido`; **OR** an unknown client (not in tenant) → 404 `Cliente não encontrado`; **OR** a client without `telefone` → 400 `Cliente não tem telefone registado`
- **WHEN** `POST /api/v1/gdpr/clientes/:id/enviar-ficha`
- **THEN** it returns the stated status, issues no token, and sends nothing.

## C6 — URL built from config (no hardcoded host)
- **GIVEN** `process.env.FRONTEND_URL` configured
- **WHEN** the link is sent
- **THEN** the message link is `${FRONTEND_URL}/ficha/<token>` and contains no hardcoded host.

## C7 — Server-derived fields / no mass assignment
- **GIVEN** a request (no meaningful body; the client is `:id`)
- **WHEN** the token is issued and sent
- **THEN** `tenantId`, `emitidoPor` (`req.user._id`), and the token are server-derived; no client-supplied `tenantId`/token is honored
- **AND** the raw token/URL is **not** returned in the response (it travels only over WhatsApp).

## C8 — Role gate
- **GIVEN** a staff token (`admin`/`gerente`/`recepcionista`/`terapeuta`, or `superadmin`)
- **WHEN** `POST /api/v1/gdpr/clientes/:id/enviar-ficha`
- **THEN** it is allowed (subject to the other contracts); a non-permitted role returns 403.

## C9 — Tenant isolation
- **GIVEN** a Tenant B token and a Tenant A `clienteId`
- **WHEN** `POST /api/v1/gdpr/clientes/:id/enviar-ficha`
- **THEN** it returns 404 (never 403), issues no token in either tenant, and `sendWhatsAppMessage` is not called.

## Prerequisites (the evaluator must ensure these exist)
- **F04 implemented**: `FichaToken` model + `FichaToken.emitir`, the `gdpr`/`ficha` routers, and the public `/ficha/:token` route (so the issued link is resolvable).
- `mongodb-memory-server` test environment; a seeded `Cliente` (with `telefone`) and a `Tenant` with/without `whatsapp.instanceName`; JWT/auth test helper for staff roles.
- `process.env.FRONTEND_URL` set in the test env.
- `sendWhatsAppMessage` (`src/utils/evolutionClient.js`) mocked per `.claude/rules/testing.md` (no real Evolution calls).
