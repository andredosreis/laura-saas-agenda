# F01 — Consent Logging Foundation — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F01)
**Complexity:** simple
**Module:** `src/modules/gdpr/` (new) + `src/models/ConsentLog.js` (new) — backend, tenant-scoped

---

## 1. Scope

> **🔗 Reconciliation ([../RECONCILIATION.md](../RECONCILIATION.md), R3):** F01 also provides the canonical consent-state helper `estadoAtual(tenantId, clienteId)` — reduces the append-only log to the latest entry per `tipo` (`dados_saude`/`whatsapp_optin`/`marketing` → granted|withdrawn|pendente + date). It is the **single source of truth** consumed by F02 (`/clientes/:id/clinico`), F09 and F10. Add this helper as part of F01.

**Included:**
- `ConsentLog` model (**v2, per Reconciliation R7**) in the **tenant database** (DB-per-tenant via `src/models/registry.js`), **append-only** — only real consents (`dados_saude`, `whatsapp_optin`, `marketing`), with the proof fields `actor`/`evidencia`/`textoHash`/`fichaTokenId`.
- `NoticeReceipt` model (**R7**) in the tenant database, **append-only** — proof of presentation/delivery of the privacy notice (what `politica_privacidade` entries wrongly modelled as "consent" in v1). Written by F04; F01 only provides the model + `record()`.
- New module `src/modules/gdpr/` (controller + routes + Zod schemas), mounted via `apiResources` in `src/app.js` (dual-mount `/api` + `/api/v1`), behind `authenticate`, tenant-scoped.
- `POST /gdpr/consent` — record a consent grant/withdrawal (one immutable entry per call; `actor` server-derived = `funcionario` on this authenticated path; `evidencia` required for staff grants).
- `GET /gdpr/consent?clienteId=` — paginated consent history for a client.
- Policy versioning: a named constant stamped on every entry, plus `textoHash` of the current notice text.

**Provides (to later features):**
- Consent records — client ref, type, policy version, action, source, timestamp (used by F03, F06, F07).
- Active policy version (used by F04, F09).

**Deferred (other features):** consent *capture flows* (F04 form, F09 communications opt-in), clinical access (F02), export (F06), erasure (F07). F01 is only the store + record/read foundation.

**Resolved by consolidation step 3 (R7, 2026-07-20):** the proof model now carries `textoHash` (hash of the text actually displayed), an explicit `actor` marker (titular vs funcionario, server-derived), `evidencia` for assisted declarations, `fichaTokenId` linking consent to its collection event, and a separate `NoticeReceipt` model for notice delivery. `PedidoTitular` (data-subject requests) is sketched in R7 and implemented in step 4 (F06/F07). Legal sufficiency of assisted staff grants stays open — matriz Q4.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/models/ConsentLog.js` | new | Mongoose schema v2 (append-only, R7 fields) + `statics.record()`; exports `ConsentLogSchema` (for registry) + default model |
| `src/models/NoticeReceipt.js` | new | Mongoose schema (append-only, R7) + `statics.record()`; exports `NoticeReceiptSchema` + default model (written by F04, no HTTP surface in F01) |
| `src/models/registry.js` | edit | register `ConsentLog` and `NoticeReceipt` in `getModels` |
| `src/modules/gdpr/gdprController.js` | new | `registarConsentimento`, `historicoConsentimento` |
| `src/modules/gdpr/gdprRoutes.js` | new | router: `authenticate` + per-route `authorize`/`validate` |
| `src/modules/gdpr/gdprSchemas.js` | new | Zod: `registarConsentimentoSchema`, `consentQuerySchema` |
| `src/modules/gdpr/policyVersion.js` | new | `export const POLICY_VERSION = '2026-06-25'` (current privacy-policy version). Note: global constant now (Marcai processor policy); may become per-tenant when each clinic has its own policy — the model stores `versao` as a string either way |
| `src/app.js` | edit | add `['/gdpr', gdprRoutes]` to the `apiResources` array |
| `tests/gdpr-consent.test.js` | new | integration tests (Jest + supertest + mongodb-memory-server) |

Pattern references: `src/models/AuditLog.js` (append-only idiom), `src/models/Cliente.js` (tenant schema export), `src/modules/clientes/` (controller/routes/schemas), `src/middlewares/auth.js` (`authenticate`/`authorize`), `src/middlewares/validate.js`.

---

## 3. Data Model — `ConsentLog` (tenant DB)

```js
const ConsentLogSchema = new mongoose.Schema({
  tenantId:    { type: ObjectId, ref: 'Tenant', required: true, index: true },
  clienteId:   { type: ObjectId, ref: 'Cliente', required: true },
  tipo:        { type: String, required: true,
                 enum: ['dados_saude', 'marketing', 'whatsapp_optin'] }, // R7: politica_privacidade moved to NoticeReceipt
  accao:       { type: String, required: true, enum: ['granted', 'withdrawn'] },
  origem:      { type: String, required: true,
                 enum: ['formulario', 'booking', 'whatsapp', 'painel'] }, // 'booking' reserved (R8)
  actor:       { type: String, required: true, enum: ['titular', 'funcionario'] }, // R7: server-derived, never from body
  evidencia:   { type: String, default: null },           // R7: required when actor=funcionario && accao=granted
  textoHash:   { type: String, required: true },          // R7: sha256 of the notice/consent text presented (server-computed)
  fichaTokenId:{ type: ObjectId, ref: 'FichaToken', default: null }, // R7: set on the F04 formulario path
  versao:      { type: String, required: true },          // policy version stamped at record time (server-derived, R6)
  registadoPor:{ type: ObjectId, ref: 'User', default: null }, // staff who recorded (from JWT); null on the titular path
  ip:          { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });  // append-only: no updatedAt
```

### `NoticeReceipt` (tenant DB, R7) — notice delivery proof, not consent

```js
const NoticeReceiptSchema = new mongoose.Schema({
  tenantId:  { type: ObjectId, ref: 'Tenant', required: true, index: true },
  clienteId: { type: ObjectId, ref: 'Cliente', required: true },
  versao:    { type: String, required: true },   // notice version presented
  textoHash: { type: String, required: true },   // sha256 of the exact text presented
  canal:     { type: String, required: true, enum: ['formulario'] }, // grows with future channels
  ip:        { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });  // append-only

NoticeReceiptSchema.index({ tenantId: 1, clienteId: 1, createdAt: -1 });
```
Same append-only enforcement as `ConsentLog` (`statics.record()`, no update/delete routes, no HTTP endpoint in F01 — written by F04's submit). Registered in `getModels` as `NoticeReceipt`.

**Append-only enforcement (mirrors `AuditLog`):**
- `updatedAt` disabled; no update/delete routes exposed.
- Single write point: `ConsentLogSchema.statics.record({...})` → `this.create(...)`.

**Indexes:**
```js
ConsentLogSchema.index({ tenantId: 1, clienteId: 1, createdAt: -1 }); // history per client
ConsentLogSchema.index({ tenantId: 1, tipo: 1, createdAt: -1 });      // latest-by-type lookups (F03/F09)
```

**Registry:** add to `getModels(db)` in `src/models/registry.js`:
```js
ConsentLog: db.model('ConsentLog', ConsentLogSchema),
```

---

## 4. API Contracts

All routes mounted at `/api/gdpr` and `/api/v1/gdpr`; all require `authenticate` (tenant context via `req.tenantId` / `req.models`).

### POST /gdpr/consent  — record consent (any authenticated staff)
Request:
```json
{ "clienteId": "665...", "tipo": "marketing", "accao": "granted", "origem": "painel",
  "evidencia": "Cliente pediu na recepção a 20/07, na presença da gerente" }
```
- `versao` is **not accepted from the body** *(Reconciliation R6, 2026-07-19)* — the server always stamps the current `POLICY_VERSION`; a body-supplied `versao` is ignored like the other server-set fields. Proof integrity: the recorded version must be what the server serves, never a caller assertion.
- Server sets `tenantId` (from JWT), `registadoPor` (req.user._id), `ip` (req.ip), `versao` (`POLICY_VERSION`), `textoHash` (hash of the current notice), and **`actor: 'funcionario'`** — this authenticated endpoint is by definition a staff action *(R7)*. The titular path (`actor: 'titular'`, `fichaTokenId` set) exists only inside F04's public submit, which calls `ConsentLog.record()` directly.
- **`evidencia` is required when `accao === 'granted'`** on this staff path (400 without it — an assisted grant must state its supporting evidence); optional for `withdrawn` (opting out stays frictionless) *(R7/R8)*.
- Validates the `clienteId` exists in the tenant before writing.

Response `201`:
```json
{ "success": true, "data": { "_id": "...", "clienteId": "665...", "tipo": "marketing",
  "accao": "granted", "origem": "painel", "actor": "funcionario",
  "evidencia": "Cliente pediu na recepção a 20/07...", "textoHash": "sha256:...",
  "versao": "2026-06-25", "createdAt": "2026-06-25T..." } }
```

### GET /gdpr/consent?clienteId=&page=&limit=  — history (admin/gerente)
- `authorize('admin','gerente')`. `clienteId` required (validated ObjectId).
- Paginated: `page` (default 1), `limit` (default 20, max 100), sorted `createdAt: -1`.

Response `200`:
```json
{ "success": true, "data": [ { "...consent entry..." } ],
  "pagination": { "total": 12, "page": 1, "pages": 1, "limit": 20 } }
```

---

## 5. Requirements / Business Rules

- **R1.** Every `POST /gdpr/consent` appends exactly one immutable entry (no update/delete path exists).
- **R2.** `tenantId`, `registadoPor`, `ip` are server-derived; the body cannot set them (no mass-assignment).
- **R3.** `tipo`, `accao`, `origem` are restricted to their enums; out-of-enum → 400.
- **R4.** The referenced `clienteId` must exist within `req.tenantId`; otherwise 404 (cross-tenant client also → 404, never 403).
- **R5.** `versao` is stamped on every entry by the **server** (`POLICY_VERSION`); a body `versao` is ignored (server-set, like R2) *(R6, 2026-07-19)*.
- **R6.** History read is restricted to `admin`/`gerente`; recording is allowed for any authenticated staff (`superadmin` bypasses via `authorize`).
- **R7.** History is tenant-scoped, paginated (≤100), sorted by `createdAt` desc.
- **R8.** *(Reconciliation R7, 2026-07-20)* `actor` and `textoHash` are server-derived on every entry: the authenticated `POST /gdpr/consent` always records `actor: 'funcionario'`; only F04's public submit records `actor: 'titular'` (+ `fichaTokenId`). A staff `granted` without `evidencia` → 400.
- **R9.** *(R7)* `NoticeReceipt` is append-only with no HTTP surface in F01; its only writer is F04's submit via `NoticeReceipt.record()`.

**UX flow:** consent recording is invoked by other flows (booking opt-in, panel) — F01 is the backend foundation; no standalone UI in this feature.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Missing/invalid field (tipo/accao/origem/clienteId) | 400 | `{ success:false, error:'<campo>: <msg>' }` |
| Staff `granted` without `evidencia` (R8) | 400 | `{ success:false, error:'evidencia: obrigatória ao registar consentimento em nome do titular' }` |
| Invalid ObjectId in `clienteId` | 400 | `{ success:false, error:'ID inválido' }` |
| Client not found in tenant (or other tenant) | 404 | `{ success:false, error:'Cliente não encontrado' }` |
| GET history by non-admin/gerente | 403 | `{ success:false, error:'Sem permissão...' }` (via `authorize`) |
| No token / invalid token | 401 | handled by `authenticate` |
| Unexpected | 500 | `{ success:false, error:'Erro interno' }` |

---

## 7. Testing Strategy

`tests/gdpr-consent.test.js` (Jest ESM + supertest + `mongodb-memory-server`; mock external services per `.claude/rules/testing.md`).

**Acceptance (from PRD §9 F01):**
- `records an immutable consent entry with client ref, type, version, action, source and timestamp` — POST → 201, entry persisted with all fields + `createdAt`.
- `exposes no update or delete route for consent` — assert no PUT/PATCH/DELETE on `/gdpr/consent*` (404/405).
- `history is paginated (max 100), sorted desc, tenant-scoped` — seed >1, GET returns sorted + pagination; `limit=500` capped at 100.
- `invalid clienteId → 400` and `unknown client → 404`.
- `out-of-enum tipo/accao/origem → 400`.
- `server-set fields cannot be overridden from body` — send `tenantId`/`registadoPor`/`versao`/`actor`/`textoHash` in body → ignored (entry carries server values; `versao === POLICY_VERSION`, `actor === 'funcionario'` on the staff path).
- `staff grant requires evidencia (R8)` — POST `accao:'granted'` without `evidencia` → 400, no entry; with `evidencia` → 201; `accao:'withdrawn'` without `evidencia` → 201.
- `NoticeReceipt has no routes` — no GET/POST/PUT/DELETE on any notice path (404); model registered and `record()` writable (asserted directly, for F04).

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B cannot read Tenant A's consent history` → 404/empty (never another tenant's data).
- `Tenant B cannot record consent against Tenant A's client` → 404.
- `recepcionista is blocked from GET history` → 403; `admin` allowed.

**Cross-feature note (verified in later features):** F04 and F09 will stamp the `POLICY_VERSION` provided here; F06/F07 will read these entries. Not tested in F01.
