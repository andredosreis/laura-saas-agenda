# F09 — Communications Consent Capture — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F09)
**Complexity:** moderate
**Module:** `src/modules/gdpr/` (extends F01) — backend, tenant-scoped + frontend `laura-saas-frontend/src/` (booking checkbox + record opt-out toggle)

---

## 1. Scope

> **🔗 Reconciliation ([../RECONCILIATION.md](../RECONCILIATION.md), R3):** the `GET /gdpr/clientes/:id/consent-estado` endpoint must use F01's canonical `estadoAtual` helper (single source of truth) — do **not** re-implement the latest-per-type reduction here. F09 just exposes the comms slice (`whatsapp_optin`, `marketing`).
> **R8 (2026-07-20) — authoritative over any conflicting text below:** communications consent is **granted only by the data subject's own action**. The primary grant channel is the **F04 form** (titular-controlled checkboxes — owned by F04). F09's panel surface records **withdrawals** (immediate, evidence-free) and, secondarily, **staff-assisted grants with mandatory `evidencia`** (F01 R8; ⚠️ legal sufficiency = matriz Q4). The `CriarAgendamento` booking checkbox is **removed from scope** — a staff-clicked grant without evidence was the reviewed weakness; `origem: 'booking'` stays reserved.

**Included:**
- Capture of **communications** consent — types `whatsapp_optin` and `marketing` — **separate** from clinical consent (F04 owns `dados_saude` and the `NoticeReceipt`; `politica_privacidade` is no longer a consent type — R7). The two communications types are **granular and independent**.
- Panel surface for communications consent, writing through F01's `POST /gdpr/consent` (no new write endpoint), per **R8**:
  - an **opt-out** toggle on the client record that records `accao: withdrawn` immediately (`origem: painel` — evidence-free; opting out must stay frictionless, Art. 7(3));
  - a staff-assisted **grant** path in the same section: turning a toggle on opens a small confirmation asking for the mandatory `evidencia` ("que evidência suporta este consentimento?" — e.g. pedido verbal na recepção, com data); the entry records `actor: 'funcionario'` + `evidencia` (F01 R8) and the UI labels the state as **declaração assistida**.
- **The primary grant channel is the F04 form** (titular-controlled checkboxes, owned by F04 — R8): the panel section shows the state and offers **"Enviar ficha" (F05)** as the recommended way to collect a proper titular grant.
- A small **current-state derivation** read — latest `ConsentLog` entry per communications type — to display the consent state on the client record. This fills the "current state" gap noted in F01 (F01 only stores + lists history).

**Provides (to later/UI features):**
- Per-client communications-consent state (`whatsapp_optin`, `marketing` → `granted | withdrawn | pendente`), consumable by the record view (and reusable by an F03-style status indicator).

**Reuses (from F01 — hard dependency):**
- `ConsentLog` model (append-only, tenant DB) and `ConsentLogSchema.statics.record()`.
- `POST /gdpr/consent` and `GET /gdpr/consent?clienteId=` (history).
- `POLICY_VERSION` (`src/modules/gdpr/policyVersion.js`) — stamped on every entry F09 creates.

**Deferred / explicitly NOT in F09:**
- **Transactional/service messages are NOT gated by this opt-in.** Appointment reminders and the F04 anamnesis form link are service communications, not marketing — they are sent regardless of `marketing`/`whatsapp_optin` state. F09 adds **no** gating to the reminders worker or messaging pipeline.
- Clinical consent capture (F04), export (F06), erasure (F07); the **titular grant checkboxes** live on the F04 form (R8).
- ~~Booking opt-in checkbox in `CriarAgendamento`~~ — **removed by R8** (staff-clicked grant without evidence); a future *titular-controlled* booking/WhatsApp opt-in surface may reuse `origem: 'booking'`/`'whatsapp'` (reserved).

---

## Assumptions / Decisions

- **[Auto-Accept] No new write endpoint.** F09 reuses F01's `POST /gdpr/consent` for the panel surface (withdrawals + evidence-backed assisted grants — R8). The PRD states each grant/withdrawal "writes a `ConsentLog` entry **via F01**" — so the only new backend code is the read derivation. Keeps the append-only contract and server-set fields (`tenantId`/`registadoPor`/`ip`/`actor`/`textoHash`) intact; the `evidencia` requirement for staff grants is enforced by F01 (R8), not re-implemented here.
- **[Auto-Accept] Current-state endpoint:** `GET /gdpr/clientes/:id/consent-estado`. The PRD requires the record to reflect "the current communications-consent state from the latest entry per type" but leaves the mechanism open. A dedicated, cheap, server-derived read is preferred over client-side derivation because F01's `GET /gdpr/consent` is gated to `admin`/`gerente`, is paginated history (not a state), and client-side reduction over paginated logs is fragile.
- **[Auto-Accept] Derivation returns communications types only** (`whatsapp_optin`, `marketing`) — never clinical types — preserving the F04/F09 separation. Shape: per type `{ estado, data, versao }` where `estado ∈ { granted | withdrawn | pendente }` (`pendente` = no entry yet).
- **[Auto-Accept] Role gate for the state read:** `authorize('admin','gerente')`, mirroring F01's history read gate. Recording stays open to any authenticated staff (it reuses F01's open `POST`).
- ~~**[Auto-Accept] Booking opt-in checkbox lives in `CriarAgendamento.jsx`**~~ — **removed by Reconciliation R8 (2026-07-20)**: a checkbox ticked by staff in the internal panel is a staff declaration, not the titular's consent. The titular grant lives on the F04 form.
- **[Auto-Accept] Panel surface lives in the "Dados do Cliente" tab of `laura-saas-frontend/src/pages/EditarCliente.jsx`**, as a "Comunicações" section with **two independent toggles** (WhatsApp opt-in, Marketing) *(updated for R8)*: toggling **off** posts `withdrawn` (`origem: 'painel'`) immediately; toggling **on** opens a confirmation modal requiring `evidencia` before posting `granted` (400 without it — F01 R8), and the resulting state is labelled "declaração assistida". The section shows the source of each state (ficha vs painel, via `actor`) and an inline "Enviar ficha" (F05) affordance as the recommended grant path. Initial state from `GET /gdpr/clientes/:id/consent-estado`.
- **[Auto-Accept] Granularity:** `whatsapp_optin` and `marketing` are recorded and displayed independently; a single UI gesture maps to a single consent type.
- **[Auto-Accept] Transactional non-gating is documented, not coded.** F09 makes no change to the reminders worker / messaging pipeline; the separation is an explicit invariant (R6) and a doc note, not new enforcement code.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/modules/gdpr/gdprController.js` | edit | add `estadoComunicacoes` — derive latest entry per communications type for a client |
| `src/modules/gdpr/gdprRoutes.js` | edit | add `GET /clientes/:id/consent-estado` (`authorize('admin','gerente')` + validate param) |
| `src/modules/gdpr/gdprSchemas.js` | edit | add `consentEstadoParamsSchema` (validate `:id` ObjectId) |
| `laura-saas-frontend/src/pages/EditarCliente.jsx` | edit | "Comunicações" section in Dados tab (R8): two toggles + load state; off → POST `withdrawn` immediately; on → modal exige `evidencia` → POST `granted`; badge "declaração assistida" quando `actor: funcionario`; affordance "Enviar ficha" (F05) |
| `tests/gdpr-consent-comunicacoes.test.js` | new | integration tests for the derivation read + capture-through-F01 behaviour |

**No new model.** `ConsentLog` (F01) is reused as-is; its index `{ tenantId: 1, tipo: 1, createdAt: -1 }` already supports latest-by-type lookups.

Pattern references: `src/modules/gdpr/` (F01 — controller/routes/schemas, `POLICY_VERSION`, `estadoAtual`), `src/middlewares/{auth,validate}.js`, `laura-saas-frontend/src/services/api.js`, `laura-saas-frontend/src/contexts/AuthContext` (`useAuth`), `laura-saas-frontend/src/pages/EditarCliente.jsx` (tabs idiom + modal/confirm patterns for the `evidencia` dialog).

---

## 3. Data Model

No schema change. F09 reuses F01's `ConsentLog` (tenant DB, append-only). Relevant fields for F09:

- `tipo ∈ { 'whatsapp_optin', 'marketing' }` (the communications subset of F01's enum).
- `accao ∈ { 'granted', 'withdrawn' }`.
- `origem ∈ { 'booking', 'painel' }` (the two F09 capture points; both already in F01's enum).
- `versao` — stamped with `POLICY_VERSION`.

**Current-state derivation** (read-only, no persistence): for a client, take the **latest** `ConsentLog` entry (by `createdAt` desc) per communications `tipo`; its `accao` maps to `estado` (`granted`/`withdrawn`); absence of any entry → `pendente`. Implemented with one tenant-scoped query sorted desc, reduced to the first occurrence per type (or an aggregation `$sort` + `$group` `$first`).

---

## 4. API Contracts

Mounted under `/api/gdpr` and `/api/v1/gdpr` (F01's dual-mount); all require `authenticate`, tenant-scoped.

### Capture — reuses F01 `POST /gdpr/consent` (no new endpoint)
Record opt-out (evidence-free — frictionless withdrawal):
```json
{ "clienteId": "665...", "tipo": "marketing", "accao": "withdrawn", "origem": "painel" }
```
Assisted grant (R8 — `evidencia` mandatory, enforced by F01):
```json
{ "clienteId": "665...", "tipo": "whatsapp_optin", "accao": "granted", "origem": "painel",
  "evidencia": "Cliente pediu na recepção a 20/07, na presença da gerente" }
```
- `versao`/`actor`/`textoHash` are server-derived (F01 R6/R8): this authenticated path always records `actor: 'funcionario'`; a `granted` without `evidencia` → 400. The titular grant path is the F04 form.
- Open to any authenticated staff (F01's `POST` is not role-gated).

### GET /gdpr/clientes/:id/consent-estado — current communications state (admin/gerente) — **new**
- `authorize('admin','gerente')`; `:id` validated ObjectId; client must exist in tenant (else 404).

Response `200`:
```json
{ "success": true, "data": {
  "whatsapp_optin": { "estado": "granted",  "data": "2026-06-26T10:00:00.000Z", "versao": "2026-06-25", "actor": "titular" },
  "marketing":      { "estado": "pendente", "data": null, "versao": null, "actor": null }
} }
```
- `estado ∈ { "granted" | "withdrawn" | "pendente" }`. Only communications types are returned (never `dados_saude`). `actor` *(added for R8)* lets the UI label a `granted` state as "declaração assistida" when `funcionario` vs a titular grant from the F04 form.

---

## 5. Requirements / Business Rules

- **R1.** *(rewritten per Reconciliation R8, 2026-07-20)* The **primary** grant channel is the F04 form (titular action, `actor: 'titular'`). On the panel, a grant is an **assisted declaration**: it writes exactly one `ConsentLog` entry (`accao: granted`, `actor: 'funcionario'`, `origem: 'painel'`, active `POLICY_VERSION`) and **requires `evidencia`** (400 without it — F01 R8). Nothing on the panel is ever pre-checked/pre-granted.
- **R2.** Toggling opt-out on the record writes a `withdrawn` entry **immediately** and without evidence (`origem: painel` — Art. 7(3), opting out is frictionless); toggling back on goes through the assisted-grant path (R1). State is always the latest entry per type.
- **R3.** `whatsapp_optin` and `marketing` are independent — recording/displaying one never alters the other.
- **R4.** The client record reflects current state via `GET /gdpr/clientes/:id/consent-estado`: latest entry per type → `granted`/`withdrawn`; no entry → `pendente`.
- **R5.** Recording a `withdrawn` for a client with **no prior opt-in** is accepted (additive append-only log) and the derived state reads `withdrawn` (opted-out).
- **R6.** Transactional/service messages (appointment reminders, F04 form link) are **not** marketing and are **not** gated by these consents — F09 adds no gating anywhere in the messaging/reminders path.
- **R7.** All reads/writes are tenant-scoped; cross-tenant client → 404 (never 403). `tenantId`/`registadoPor`/`ip` are server-derived (F01).
- **R8.** The state read is restricted to `admin`/`gerente` (`superadmin` bypasses via `authorize`); recording is open to any authenticated staff.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Invalid `clienteId` (POST body or `:id` param) | 400 | `{ success:false, error:'ID inválido' }` |
| Missing/out-of-enum `tipo`/`accao`/`origem` (POST) | 400 | `{ success:false, error:'<campo>: <msg>' }` (F01) |
| Client not found in tenant (or other tenant) | 404 | `{ success:false, error:'Cliente não encontrado' }` |
| `consent-estado` by non-admin/gerente | 403 | `{ success:false, error:'Sem permissão...' }` (via `authorize`) |
| Withdrawal with no prior opt-in | 201 | accepted (additive); state derives to `withdrawn` |
| No token / invalid token | 401 | handled by `authenticate` |
| Unexpected | 500 | `{ success:false, error:'Erro interno' }` |

---

## 7. Testing Strategy

`tests/gdpr-consent-comunicacoes.test.js` (Jest ESM + supertest + `mongodb-memory-server`; external services mocked per `.claude/rules/testing.md`).

**Acceptance (from PRD §9 F09, updated for R8):**
- `assisted grant writes a whatsapp_optin/marketing ConsentLog with POLICY_VERSION and evidencia` — POST with `evidencia` → 201, entry has `accao: granted`, `actor: 'funcionario'`, comms `tipo`, stamped `versao`; POST `granted` **without** `evidencia` → 400, no entry (F01 R8, asserted here as the F09 consumer).
- `record reflects current state from latest entry per type` — seed granted then withdrawn for `marketing`; `GET consent-estado` → `marketing.estado === 'withdrawn'`, `whatsapp_optin.estado === 'pendente'`.
- `opt-out toggle records withdrawn immediately and reads opted-out` — POST `withdrawn` → state `withdrawn`.
- `withdrawal with no prior opt-in is accepted and reads opted-out` (R5).
- `granularity` — recording `whatsapp_optin` does not change `marketing` state, and vice-versa.
- `invalid clienteId → 400`, `unknown client → 404` (both POST and `consent-estado`).

**Cross-feature (PRD §9):**
- `F09 stamps the active POLICY_VERSION on every communications-consent entry` — assert `versao === POLICY_VERSION` when body omits `versao`.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B cannot read consent-estado of Tenant A's client` → 404.
- `Tenant B cannot record comms consent against Tenant A's client` → 404.
- `recepcionista is blocked from consent-estado` → 403; `admin` allowed. Recording allowed for `recepcionista` (asymmetry inherited from F01).

**Frontend (manual / out of Jest scope):** verify the record toggles initialise from `consent-estado`, that turning a toggle **on** opens the `evidencia` modal (and posts nothing without it), that turning **off** posts the withdrawal immediately, and that a `funcionario` grant shows the "declaração assistida" badge (covered at evaluator stage with Playwright per the harness method).
