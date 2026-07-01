# F06 — Data Subject Export (Portability) — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F06)
**Complexity:** moderate
**Module:** `src/modules/gdpr/` (extend F01) — backend, tenant-scoped, read-only
**Depends on:** F01 (Consent Logging Foundation — `gdpr` module scaffolding + `ConsentLog` model)

---

## 1. Scope

**Included:**
- One new endpoint on the existing **gdpr module** (extends F01's `src/modules/gdpr/`):
  `GET /gdpr/clientes/:id/export` — **admin only** (`authorize('admin')`), tenant-scoped.
- Gathers **all** of a client's personal data across the tenant DB and returns it as a **single JSON document** wrapped in the standard API contract, delivered as a downloadable attachment.
- Collections gathered (via `req.models` — DB-per-tenant `getModels`):
  `Cliente` (incl. anamnesis/clinical fields), `Agendamento`, `CompraPacote`, `Transacao`, `Pagamento`, `HistoricoAtendimento`, `Conversa`, `Mensagem`, and `ConsentLog` (consent history, from F01).
- Reads are parallelised with `Promise.all` (no `await`-in-loop), in two dependency-ordered batches (see §3).

**Consumes (from earlier features):**
- Consent records (`ConsentLog`) — produced by F01; included in the exported document (PRD §9 cross-feature: "F06 includes the F01 consent history in the exported document").

**Deferred (other features / future):** erasure & anonymization (F07), retention job (F08), CSV format, async/large-export streaming, per-export audit entry (see Assumptions). F06 is a single read-only export endpoint.

### Assumptions / Decisions

Decisions taken where the PRD/codebase do not prescribe an answer. All defaults follow existing project patterns + GDPR portability best practice.

- **[Auto-Accept] JSON only for MVP; CSV deferred.** PRD says "single JSON document (CSV optional)". Ship JSON only; CSV can be added later behind `?format=csv` without breaking the contract.
- **[Auto-Accept] Inline JSON body, delivered as a download.** The bundle is returned in the body inside the fixed contract `{ success, data }`, with `Content-Disposition: attachment; filename="cliente-<id>-export-<ISO-timestamp>.json"` so a browser saves it. No file is written to disk and nothing is streamed from object storage (dataset for a single client is small).
- **[Auto-Accept] Standard API contract is preserved.** Even though it is a file download, the payload stays `{ success: true, data: <bundle> }` (never a bare object) per `.claude/rules/express-common-conventions.md`. The bundle itself lives under `data`.
- **[Auto-Accept] Export envelope metadata.** `data` includes a small header: `{ meta: { exportedAt, exportedBy, tenantId, clienteId, schemaVersion }, cliente, agendamentos, compraPacotes, transacoes, pagamentos, historico, conversas, mensagens, consentHistory }`. Gives the controller provenance for the portability request.
- **[Auto-Accept] Full documents, no field stripping.** This is the controller exporting their own client's data (admin only), so clinical/anamnesis fields are intentionally included (PRD: "clinical fields included"). Documents are returned via `.lean()` as stored; only Mongo internals are left as-is (no projection).
- **[Auto-Accept] `Conversa`/`Mensagem` are gathered by the client's `telefone`.** These collections have no `clienteId`/`cliente` reference (verified in models) — they key off `telefone`. The export resolves the client first, then matches conversations/messages by `{ tenantId, telefone }` (and messages additionally by the resolved `conversa` ids).
- **[Auto-Accept] `Pagamento` is gathered via the client's `Transacao` ids.** `Pagamento` has no direct `cliente` ref (it references `transacao`). The export fetches the client's transactions first, then payments by `{ tenantId, transacao: { $in: <txIds> } }`.
- **[Auto-Accept] Two-batch parallel gather.** Because of the two dependencies above (need `telefone` and `transacao` ids first), the gather runs as Batch 1 (`Promise.all` of the client-id-keyed reads) then Batch 2 (`Promise.all` of `Pagamento` + `Conversa`/`Mensagem`). No serial per-document loops.
- **[Auto-Accept] No pagination on the export.** Portability requires the *complete* dataset, so the export returns all matching documents (the existing ≤100 listing cap does not apply). Large-conversation chunking/streaming is deferred.
- **[Auto-Accept] No new model; read-only.** F06 adds no schema and writes nothing.
- **[Auto-Accept] F06 does not itself write a clinical read-audit entry.** The clinical access audit (`AcessoClinicoLog`) is owned by F02 and F06 only depends on F01. An export-access audit can be layered in later; flagged here so it is a conscious omission, not an oversight.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/modules/gdpr/gdprController.js` | edit | add `exportarCliente` (gather + assemble bundle + set download headers) |
| `src/modules/gdpr/gdprRoutes.js` | edit | add `GET /clientes/:id/export` with `authorize('admin')` + params validate |
| `src/modules/gdpr/gdprSchemas.js` | edit | add `clienteIdParamSchema` (reuse F01's if already present) |
| `src/modules/gdpr/exportService.js` | new | `gatherClienteExport(models, tenantId, clienteId)` — the two-batch parallel gather, returns the bundle (testable in isolation) |
| `tests/gdpr-export.test.js` | new | integration tests (Jest + supertest + mongodb-memory-server) |

No change to `src/app.js` is needed — the `['/gdpr', gdprRoutes]` mount from F01 already dual-mounts (`/api` + `/api/v1`) every gdpr route, including the new sub-route.

Pattern references: `src/modules/clientes/clienteController.js` (`req.models` / `req.tenantId`, `findOne({_id, tenantId})`, CastError→400), `src/modules/clientes/clienteSchemas.js` (`clienteIdParamSchema`), `src/middlewares/auth.js` (`authenticate`/`authorize`), `src/middlewares/validate.js` (`validate(schema,'params')`), `src/models/registry.js` (`getModels` — collections to gather).

---

## 3. Data Gathering Map (tenant DB)

The client is the anchor; related data is keyed three ways. The export resolves the anchor first, then gathers in two parallel batches.

**Anchor:** `Cliente.findOne({ _id: clienteId, tenantId })` → provides `_id` and `telefone`. If null → 404 (no further reads).

**Batch 1 — keyed by client `_id` (`Promise.all`):**

| Collection | Match |
|---|---|
| `Agendamento` | `{ tenantId, cliente: clienteId }` |
| `CompraPacote` | `{ tenantId, cliente: clienteId }` |
| `Transacao` | `{ tenantId, cliente: clienteId }` |
| `HistoricoAtendimento` | `{ tenantId, cliente: clienteId }` |
| `ConsentLog` | `{ tenantId, clienteId }` (sorted `createdAt: -1`) |
| `Conversa` | `{ tenantId, telefone }` |

**Batch 2 — depends on Batch 1 results (`Promise.all`):**

| Collection | Match |
|---|---|
| `Pagamento` | `{ tenantId, transacao: { $in: <ids from Transacao> } }` |
| `Mensagem` | `{ tenantId, $or: [ { telefone }, { conversa: { $in: <ids from Conversa> } } ] }` |

All reads use `.lean()`. Field references verified against the models: `Agendamento.cliente`, `CompraPacote.cliente`, `Transacao.cliente`, `HistoricoAtendimento.cliente` (ObjectId); `Conversa`/`Mensagem` keyed by `telefone`; `Mensagem.conversa` (ObjectId); `Pagamento.transacao` (ObjectId); `ConsentLog.clienteId` (from F01).

---

## 4. API Contracts

Mounted at `/api/gdpr` and `/api/v1/gdpr` (inherited from F01). Requires `authenticate` (tenant context via `req.tenantId` / `req.models`).

### GET /gdpr/clientes/:id/export — full portability export (admin only)

- `authorize('admin')` — the bundle contains clinical data (`superadmin` bypasses via `authorize`).
- `:id` validated as ObjectId (`validate(clienteIdParamSchema, 'params')`); invalid → 400.
- Client must exist within `req.tenantId`; otherwise 404 (cross-tenant client also → 404, never 403).
- Sets `Content-Type: application/json` and `Content-Disposition: attachment; filename="cliente-<id>-export-<ISO>.json"`.

Response `200`:
```json
{
  "success": true,
  "data": {
    "meta": {
      "exportedAt": "2026-06-26T10:00:00.000Z",
      "exportedBy": "665...userId",
      "tenantId": "695...",
      "clienteId": "665...",
      "schemaVersion": 1
    },
    "cliente": { "_id": "665...", "nome": "...", "telefone": "...", "anamnese": { } },
    "agendamentos": [ ],
    "compraPacotes": [ ],
    "transacoes": [ ],
    "pagamentos": [ ],
    "historico": [ ],
    "conversas": [ ],
    "mensagens": [ ],
    "consentHistory": [ ]
  }
}
```

---

## 5. Requirements / Business Rules

- **R1.** The export returns a single document containing the client's `Cliente` (incl. anamnesis), `Agendamento`, `CompraPacote`, `Transacao`, `Pagamento`, `HistoricoAtendimento`, `Conversa`/`Mensagem` and `ConsentLog` consent history (PRD §9 F06).
- **R2.** Endpoint is **admin only** — `recepcionista`/`gerente`/`terapeuta` → 403 (via `authorize('admin')`); `superadmin` allowed.
- **R3.** Tenant-scoped: every gather query includes `{ tenantId: req.tenantId }`. No document from another tenant can appear in the bundle.
- **R4.** Invalid `:id` (bad ObjectId) → 400; client not found in tenant (incl. another tenant's client) → 404, never 403, and no partial bundle is returned.
- **R5.** Reads are parallel (`Promise.all`, two dependency-ordered batches); no `await` inside a loop.
- **R6.** Read-only: F06 writes nothing and creates no model.
- **R7.** Response follows the fixed contract `{ success, data }`; the bundle is `data`, plus the download headers from §4.
- **R8.** `meta.exportedBy` = `req.user._id`, `meta.tenantId` = `req.tenantId` — server-derived, never from the request.

**UX flow:** an admin opens a client record and triggers "Exportar dados (RGPD)"; the browser downloads the JSON. (Panel button wiring is a thin frontend add; the backend contract above is the feature.)

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Invalid ObjectId in `:id` | 400 | `{ success:false, error:'ID inválido' }` |
| Client not found in tenant (or another tenant) | 404 | `{ success:false, error:'Cliente não encontrado' }` |
| Caller is not admin/superadmin | 403 | `{ success:false, error:'Sem permissão...' }` (via `authorize`) |
| No token / invalid token | 401 | handled by `authenticate` |
| Unexpected | 500 | `{ success:false, error:'Erro interno' }` |

---

## 7. Testing Strategy

`tests/gdpr-export.test.js` (Jest ESM + supertest + `mongodb-memory-server`; external services mocked per `.claude/rules/testing.md`).

**Acceptance (from PRD §9 F06):**
- `export returns a single document with all of the client's data + consent history` — seed a client with at least one of each related record (agendamento, compraPacote, transacao, pagamento, historico, conversa, mensagem, consent entry); GET → 200; assert every section is present and populated.
- `export is tenant-scoped` — seed identical-looking data in Tenant B; Tenant A's export contains none of Tenant B's documents.
- `invalid id → 400`.
- `unknown client → 404` (and no bundle returned).

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B cannot export Tenant A's client` → 404 (never 403, never Tenant A data).
- `recepcionista / gerente / terapeuta are blocked` → 403; `admin` → 200.

**Bundle correctness:**
- `consentHistory` reflects the F01 `ConsentLog` entries for that client, sorted `createdAt` desc (cross-feature §9: F06 includes F01 consent history).
- `pagamentos` resolved via the client's transactions; `conversas`/`mensagens` resolved via the client's `telefone` — assert a payment/message belonging to a *different* client/phone in the same tenant is **not** included.
- Response carries `Content-Disposition: attachment` with the expected filename.

**Cross-feature note:** F07 (erasure) and F08 (retention) operate on the same collections but are out of scope here; F06 only reads.
