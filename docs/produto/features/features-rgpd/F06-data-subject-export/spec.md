# F06 — Data Subject Export (Access & Portability) — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F06)
**Complexity:** moderate
**Module:** `src/modules/gdpr/` (extend F01) — backend, tenant-scoped (read + one `PedidoTitular` audit write)
**Depends on:** F01 (Consent Logging Foundation — `gdpr` module scaffolding + `ConsentLog`/`NoticeReceipt` models) **and F07** (the `PedidoTitular` model — Reconciliation R9; implementation order inside wave 2: F07 before F06)

---

## 1. Scope

> **🔗 Reconciliation ([../RECONCILIATION.md](../RECONCILIATION.md), R9, 2026-07-20) — authoritative:** the export separates **Art. 15 (acesso)** from **Art. 20 (portabilidade)** via `?tipo=`, goes through **per-collection allowlists** (never raw Mongo dumps), additionally gathers **`Lead`** (by telefone) and **`NoticeReceipt`**, and records one **`PedidoTitular`** per export (the export audit). Older text below saying "full documents, no field stripping" or "read-only" is superseded.

**Included:**
- One new endpoint on the existing **gdpr module** (extends F01's `src/modules/gdpr/`):
  `GET /gdpr/clientes/:id/export?tipo=acesso|portabilidade` (default `acesso`) — **admin only** (`authorize('admin')`), tenant-scoped.
- **`tipo=acesso` (Art. 15):** gathers the client's personal data across the tenant DB — `Cliente` (incl. anamnesis/clinical fields), `Agendamento`, `CompraPacote`, `Transacao`, `Pagamento`, `HistoricoAtendimento`, `Conversa`, `Mensagem`, **`Lead`** (pre-conversion remnant, by telefone — R9), `ConsentLog` and **`NoticeReceipt`** — each through its **allowlist** (see §3b).
- **`tipo=portabilidade` (Art. 20):** the narrower, machine-readable set of data *provided by the titular* under consent/contract: `cliente` (identity + anamnese allowlists), `mensagens` **inbound only** (what the titular wrote), `agendamentos` (contract data) and `consentHistory`. No staff notes, no derived/fiscal records.
- Returns a **single JSON document** wrapped in the standard API contract, delivered as a downloadable attachment.
- Records exactly one **`PedidoTitular` (tipo: `acesso`|`portabilidade`, estado: `concluido`, registadoPor)** per successful export — accountability + the conscious export audit (supersedes the earlier "no per-export audit" assumption).
- Reads are parallelised with `Promise.all` (no `await`-in-loop), in two dependency-ordered batches (see §3).

**Consumes (from earlier features):**
- Consent records (`ConsentLog`) + notice receipts (`NoticeReceipt`) — produced by F01/F04; included in the exported document.
- `PedidoTitular` model + `abrir()`/`concluir()` — produced by **F07** (R9).

**Deferred (other features / future):** erasure & anonymization (F07), retention job (F08), CSV format, async/large-export streaming. Third-party content note: `mensagens` in the *acesso* bundle include staff/AI replies — they are part of the titular's conversation (addressed to them); flagged as a conscious decision.

### Assumptions / Decisions

Decisions taken where the PRD/codebase do not prescribe an answer. All defaults follow existing project patterns + GDPR portability best practice.

- **[Auto-Accept] JSON only for MVP; CSV deferred.** PRD says "single JSON document (CSV optional)". Ship JSON only; CSV can be added later behind `?format=csv` without breaking the contract.
- **[Auto-Accept] Inline JSON body, delivered as a download.** The bundle is returned in the body inside the fixed contract `{ success, data }`, with `Content-Disposition: attachment; filename="cliente-<id>-export-<ISO-timestamp>.json"` so a browser saves it. No file is written to disk and nothing is streamed from object storage (dataset for a single client is small).
- **[Auto-Accept] Standard API contract is preserved.** Even though it is a file download, the payload stays `{ success: true, data: <bundle> }` (never a bare object) per `.claude/rules/express-common-conventions.md`. The bundle itself lives under `data`.
- **[Auto-Accept] Export envelope metadata.** `data` includes a small header: `{ meta: { exportedAt, exportedBy, tenantId, clienteId, schemaVersion }, cliente, agendamentos, compraPacotes, transacoes, pagamentos, historico, conversas, mensagens, consentHistory }`. Gives the controller provenance for the portability request.
- ~~**[Auto-Accept] Full documents, no field stripping.**~~ — **superseded by R9 (2026-07-20)**: every collection goes through an explicit **allowlist** in `src/modules/gdpr/exportFields.js` (idiom of `clinicalFields.js`). Clinical/anamnesis fields ARE included (the controller answers their own client's request), but internal/system fields are NOT — e.g. `Cliente.etapaConversa`, `historicoMensagens` (internal chatbot state; the conversation is already exported via `Conversa`/`Mensagem`), `iaAtiva`, `pendingDeletion`, `__v`, and equivalent system fields on every collection. Unknown/new fields are excluded by default (allowlist, not blocklist).
- **[Auto-Accept] `Conversa`/`Mensagem` are gathered by the client's `telefone`.** These collections have no `clienteId`/`cliente` reference (verified in models) — they key off `telefone`. The export resolves the client first, then matches conversations/messages by `{ tenantId, telefone }` (and messages additionally by the resolved `conversa` ids).
- **[Auto-Accept] `Pagamento` is gathered via the client's `Transacao` ids.** `Pagamento` has no direct `cliente` ref (it references `transacao`). The export fetches the client's transactions first, then payments by `{ tenantId, transacao: { $in: <txIds> } }`.
- **[Auto-Accept] Two-batch parallel gather.** Because of the two dependencies above (need `telefone` and `transacao` ids first), the gather runs as Batch 1 (`Promise.all` of the client-id-keyed reads) then Batch 2 (`Promise.all` of `Pagamento` + `Conversa`/`Mensagem`). No serial per-document loops.
- **[Auto-Accept] No pagination on the export.** Access/portability require the *complete* dataset, so the export returns all matching documents (the existing ≤100 listing cap does not apply). Large-conversation chunking/streaming is deferred.
- ~~**[Auto-Accept] No new model; read-only.**~~ — **updated by R9**: F06 still adds no schema of its own, but writes exactly one `PedidoTitular` (F07's model) per successful export. Nothing else is mutated.
- ~~**[Auto-Accept] No export audit.**~~ — **superseded by R9**: the `PedidoTitular (estado: 'concluido')` entry IS the export audit (who exported, for whom, when, under which right). A separate `AcessoClinicoLog` entry is still not written (conscious: the DSR record covers it).
- **[Auto-Accept]** *(R9)* **Portability scope** = `cliente` (identity + anamnese), inbound `mensagens`, `agendamentos`, `consentHistory` — data the titular provided, processed on consent (anamnese) or contract (marcações), automated means. Final legal word on the exact Art. 20 slice = matriz Q12.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/modules/gdpr/gdprController.js` | edit | add `exportarCliente` (gather + allowlist + assemble bundle + `PedidoTitular` audit write + download headers) |
| `src/modules/gdpr/gdprRoutes.js` | edit | add `GET /clientes/:id/export` with `authorize('admin')` + params/query validate |
| `src/modules/gdpr/gdprSchemas.js` | edit | add `clienteIdParamSchema` (reuse F01's if already present) + `exportQuerySchema` (`tipo ∈ {acesso, portabilidade}`, default `acesso`) |
| `src/modules/gdpr/exportFields.js` | new | **Per-collection allowlists** (R9) — `EXPORT_FIELDS.<collection>` + `pickExportFields(doc, collection)`; single source of truth, idiom of `clinicalFields.js` |
| `src/modules/gdpr/exportService.js` | new | `gatherClienteExport(models, tenantId, clienteId, tipo)` — the two-batch parallel gather, allowlist-projected, returns the bundle (testable in isolation) |
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
| `NoticeReceipt` *(R9)* | `{ tenantId, clienteId }` (sorted `createdAt: -1`) |
| `Lead` *(R9)* | `{ tenantId, telefone }` (pre-conversion remnant) |
| `Conversa` | `{ tenantId, telefone }` |

**Batch 2 — depends on Batch 1 results (`Promise.all`):**

| Collection | Match |
|---|---|
| `Pagamento` | `{ tenantId, transacao: { $in: <ids from Transacao> } }` |
| `Mensagem` | `{ tenantId, $or: [ { telefone }, { conversa: { $in: <ids from Conversa> } } ] }` |

All reads use `.lean()` and every document is projected through `pickExportFields` (allowlists — R9). For `tipo=portabilidade`, the gather is restricted to `Cliente` + inbound `Mensagem` + `Agendamento` + `ConsentLog`. Field references verified against the models: `Agendamento.cliente`, `CompraPacote.cliente`, `Transacao.cliente`, `HistoricoAtendimento.cliente` (ObjectId); `Conversa`/`Mensagem`/`Lead` keyed by `telefone`; `Mensagem.conversa` (ObjectId); `Pagamento.transacao` (ObjectId); `ConsentLog.clienteId`/`NoticeReceipt.clienteId` (from F01).

### §3b — Allowlists (`exportFields.js`, R9)

One `EXPORT_FIELDS` map, collection → allowed keys. Principles: **include** everything that is the titular's personal data (identity, contacto, anamnese, conteúdo de mensagens, datas, valores, consentimentos); **exclude** internal/system state — `Cliente.etapaConversa`, `Cliente.historicoMensagens`, `Cliente.iaAtiva`, `Cliente.pendingDeletion`/`anonimizado`, `Conversa` state-machine fields, `FichaToken` hashes, `__v`, worker/queue metadata. Allowlist (unknown fields excluded by default), never blocklist.

---

## 4. API Contracts

Mounted at `/api/gdpr` and `/api/v1/gdpr` (inherited from F01). Requires `authenticate` (tenant context via `req.tenantId` / `req.models`).

### GET /gdpr/clientes/:id/export?tipo=acesso|portabilidade — data-subject export (admin only)

- `authorize('admin')` — the bundle contains clinical data (`superadmin` bypasses via `authorize`).
- `:id` validated as ObjectId (`validate(clienteIdParamSchema, 'params')`); invalid → 400. `tipo` validated (`exportQuerySchema`; default `acesso`; out-of-enum → 400).
- Client must exist within `req.tenantId`; otherwise 404 (cross-tenant client also → 404, never 403).
- On success, records one `PedidoTitular (tipo: <tipo>, estado: 'concluido', registadoPor: req.user._id)` (R9 — the export audit).
- Sets `Content-Type: application/json` and `Content-Disposition: attachment; filename="cliente-<id>-export-<tipo>-<ISO>.json"`.
- `meta.tipoPedido` carries `acesso`/`portabilidade`; the *portabilidade* bundle contains only `meta`, `cliente`, `agendamentos`, `mensagens` (inbound), `consentHistory`.

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

- **R1.** *(updated R9)* The **acesso** export returns a single document containing the client's `Cliente` (incl. anamnesis), `Agendamento`, `CompraPacote`, `Transacao`, `Pagamento`, `HistoricoAtendimento`, `Conversa`/`Mensagem`, `Lead` (by telefone), `ConsentLog` consent history and `NoticeReceipt` receipts — every document projected through the `exportFields.js` allowlists (no internal/system fields). The **portabilidade** export returns only `cliente`, `agendamentos`, inbound `mensagens` and `consentHistory`.
- **R2.** Endpoint is **admin only** — `recepcionista`/`gerente`/`terapeuta` → 403 (via `authorize('admin')`); `superadmin` allowed.
- **R3.** Tenant-scoped: every gather query includes `{ tenantId: req.tenantId }`. No document from another tenant can appear in the bundle.
- **R4.** Invalid `:id` (bad ObjectId) → 400; client not found in tenant (incl. another tenant's client) → 404, never 403, and no partial bundle is returned.
- **R5.** Reads are parallel (`Promise.all`, two dependency-ordered batches); no `await` inside a loop.
- **R6.** *(updated R9)* F06 creates no model of its own and mutates no client data; the only write is exactly one `PedidoTitular` (F07's model) per successful export — none on 400/404/403 failures.
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

**Acceptance (from PRD §9 F06, updated for R9):**
- `acesso export returns a single document with all of the client's data + consent history` — seed a client with at least one of each related record (agendamento, compraPacote, transacao, pagamento, historico, conversa, mensagem, lead com o mesmo telefone, consent entry, notice receipt); GET → 200; assert every section is present and populated.
- `allowlist enforced` — assert the bundle contains **no** internal keys (`etapaConversa`, `historicoMensagens`, `iaAtiva`, `pendingDeletion`, `__v`) in any section.
- `portabilidade export is the narrow slice` — `?tipo=portabilidade` → only `meta`/`cliente`/`agendamentos`/`mensagens`/`consentHistory`; `mensagens` contain only inbound messages; no fiscal/staff-note sections.
- `each successful export records one PedidoTitular` — after GET, exactly one `PedidoTitular (tipo: <tipo>, estado: 'concluido', registadoPor)` exists; a 404/403 attempt records none.
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
