# F04 — Self-Service Anamnesis & Consent Form — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F04)
**Complexity:** moderate
**Module:** `src/modules/gdpr/` (extend F01) + `src/models/FichaToken.js` (new, tenant DB) + public root routes in `src/app.js` + new public frontend page `laura-saas-frontend/src/pages/FichaPublica.tsx`
**Depends on:** F01 (Consent Logging Foundation — `ConsentLog`, `POLICY_VERSION`, `gdpr` module scaffolding)

---

## 1. Scope

**Consumes (from F01):**
- Active policy version (`POLICY_VERSION` from `src/modules/gdpr/policyVersion.js`) — stamped on the consent entries the form produces.
- `ConsentLog.record()` — the single append-only write point for consent.

**Provides (to later features):**
- Form access **token** + submission **status** (consumed by F05 — WhatsApp Form Link Delivery, which sends the `/ficha/:token` link).

**Core Scope (this spec):**
- Token issuance for a specific client (authenticated, staff side).
- Public form render by token (no auth).
- Public submit by token → writes anamnesis to `Cliente` + an immutable `ConsentLog (dados_saude + politica_privacidade, granted, origem: formulario)` stamped with `POLICY_VERSION`.

**Full Scope additions (deferred — flagged, not built here):**
- Pre-fill of already-known anamnesis fields on render.
- Multi-step (wizard) UX — Core ships a single-page form.
- Localized/branded confirmation screen beyond the basic confirmation.
- **Communications opt-in on the same form** *(added 2026-07-07)*: two optional, non-pre-checked, granular checkboxes (`whatsapp_optin`, `marketing`) below the required health consent — each, when ticked, appends its own `ConsentLog` entry (`origem: 'formulario'`, stamped `POLICY_VERSION`). The form is the highest-conversion capture point for the F09 consent types; F09's booking/panel capture points remain.

**Deferred (other features):** WhatsApp delivery of the link (F05); clinical read gate + tab (F02/F03); export/erasure (F06/F07); communications opt-in (F09). F04 targets **`Cliente` only** — leads are out of scope (PRD §7).

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/models/FichaToken.js` | new | Mongoose schema (tenant DB) for the form token: hashed token, `clienteId`, `status`, `expiresAt`, `usadoEm`. Exports `FichaTokenSchema` (for registry) + default model + helpers (`statics.emitir`, `statics.resolver`) |
| `src/models/registry.js` | edit | register `FichaToken: db.model('FichaToken', FichaTokenSchema)` in `getModels` |
| `src/modules/gdpr/fichaController.js` | new | `emitirFichaToken` (authenticated staff), `renderFicha` (public GET), `submeterFicha` (public POST) |
| `src/modules/gdpr/gdprRoutes.js` | edit | add `POST /clientes/:id/ficha-token` (authenticated) to the existing F01 router |
| `src/modules/gdpr/fichaRoutes.js` | new | **public** router (no `authenticate`): `GET /:token`, `POST /:token`, behind the ficha rate limiters |
| `src/modules/gdpr/gdprSchemas.js` | edit | add Zod `submeterFichaSchema` (anamnese fields + `consentimento` boolean) |
| `src/middlewares/rateLimiter.js` | edit | add `fichaViewLimiter` and `fichaSubmitLimiter` |
| `src/app.js` | edit | mount `fichaRoutes` at `/ficha` **OUTSIDE** the authenticated `apiResources` loop (sibling of `/webhook`); not versioned |
| `laura-saas-frontend/src/pages/FichaPublica.tsx` | new | public page at route `/ficha/:token` (NOT behind `ProtectedLayout`, no `useAuth`); fetches render, posts submit, shows confirmation |
| `laura-saas-frontend/src/App.tsx` | edit | add public route `/ficha/:token` → `FichaPublica` |
| `laura-saas-frontend/src/schemas/fichaSchema.ts` | new | Zod schema mirroring the backend submit schema |
| `tests/gdpr-ficha.test.js` | new | integration tests (Jest + supertest + mongodb-memory-server) |

Pattern references: F01 (`src/modules/gdpr/*`, `ConsentLog`, `policyVersion.js`), `src/models/Cliente.js` (anamnese fields the form writes), `src/middlewares/{auth,validate,rateLimiter}.js`, `src/config/tenantDB.js` + `src/models/registry.js` (token-driven tenant DB resolution for public endpoints), `src/app.js` (`/webhook` mounted outside `apiResources` — the public ficha routes follow the same idiom).

---

## 3. Data Model — `FichaToken` (tenant DB)

```js
const FichaTokenSchema = new mongoose.Schema({
  tenantId:   { type: ObjectId, ref: 'Tenant', required: true, index: true },
  clienteId:  { type: ObjectId, ref: 'Cliente', required: true },
  tokenHash:  { type: String, required: true, unique: true }, // SHA-256 of the raw secret; plaintext NEVER stored
  status:     { type: String, required: true, enum: ['ativo', 'usado', 'revogado'], default: 'ativo' },
  expiresAt:  { type: Date, required: true }, // now + 14 days
  usadoEm:    { type: Date, default: null },  // set on successful submission
  emitidoPor: { type: ObjectId, ref: 'User', default: null }, // staff who issued (from JWT)
}, { timestamps: true });
```

**Indexes:**
```js
FichaTokenSchema.index({ tenantId: 1, clienteId: 1, createdAt: -1 }); // latest token per client (regeneration)
FichaTokenSchema.index({ tokenHash: 1 }, { unique: true });           // O(1) public resolve
// Optional housekeeping TTL on expiresAt is intentionally NOT used — we keep
// used/expired rows for auditability; a future retention job may prune them.
```

**Token lifecycle (the load-bearing rule):**
- A token is **valid** only when `status === 'ativo'` AND `expiresAt > now`.
- A **successful submission** sets `status = 'usado'`, `usadoEm = now` → the token is single-use (valid for 14 days OR until first successful submit, whichever first).
- **Regeneration** (`POST .../ficha-token` again) sets every prior `ativo` token for that `{tenantId, clienteId}` to `status = 'revogado'` before issuing a new one → the previous link stops working immediately.

**Token format & tenant resolution (no JWT on public endpoints):**
The raw token returned to the clinic is `"<tenantId>.<secret>"` where `secret` = 32 random bytes, base64url. On a public request the server splits on the first `.`, validates the `tenantId` segment as an ObjectId, resolves the tenant DB via `getTenantDB(tenantId)` + `getModels(db)`, then looks up `FichaToken` by `tokenHash = sha256(rawToken)`. The `tenantId` segment is an opaque Mongo id, not PII; it is the only routing data needed because there is no shared token index across tenant DBs.

**Registry:** add to `getModels(db)` in `src/models/registry.js`:
```js
FichaToken: db.model('FichaToken', FichaTokenSchema),
```

---

## 4. API Contracts

### POST /gdpr/clientes/:id/ficha-token — issue a token (authenticated staff)
Mounted via the F01 `gdpr` router → `/api/gdpr/...` + `/api/v1/gdpr/...`, behind `authenticate`.
- `authorize('admin','gerente','recepcionista','terapeuta')` (any staff may issue; `superadmin` bypasses).
- Validates `:id` is a valid ObjectId and the `Cliente` exists in `req.tenantId` (else 404, never 403).
- Revokes prior `ativo` tokens for the client, issues a new one (`expiresAt = now + 14d`), stamps `emitidoPor = req.user._id`, stores only `tokenHash`.

Response `201`:
```json
{ "success": true, "data": {
  "token": "665....<secret>",
  "url": "https://app.marcai/ficha/665....<secret>",
  "expiresAt": "2026-07-10T...",
  "clienteId": "665..."
} }
```
- `url` built from `process.env.FRONTEND_URL` (never hardcoded). The raw token is returned **once** at issuance; it is never retrievable again (only its hash is stored).

### GET /ficha/:token — public render (no auth, rate-limited)
Mounted at root `/ficha`, OUTSIDE `apiResources`, not versioned (sibling of `/webhook`).
- Resolves tenant DB from the token; finds a **valid** `FichaToken`.
- Returns the minimum needed to render: client first name (greeting) and any already-known anamnese values are **omitted in Core** (pre-fill is a Full-Scope addition).
- **Informed consent (2026-07-07):** the render also returns the **clinic name** (the tenant is the controller — the client consents to the *clinic*, not to Marcai) and the **policy text** the consent refers to: `politicaTexto` (template from `policyVersion.js` with the clinic name interpolated) or `politicaUrl`. The form MUST display the clinic name and the policy (inline text or expandable/link) **before** the consent checkbox.

Response `200`:
```json
{ "success": true, "data": {
  "clienteNome": "Maria",
  "clinicaNome": "Clínica Laura Estética",
  "politicaVersao": "2026-06-25",
  "politicaTexto": "A Clínica Laura Estética recolhe os dados de saúde desta ficha para... (template interpolado)",
  "campos": { /* empty/blank anamnese template in Core */ }
} }
```
- No `clienteId`, no telefone/email — no PII enumeration. The clinic name is intentionally included (the client already knows which clinic sent them the link; it is required for informed consent).

### POST /ficha/:token — public submit (no auth, rate-limited)
- Body: the anamnese fields (see §3 of `Cliente`) + `consentimento: true`.
- `consentimento` is **required and must be `true`** (the checkbox is not pre-checked); missing/false → 400, form not lost.
- On success (atomic-ish sequence): writes the anamnese fields to the `Cliente`, marks the token `usado`, and appends **two** `ConsentLog` entries via `ConsentLog.record()` — one `tipo: 'dados_saude'` and one `tipo: 'politica_privacidade'`, both `accao: 'granted'`, `origem: 'formulario'`, `versao: POLICY_VERSION`, `ip: req.ip`.

Response `200`:
```json
{ "success": true, "data": { "submetido": true } }
```

---

## 5. Requirements / Business Rules

- **R1.** A token is valid only while `status === 'ativo'` and `expiresAt > now`; first successful submit flips it to `usado` (single-use).
- **R2.** Issuing a new token revokes all prior `ativo` tokens for the same `{tenantId, clienteId}`.
- **R3.** Plaintext tokens are never stored — only `sha256(rawToken)`; the raw token is shown once at issuance.
- **R4.** Public endpoints carry no PII in the URL beyond the opaque token; render returns no enumerable identifiers.
- **R5.** Public endpoints are rate-limited per IP (see §6); failures are generic and identical for invalid/expired/used to prevent enumeration of token validity.
- **R6.** Consent is explicit: `consentimento` must be `true` to submit; the checkbox is never pre-checked.
- **R7.** A successful submit writes anamnese to the `Cliente` **and** exactly two immutable `ConsentLog` entries (`dados_saude`, `politica_privacidade`), stamped with `POLICY_VERSION` — collection and consent captured together.
- **R8.** Token issuance and submission are tenant-scoped; a token from tenant A can never write to tenant B (the `tenantId` segment + per-tenant DB enforce this); cross-tenant client on issuance → 404.
- **R9.** The submit handler accepts only the allow-listed anamnese fields + `consentimento` (no mass assignment; `tenantId`/`_id`/status are server-controlled).
- **R10.** Form targets `Cliente` only; there is no lead path.
- **R11.** *(2026-07-07)* The render returns and the form displays the **clinic name** and the **policy text/link** (`politicaTexto`/`politicaUrl` from `policyVersion.js`, clinic name interpolated) before the consent checkbox — consent must be informed and attributed to the clinic (controller), not to Marcai.
- **R12.** *(2026-07-07)* The form displays, adjacent to the consent checkbox, the declaration **"Destinado a maiores de 18 anos"** — minors/parental-consent flows are out of scope (PRD §7); the declaration makes the boundary explicit to the data subject. Exact wording to be confirmed by the PT data-protection lawyer.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Issue token: invalid `:id` ObjectId | 400 | `{ success:false, error:'ID inválido' }` |
| Issue token: client not in tenant (or other tenant) | 404 | `{ success:false, error:'Cliente não encontrado' }` |
| Issue token: no token / invalid JWT | 401 | handled by `authenticate` |
| Public GET/POST: token expired | 410 | `{ success:false, error:'Esta ligação expirou. Peça uma nova à clínica.' }` |
| Public GET/POST: token already submitted | 410 | `{ success:false, error:'Esta ficha já foi submetida. Peça uma nova ligação à clínica.' }` |
| Public GET/POST: token invalid / revoked / unknown / malformed | 404 | `{ success:false, error:'Ligação inválida.' }` (no leak, no enumeration) |
| Submit without `consentimento === true` | 400 | `{ success:false, error:'consentimento: É necessário aceitar para submeter' }` (form preserved client-side) |
| Submit: field validation error | 400 | `{ success:false, error:'<campo>: <msg>' }` (inline; submission preserved) |
| Rate limit exceeded (view) | 429 | `{ success:false, error:'Demasiados pedidos. Tente novamente mais tarde.' }` |
| Rate limit exceeded (submit) | 429 | `{ success:false, error:'Demasiados pedidos. Tente novamente mais tarde.' }` |
| Unexpected | 500 | `{ success:false, error:'Erro interno' }` |

**Security notes (public surface):** invalid vs expired vs used are distinguished only where it helps the user (friendly "ask for a new link"); a malformed/unknown token is a flat 404 with no signal. No stack traces. Rate limiting is the primary brute-force defence given the 256-bit secret.

---

## 7. Assumptions / Decisions

- `[Auto-Accept]` **Token format** = `"<tenantId>.<32-byte base64url secret>"`. The `tenantId` segment is required to route to the correct tenant DB (no cross-tenant token index exists); it is an opaque ObjectId, not PII.
- `[Auto-Accept]` **Hashing algo** = SHA-256 of the full raw token, stored in `tokenHash` (unique index). bcrypt/argon2 are unnecessary: the secret already carries 256 bits of entropy, so a fast hash is the correct, lookup-friendly choice.
- `[Auto-Accept]` **Rate limits**: `fichaViewLimiter` = 30 req / 15 min per IP; `fichaSubmitLimiter` = 10 req / hour per IP. Both `skip` in `NODE_ENV==='test'` (mirrors existing limiters).
- `[Auto-Accept]` **Single-page form** for Core scope; multi-step wizard deferred to Full Scope.
- `[Auto-Accept]` **Two `ConsentLog` entries** (one per `tipo`: `dados_saude` + `politica_privacidade`) since `ConsentLog.tipo` is a single-value enum in F01; both share the same submit transaction/timestamp/version.
- `[Auto-Accept]` **Expired/used → 410 Gone**; **invalid/revoked/unknown/malformed → 404** (no enumeration). PRD says "410/404"; this is the split.
- `[Auto-Accept]` **Token validity = 14 days** (`expiresAt = now + 14d`); rows are kept after expiry/use for auditability (no TTL index).
- `[Auto-Accept]` Public backend routes live at **root `/ficha/:token`** (outside `apiResources`, unversioned) per the literal PRD path and the `/webhook` precedent; the frontend public page also lives at `/ficha/:token` (different host) and calls the backend endpoint.
- `[Auto-Accept]` **Issuance allowed for any staff role** (`recepcionista` included) — sending a client their own form link is an operational, non-clinical action and does not expose clinical data.
- `[Auto-Accept]` **Anamnese fields written** = the existing `Cliente` anamnesis set: `costumaPermanecerMuitoTempoSentada, alergias, qualAlergia, historicoMedico, qualHistorico, medicamentosEmUso, qualMedicamento, antecedentesCirurgicos, qualCirurgia, cicloMenstrualRegular, usaAnticoncepcional, qualAnticoncepcional, temHipertensao, grauHipertensao, temDiabetes, tipoDiabetes, temEpilepsia, qualEpilepsia, temMarcapasso, temMetais, observacoesAdicionaisAnamnese`.
- `[Auto-Accept]` CORS: the public page is served from the existing Vercel frontend origin (already whitelisted in `app.js`); no new CORS entry needed for Core.
- `[Auto-Accept]` *(2026-07-07)* **Policy text source** = a `POLICY_TEXT_TEMPLATE` constant next to `POLICY_VERSION` in `src/modules/gdpr/policyVersion.js`, with `{{clinicaNome}}` interpolated from `Tenant.nome` at render time. Per-tenant custom policy text is a future enhancement (roadmap, ADR-031); for now one reviewed template serves all tenants, but the consent is visually attributed to the clinic.
- `[Auto-Accept]` *(2026-07-07)* **Minors**: no server-side age verification in Core (the form carries the "maiores de 18" declaration, R12). A date-of-birth gate / parental-consent path is explicitly out of scope (PRD §7).

---

## 8. Testing Strategy

`tests/gdpr-ficha.test.js` (Jest ESM + supertest + `mongodb-memory-server`; mock external services per `.claude/rules/testing.md`). Rate limiters are `skip`ped in test env.

**Acceptance (from PRD §9 F04):**
- `issuing a token returns a token scoped to {tenantId,clienteId} valid 14 days, and regenerating invalidates the previous one` — issue → 201 with `url`+`expiresAt`; re-issue → prior token's `GET /ficha/:old` now 404 (revoked); new token works.
- `public form renders only for a valid token` — `GET /ficha/:valid` → 200; expired → 410; revoked/unknown/malformed → 404; no PII beyond first name.
- `render includes clinicaNome + politicaTexto/politicaVersao` (R11) — assert the tenant's name and the interpolated policy text are present in the render payload.
- `submitting without the (non-pre-checked) consent returns 400 and preserves the form` — POST with `consentimento:false`/absent → 400, no `Cliente`/`ConsentLog` mutation.
- `a successful submit writes the anamnese + ConsentLog (dados_saude + politica_privacidade, granted, origem:formulario, versao:POLICY_VERSION)` — POST valid → 200; `Cliente` fields updated; exactly two `ConsentLog` entries with correct tipos/accao/origem/versao; token now `usado`.
- `token already submitted → 410` — second POST on a used token → 410, no duplicate writes.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B cannot issue a token for Tenant A's client` → 404.
- `A token from Tenant A only ever resolves Tenant A's DB` → submit writes to A, never B (tampering the `tenantId` segment yields a hash mismatch → 404).

**Security:**
- `tokenHash is stored, never the plaintext` — DB row has no raw token; the `url`/`token` appear only in the issuance response.
- `rate limiters mounted on /ficha` — assert middleware present (functional thresholds covered manually; skipped in test env).

**Cross-feature note (verified in F05):** F05 sends the `url`/token produced here over WhatsApp; the link resolves to this form. Not tested in F04.
