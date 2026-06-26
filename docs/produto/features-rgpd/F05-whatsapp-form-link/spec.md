# F05 — WhatsApp Form Link Delivery — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F05)
**Complexity:** moderate
**Module:** `src/modules/gdpr/` (extend F01/F04) + a panel button on the client record (`laura-saas-frontend/src/pages/EditarCliente.jsx`) — backend, tenant-scoped
**Depends on:** F04 (Self-Service Anamnesis & Consent Form — `FichaToken`, `FichaToken.emitir`, the public `/ficha/:token` page) → which depends on F01 (the `gdpr` module scaffolding)

---

## 1. Scope

**Consumes (from F04):**
- Form access **token** issuance — `FichaToken.emitir(models, { tenantId, clienteId, emitidoPor })` (the single append/revoke-aware write point F04 exposes); it revokes prior `ativo` tokens, creates a fresh one (`expiresAt = now + 14d`), and returns the raw token **once**.
- The public link shape `/ficha/:token` that the F04 page resolves and renders.
- Active policy version is **not** needed here (F05 sends a link; it captures no consent).

**Consumes (from the existing codebase):**
- `sendWhatsAppMessage(to, message, instanceName)` — `src/utils/evolutionClient.js` (the WhatsApp text send client; reused, not reinvented).
- `Tenant.whatsapp.instanceName` — the tenant's Evolution connection (same resolution idiom as `src/modules/leads/leadController.js` `manualReply`).
- `process.env.FRONTEND_URL` — public base URL for building the link (never hardcoded).

**Included (this spec):**
- `POST /gdpr/clientes/:id/enviar-ficha` — authenticated staff action that issues a fresh F04 token for the client and sends the `/ficha/:token` link to that client's WhatsApp over the tenant's Evolution connection.
- A "Enviar ficha por WhatsApp" button on the client record page that calls the endpoint, surfaces success ("ficha enviada") / failure, and respects the staff-only gate.

**Provides (to later features):** nothing downstream consumes F05; it is a terminal action (Wave 3).

**Deferred / out of scope (deliberate decision 2026-06-25):** AI/messaging-triggered **auto-send is intentionally NOT done**. The link is sent **manually by the clinic staff/owner from the panel**, at the moment they close treatment with the client (after talking through the procedures in person). Rationale: the AI does not close packages and only routes leads to the clinic's in-person evaluation; the AI also cannot reliably tell whether it is the client's first visit, so a human decides when consent is collected. Also deferred: durable per-token "sent at" tracking / delivery timeline; configurable per-tenant message template. Core ships the explicit panel action + a constant message template.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/modules/gdpr/fichaController.js` | edit | add `enviarFichaWhatsApp` (authenticated staff): validate client + connection, issue token via `FichaToken.emitir`, build URL, send via Evolution |
| `src/modules/gdpr/gdprRoutes.js` | edit | add `POST /clientes/:id/enviar-ficha` (authenticated) to the existing F01/F04 router, with `authorize` + `validateObjectId` |
| `src/modules/gdpr/fichaMessage.js` | new | `FICHA_MESSAGE_TEMPLATE` + `buildFichaMessage({ nome, url })` (the PT-PT transactional message text) |
| `src/modules/gdpr/fichaUrl.js` | new (optional, shared) | `buildFichaUrl(token)` from `process.env.FRONTEND_URL` — reused by F04 issuance and F05 send (avoids divergence) |
| `laura-saas-frontend/src/pages/EditarCliente.jsx` | edit | add "Enviar ficha por WhatsApp" button → `api.post('/gdpr/clientes/:id/enviar-ficha')`; toast + "ficha enviada" state; disabled while sending |
| `tests/gdpr-ficha-envio.test.js` | new | integration tests (Jest + supertest + mongodb-memory-server), Evolution client mocked |

Pattern references: F04 (`src/modules/gdpr/fichaController.js`, `FichaToken.emitir`, `process.env.FRONTEND_URL` URL build), `src/modules/leads/leadController.js` `manualReply` (tenant `whatsapp.instanceName` lookup + `sendWhatsAppMessage` + 502 on failure), `src/utils/evolutionClient.js` (send client), `src/middlewares/{auth,validateObjectId}.js`.

---

## 3. Data Model

**No new model.** F05 reuses F04's `FichaToken` (tenant DB) and the existing `Cliente` (for `nome`/`telefone`) and `Tenant` (for `whatsapp.instanceName`). F05 does **not** add fields to `FichaToken` (no schema change to F04). The durable signal that a form was requested is the existence of an `ativo` `FichaToken` (from F04); the "ficha enviada" state in the UI is reflected from the successful send response (see §5 R6 and Assumptions).

F05 writes **no** `ConsentLog` entry — sending a transactional/service link is not a consent event (see §5 R1).

---

## 4. API Contracts

### POST /gdpr/clientes/:id/enviar-ficha — issue + send the form link (authenticated staff)
Mounted via the F01/F04 `gdpr` router → `/api/gdpr/...` + `/api/v1/gdpr/...`, behind `authenticate`.
- `authorize('admin','gerente','recepcionista','terapeuta')` — any staff may send the link (operational, non-clinical action; `superadmin` bypasses). Mirrors F04 issuance roles.
- Validates `:id` is a valid ObjectId and the `Cliente` exists in `req.tenantId` (else 404, never 403).
- Requires the client to have a `telefone` (else 400) and the tenant to have an active WhatsApp connection — `tenant.whatsapp.instanceName` set (else 409).
- Issues a fresh token via `FichaToken.emitir(req.models, { tenantId: req.tenantId, clienteId, emitidoPor: req.user._id })` (revokes prior `ativo` tokens per F04 R2), builds the URL from `process.env.FRONTEND_URL`, and sends a transactional message via `sendWhatsAppMessage(cliente.telefone, mensagem, tenant.whatsapp.instanceName)`.

Request body: none (the client is identified by `:id`; token is server-issued).

Response `200`:
```json
{ "success": true, "data": {
  "enviado": true,
  "clienteId": "665...",
  "telefone": "351912345678",
  "expiresAt": "2026-07-10T..."
} }
```
- The raw token / URL is **not** returned in the response (it goes only to the client over WhatsApp; F04 already returns it once at issuance for the copy-link flow). F05's response confirms delivery, not the secret.

---

## 5. Requirements / Business Rules

- **R1.** The form link is a **transactional / service message**, not marketing — so F05 is **NOT** gated by the F09 communications opt-in (`whatsapp_optin`/`marketing`) and creates **no** `ConsentLog` entry. (PRD §6 F09 explicitly excludes "the anamnesis form link" from opt-in gating.)
- **R2.** A fresh token is issued on every send via `FichaToken.emitir`. Because F04 stores only `tokenHash` (the raw token is never retrievable — F04 R3), a previously-issued link's secret cannot be re-fetched; therefore each send rotates the token (revoking the prior `ativo` one per F04 R2).
- **R3.** **Idempotent for retry:** a WhatsApp send failure surfaces an error (502) and leaves the just-issued token **valid** (`ativo`, not revoked, not used) so the staff can retry; a retry issues another fresh token and sends. No duplicate side effects beyond token rotation; no consent/financial writes.
- **R4.** No active WhatsApp connection for the tenant (`tenant.whatsapp.instanceName` absent) → 409 with a clear "connect WhatsApp first" message; no token is issued (the connection is checked before issuance).
- **R5.** Tenant-scoped: the `Cliente`, the `FichaToken`, and the `Tenant.whatsapp.instanceName` are all resolved within `req.tenantId`; a staff user can never send a link for another tenant's client (cross-tenant client → 404).
- **R6.** The action carries no request body and no client-supplied identifiers beyond `:id`; `tenantId`, `emitidoPor`, and the token are server-derived (no mass assignment). The "ficha enviada" status shown to the clinic is reflected from the 200 response (Core); durable per-send tracking is deferred.
- **R7.** The public link is built exclusively from `process.env.FRONTEND_URL` (never a hardcoded host); the link path is `/ficha/:token` per F04.

**UX flow:** admin opens the client record → clicks "Enviar ficha por WhatsApp" → on success a toast "Ficha enviada por WhatsApp" and the button reflects "ficha enviada"; on failure an inline/toast error with the reason (no connection / send failed) and the button re-enables for retry.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Invalid `:id` ObjectId | 400 | `{ success:false, error:'ID inválido' }` |
| Client not in tenant (or other tenant) | 404 | `{ success:false, error:'Cliente não encontrado' }` |
| Client has no `telefone` | 400 | `{ success:false, error:'Cliente não tem telefone registado' }` |
| No active WhatsApp connection for tenant | 409 | `{ success:false, error:'Sem ligação WhatsApp activa. Ligue o WhatsApp primeiro.' }` |
| WhatsApp send failure (Evolution error / not configured) | 502 | `{ success:false, error:'Falha ao enviar pelo WhatsApp. Tente novamente.', details: '<evolution error>' }` |
| No token / invalid JWT | 401 | handled by `authenticate` |
| Forbidden role | 403 | `{ success:false, error:'Sem permissão...' }` (via `authorize`) |
| Unexpected | 500 | `{ success:false, error:'Erro interno' }` |

**Notes:** the connection check (409) runs **before** token issuance so a misconfigured tenant never rotates tokens. A send failure returns 502 (mirrors `leadController.manualReply`) and intentionally leaves the issued token valid for retry (R3). No stack traces to the client; `details` carries the Evolution error string only.

---

## 7. Assumptions / Decisions

- `[Auto-Accept]` **Endpoint name** = `POST /gdpr/clientes/:id/enviar-ficha` (sibling of F04's `POST /gdpr/clientes/:id/ficha-token`, same router, same `:id` semantics). PT verb mirrors the existing `enviar-lembrete` naming convention in `.claude/rules/express-routes.md`.
- `[Auto-Accept]` **Token composition with sending** = F05 calls F04's `FichaToken.emitir` to issue a fresh token, then builds the URL and sends. It does **not** re-use a prior token (impossible — only the hash is stored, F04 R3) and does **not** duplicate F04's revoke/create logic.
- `[Auto-Accept]` **No `ConsentLog` write.** The PRD line "Records a `ConsentLog (whatsapp_optin)`-relevant context where applicable" is read as *not applicable here*: sending a transactional link captures no opt-in. Communications consent is owned by F09. This honors the cross-feature rule that the form link is not marketing and not opt-in-gated.
- `[Auto-Accept]` **"Active connection" signal** = `tenant.whatsapp.instanceName` is set (the same field `leadController.manualReply` passes to `sendWhatsAppMessage`, and the unique routing key in `Tenant.js`). Absent → 409, no send attempted. (Deeper liveness — Evolution `connectionState` — is deferred.)
- `[Auto-Accept]` **No-connection status code** = 409 Conflict (tenant state prevents the action), distinct from 502 (a connection exists but the send failed). This makes "connect first" vs "retry" distinguishable to the UI.
- `[Auto-Accept]` **Roles** = `admin, gerente, recepcionista, terapeuta` (any staff; `superadmin` bypasses) — identical to F04 issuance; sending a client their own form link is operational and exposes no clinical data.
- `[Auto-Accept]` **Message template** = a constant PT-PT transactional text in `fichaMessage.js`, e.g. `"Olá {nome}! 👋 Antes da sua consulta, por favor preencha a sua ficha de anamnese e consentimento neste link seguro: {url}\n\nO link é pessoal e válido por 14 dias."` `{nome}` from `Cliente.nome`, `{url}` from `buildFichaUrl(token)`. Per-tenant customizable template is deferred (no new `Tenant` field in Core).
- `[Auto-Accept]` **URL build** = `${process.env.FRONTEND_URL}/ficha/${token}` via a shared `buildFichaUrl` helper, mirroring F04's `url` field; no hardcoded host. In tests `FRONTEND_URL` is set in the test env (or defaults to `http://localhost:5173` like `emailService.js`).
- `[Auto-Accept]` **Response omits the raw token/URL** — the secret travels only over WhatsApp; F04's issuance endpoint remains the one place that returns the raw link (for a manual copy-link flow). F05 returns delivery confirmation only.
- `[Auto-Accept]` **"Ficha enviada" status** is reflected client-side from the 200 response (toast + local button state). Durable per-token send tracking / delivery timeline is Full-Scope (would add an `enviadoEm` field owned by F04's model — out of scope here, no F04 schema change).
- `[Auto-Accept]` **Frontend host page** = `laura-saas-frontend/src/pages/EditarCliente.jsx` (the client record page). The button uses the design system (indigo/purple) and `api.js`; gating by role uses `useAuth()`.
- `[Auto-Accept]` **Evolution client mocked in tests** (per `.claude/rules/testing.md`); rate limiting is not added here (this is an authenticated staff route, not a public surface).

---

## 8. Testing Strategy

`tests/gdpr-ficha-envio.test.js` (Jest ESM + supertest + `mongodb-memory-server`; `sendWhatsAppMessage` mocked per `.claude/rules/testing.md`).

**Acceptance (from PRD §9 F05):**
- `sending delivers the /ficha/:token link to the client's WhatsApp via the tenant's connection` — seed a `Cliente` with `telefone` and a tenant with `whatsapp.instanceName`; `POST /gdpr/clientes/:id/enviar-ficha` → 200 `{ enviado:true }`; assert `sendWhatsAppMessage` called once with the client's phone, the tenant's `instanceName`, and a message containing `${FRONTEND_URL}/ficha/<token>`; assert exactly one new `ativo` `FichaToken` exists for the client.
- `a send failure surfaces an error and leaves the token valid for retry` — make `sendWhatsAppMessage` resolve `{ success:false }`; expect 502; assert the most recent `FichaToken` is still `ativo` (not revoked/used); a second call (mock success) → 200 and sends a fresh link.
- `no active connection shows a clear message` — tenant without `whatsapp.instanceName` → 409 with the connect-first message; assert **no** `FichaToken` was created and `sendWhatsAppMessage` was **not** called.

**Validation / negative:**
- `invalid :id → 400`; `unknown client → 404`; `client without telefone → 400` (no token issued, no send).
- `no ConsentLog is written by sending` — assert `ConsentLog` count is unchanged after a successful send (R1).
- `forbidden role` — if any non-staff token exists, `403`; staff roles → allowed.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B cannot send a link for Tenant A's client` → 404; no token issued in A; `sendWhatsAppMessage` not called.

**Cross-feature note (verified manually / in F04):** the token F05 issues resolves through F04's `GET /ficha/:token` to the public form; F05 only asserts the URL/token shape, not the F04 render path.
