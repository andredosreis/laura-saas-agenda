# RGPD Features — Cross-Feature Reconciliation (2026-06-25, actualizado 2026-07-19)

Resolves the seams found after the wave-batch spec generation (R1–R3, 2026-06-25) plus two gaps found in the 2026-07-07 review (R4–R5). These decisions are **authoritative**: where a feature spec says otherwise, follow this document. Each affected spec links here.

A **2026-07-19 consolidation pass** propagated R1–R5 into the F01–F03 spec/plan/**contract** files (the contracts previously still encoded pre-reconciliation behaviour), corrected the R1 file pointer, and added R6. Legal open questions raised in the 2026-07-19 external review are tracked in `docs/operacoes/rgpd-matriz-juridica.md`.

---

## R1 — AI data minimization covers the direct Mongo reader (owned by F02)

**Decision (with André):** the AI's only privacy duty is to *help send the consent link* — and even that send is **manual by staff** (F05), not the AI. The AI **never needs clinical/anamnesis data**.

Therefore F02's clinical-field minimization must cover **both** paths the AI can read client data through:
1. The HTTP internal route `src/modules/clientes/clienteInternalRoutes.js` (consumed by `ia-service`).
2. Any **direct DB read of `clientes`** inside `ia-service`. *(Pointer corrected 2026-07-19: the direct read lives in `ia-service/src/ia_service/services/client_orchestrator.py` (~line 287) — `mongo_reader.py` has no `Cliente` read at all. Today's projection is `{_id, observacoes}`, already clinical-free.)* The invariant: no direct `db.clientes` read in `ia-service` may ever project a clinical/anamnesis field (the same field list F02 classifies as clinical). F02 adds a regression assertion for this in the ia-service test suite (against `client_orchestrator.py` and any future direct reader).

This is **in scope for F02** (no longer a deferred/residual gap). The AI keeps reading the non-clinical fields it needs (nome, telefone, agendamentos, serviços).

---

## R2 — One clinical-read endpoint (owned by F02, consumed by F03)

- Base reads `GET /clientes` and `GET /clientes/:id` **never** return clinical/anamnesis fields — stripped for **all** roles (minimization by default). This is F02.
- Exactly **one** dedicated endpoint exposes clinical data: **`GET /clientes/:id/clinico`** (clientes module, specified by F02):
  - Returns the clinical/anamnesis fields **only** for `admin`/`gerente`/`terapeuta` (+`superadmin`); `recepcionista` → 403.
  - Writes one `AcessoClinicoLog` entry on each successful read (the "open clinical tab" audit).
  - Also returns the current **health-consent status** (`dados_saude`) via the F01 helper (R3), so the tab needs a single call.
- **F03** (Clinical Tab) consumes **only** this endpoint — no client-side consent derivation, no separate clinical fetch. F03's earlier `[Auto-Accept]` of client-side consent derivation is **superseded**.

---

## R3 — One consent-state derivation (F01 helper), thin per-feature endpoints

- **F01** provides the single source of truth for "current consent state": a reusable helper (e.g. `ConsentLog.estadoAtual(tenantId, clienteId)` or a gdpr service) that reduces the append-only log to the **latest entry per `tipo`** → `{ dados_saude, whatsapp_optin, marketing }`, each `granted | withdrawn | pendente` + date.
- **No feature re-implements this reduction.** Each consuming feature calls the F01 helper and wraps it in its own thin endpoint (keeps wave independence — no feature depends on a later-wave endpoint):
  - **F02** `GET /clientes/:id/clinico` → includes `consentimentoSaude` (the `dados_saude` state) from the helper. (R2)
  - **F09** `GET /gdpr/clientes/:id/consent-estado` → returns the comms state (`whatsapp_optin`, `marketing`) from the helper.
  - **F10** `GET /gdpr/clientes/:id/estado-privacidade` (+ batch `?clienteIds=`) → returns anamnesis-form status (from F04's `FichaToken`) + consent state from the helper.
- Convergence is at the **logic** level (one helper in F01); the per-feature endpoints stay, each a thin wrapper. F09's and F10's earlier independent derivations are **superseded by the F01 helper**.

---

## R4 — Withdrawal of `dados_saude` consent has an operational effect (owned by F02, surfaced by F03) *(2026-07-07)*

**Gap found:** F01 logged the withdrawal and F03 showed "Retirado", but no feature defined what happens to the anamnesis already collected. Under Art. 7(3) processing must cease on withdrawal — a status badge alone is not enough.

**Decision:**
- When the F01 helper (`estadoAtual`) yields `dados_saude = withdrawn`, **`GET /clientes/:id/clinico` (F02) omits the clinical fields for every role** (same strip as a non-permitted role) and returns only `consentimentoSaude: 'withdrawn'` (+ date). The data stays stored (withdrawal ≠ erasure request — storage pending re-consent or erasure is defensible; the *use* stops).
- Panel **writes to anamnese fields are blocked** while state is `withdrawn`; the only path that reopens them is a new F04 submission (which appends a fresh `granted` entry) or F07 erasure.
- **F03 UI** for the withdrawn state: badge "Consentimento retirado", no clinical fields rendered, with two CTAs — "Reenviar ficha" (F05, re-collect consent) and "Apagar dados" (F07).
- **`pendente` (never granted) does NOT block reads** — legacy anamnesis collected manually pre-feature remains visible to permitted roles, flagged "Pendente" (transition state; the clinic is the controller of its legacy data). Only an explicit `withdrawn` blocks.

---

## R5 — Erasure scope: `anonimizarCliente` covers conversations, leads and treatment history (owned by F07) *(2026-07-07)*

**Gap found:** F07 anonymized only `Cliente` (+ `dadosMBWay.telefone`), but the F06 export correctly lists `Conversa`/`Mensagem`/`HistoricoAtendimento` as the client's personal data — WhatsApp message content is PII and frequently contains health data the client typed. Export and erasure must cover the same universe.

**Decision — `anonimizarCliente` additionally (capture `telefone` BEFORE scrubbing the `Cliente` doc):**
1. **`Conversa` + `Mensagem`** (tenant DB, matched by the client's `telefone`): **hard-delete** all docs. Not fiscal; content risk is high; deletion is the clean Art. 17 outcome.
2. **`Lead`** with the same `telefone` (pre-conversion remnant): anonymize in place — `nome = '[anonimizado]'`, `telefone = 'ANON-<leadId>'` (unique index `{tenantId, telefone}` preserved), `email = null`. Pipeline stats survive.
3. **`HistoricoAtendimento`** for the client: scrub the free-text/clinical fields (`queixaPrincipal`, `expectativas`, `sintomasRelatados`, `restricoes`, `resultadosImediatos`, `reacoesCliente`, `orientacoesPassadas`, `proximosPassos`, `observacoesProfissional`, `fotosAntes`, `fotosDepois`); keep the skeleton (datas, `servico`, técnicas/produtos/equipamentos, `satisfacaoCliente`, `status`) for aggregate stats.
4. **`LidCapture`** (shared DB): no action — documents auto-expire via 7-day TTL index; documented, not coded.
5. **R2 message archive (ADR-026)** and **encrypted backups**: outside `anonimizarCliente`'s transaction. Handled organizationally in `docs/operacoes/rgpd-conformidade.md`: archived conversation objects for the erased client must be deleted in the archive sweep, and backups age out within the documented rotation window (erased data disappears from backups by expiry, not by rewrite).

**Resolved (step 4, 2026-07-20 — see R9):** by this same principle ("export and erasure must cover the same universe"), the F06 export now also gathers the `Lead` matching the client's `telefone` (and `NoticeReceipt`), and the erasure scope gains the free-text fields R5 missed (`Agendamento.observacoes`/`leadData`, `Transacao.observacoes`, `Pagamento.observacoes`).

F08 inherits all of this automatically (it only calls F07's service).

---

## R6 — `versao` is always server-derived (owned by F01) *(2026-07-19)*

**Gap found:** F01 accepted an optional `versao` in the `POST /gdpr/consent` body. In an evidentiary record the policy version must be what the server actually served — never a caller assertion.

**Decision:** `versao` is removed from the request schema; the server always stamps `POLICY_VERSION` (per-tenant versions later, same rule). A body-supplied `versao` is ignored exactly like the other server-set fields (`tenantId`/`registadoPor`/`ip`). F01 spec/contract/plan updated.

**Deliberately NOT solved here (consolidation step 3):** the wider proof-model redesign — snapshot/hash of the displayed policy text, explicit purpose/controller/channel per entry, separating notice receipt (`politica_privacidade`) from consent, and an explicit data-subject-action vs staff-declaration marker (today only implicit via `origem` + `registadoPor: null`). → **Solved by R7/R8 (2026-07-20).**

---

## R7 — Proof model v2: `ConsentLog` / `NoticeReceipt` / `PedidoTitular` are three different things (owned by F01) *(2026-07-20, consolidation step 3)*

**Gap found (2026-07-19 external review):** the v1 log proved that *someone clicked in the panel*, not that the data subject gave free, specific, informed consent. `politica_privacidade` entries recorded notice delivery as if it were consent; erasure requests (F07) were logged as consent withdrawals; nothing captured the text actually shown or who really acted.

**Decision — three separated concepts, all append-only, tenant DB, foundation owned by F01:**

1. **`ConsentLog` v2 — only real consents.** `tipo ∈ { dados_saude, whatsapp_optin, marketing }` — **`politica_privacidade` leaves the enum** (it was never consent). New fields:
   - `actor: 'titular' | 'funcionario'` — **server-derived, never from body**: the public form path (no auth) records `titular`; any authenticated staff call records `funcionario`.
   - `evidencia: String` — **required (400 without it) when `actor === 'funcionario'` AND `accao === 'granted'`** (an assisted declaration must say what evidence supports it, e.g. "cliente pediu verbalmente na recepção, 20/07"); optional for withdrawals (opting out must stay frictionless).
   - `textoHash: String` — sha256 of the exact notice/consent text presented, **server-computed** at record time (from the served notice for the titular path; from the current notice for staff entries).
   - `fichaTokenId: ObjectId|null` — ref to the F04 `FichaToken` that carried the act (set on `origem: 'formulario'`), tying the consent to its collection event.
2. **`NoticeReceipt` (new model)** — proof the privacy notice was presented/delivered: `{ tenantId, clienteId, versao, textoHash, canal, ip, createdAt }`. Written by the F04 submit (the render served the notice; the submit proves the titular acted after it). No update/delete routes.
3. **`PedidoTitular` (sketched here, implemented in step 4 by F06/F07)** — data-subject requests as their own record: `{ tenantId, clienteId, tipo: 'apagamento'|'acesso'|'portabilidade'|'rectificacao', estado: 'recebido'|'em_execucao'|'concluido'|'recusado', origem, registadoPor, prazoLimite (Art. 12(3): +1 month), timestamps }`. **Supersedes F07's `ConsentLog (politica_privacidade, withdrawn)` on erasure** — an erasure request is a DSR, not a consent withdrawal; whether F07 *additionally* appends a `dados_saude` withdrawal (to trigger the R4 gate) is decided in the step-4 F07 redesign.

The F01 `estadoAtual` helper is unchanged (it never included `politica_privacidade`). F01 spec/plan/contract updated; F04 adopts (R8); F06/F07 adopt in step 4.

---

## R8 — Communications consent is granted only by the data subject's own action (owned by F04+F09) *(2026-07-20, consolidation step 3)*

**Gap found:** F09's booking checkbox lived in the internal panel (`CriarAgendamento.jsx`) — the **staff** clicked the opt-in on the client's behalf. That proves a staff declaration, not the titular's consent.

**Decision:**
- **Primary grant channel = the F04 public form** (titular-controlled): the two granular, non-pre-checked checkboxes (`whatsapp_optin`, `marketing`) move from F04 Full-Scope to **F04 Core**, below the required health consent. Each ticked box appends its own `ConsentLog` (`actor: 'titular'`, `origem: 'formulario'`, `textoHash`, `fichaTokenId`).
- **Panel (F09)**: *withdrawal* stays immediate and evidence-free (opt-out must be easy — Art. 7(3)); a staff-assisted *grant* is allowed only with the mandatory `evidencia` field (R7) and is visibly labelled as an assisted declaration in the UI. ⚠️ Legal sufficiency of assisted grants = matriz Q4 (jurista).
- **The `CriarAgendamento` booking checkbox is removed from F09's scope** (it was a staff-clicked grant with no evidence — exactly the reviewed weakness). `origem: 'booking'` stays in the enum as reserved for a future titular-controlled booking surface.
- Transactional/service messages remain ungated (F09 R6 unchanged); F05's form-link send remains transactional, not consent.

---

## R9 — DSR lifecycle (`PedidoTitular`), access-vs-portability, allowlisted export, full erasure scope, honest terminology (owned by F07+F06) *(2026-07-20, consolidation step 4)*

**Gaps found (2026-07-19 external review):** F06 exported raw Mongo documents (internal fields included) under the name "portability" while actually serving an access request; erasure requests were logged as consent withdrawals; the erasure missed free-text fields and embedded lead data; "anonimização" is legally pseudonymization.

**Decisions:**
1. **`PedidoTitular` model is owned by F07** (`src/models/PedidoTitular.js`, tenant DB, registered in `getModels`): `{ tenantId, clienteId, tipo: 'apagamento'|'acesso'|'portabilidade'|'rectificacao', estado: 'recebido'|'em_execucao'|'concluido'|'recusado', origem, registadoPor, prazoLimite (Art. 12(3): request date + 1 month), timestamps }`. **F06 therefore depends on F07** (implementation order inside wave 2: F07 before F06).
2. **F07's `POST /gdpr/clientes/:id/apagar`** writes one `PedidoTitular (tipo: 'apagamento')` — `estado: 'recebido'` on the grace path, `'concluido'` on the immediate path (F08 marks grace-path requests `'concluido'` when it completes them) — **plus** one `ConsentLog (dados_saude, withdrawn, actor: 'funcionario', evidencia: 'Pedido de apagamento <pedidoId>')`, which closes the R4 clinical gate during the grace window. The v1 `ConsentLog (politica_privacidade, withdrawn)` is **superseded** (an erasure request is a DSR, not a consent event).
3. **F06 export separates Art. 15 from Art. 20** via `?tipo=acesso|portabilidade` (default `acesso`): *acesso* = the full universe; *portabilidade* = only titular-provided data under consent/contract (identity + anamnese + inbound messages + consent history). Both go through **per-collection allowlists** (`exportFields.js` — no raw dumps, no internal/system fields like `etapaConversa`, `historicoMensagens`, `iaAtiva`, `__v`), gather additionally **`Lead`** (by telefone) and **`NoticeReceipt`**, and record one `PedidoTitular (tipo: <tipo>, estado: 'concluido')` — which doubles as the export audit.
4. **Erasure scope additions (extends R5):** `anonimizarCliente` also scrubs `Agendamento.observacoes` and embedded `Agendamento.leadData` (nome/telefone/email captured pre-conversion) for the client's/telefone's appointments, `Transacao.observacoes` and `Pagamento.observacoes` (free notes — not fiscal elements). `Transacao.descricao` is **kept** (invoice item description — fiscal; final word = matriz Q8).
5. **Terminology:** what `anonimizarCliente` performs is **pseudonymization** under GDPR (EDPB — the record stays linkable via `_id`/refs and remains personal data). Code identifiers (`anonimizarCliente`, `anonimizado`) stay for continuity, but every doc, the DPA and the privacy notice must say **pseudonimização/de-identificação irreversível de PII**, never claim "anonimização" in the legal sense. F07/F08 specs carry this note; matriz Q11.

---

## R10 — The appointment note is `notaOperacional`, never `observacoes`, and never reaches the AI (owned by F10; extends R1) *(2026-07-20, consolidation step 4)*

**Gap found:** F10 reused `Cliente.observacoes` as the note shown on every agenda card — but that field is free text visible to all staff **and is injected into the AI prompt** (`ia-service/services/client_orchestrator.py` ~line 287 reads it into the system-prompt state). Promoting it invited health data into a field that flows to OpenAI/Google and to every role — an indirect clinical leak.

**Decision:**
- F10 introduces **`Cliente.notaOperacional`** (String, max 200, trim, default `''`): the short operational note shown on the agenda/detail/record and written at lead-closing. The UI labels it explicitly — *"Nota operacional — sem dados de saúde"* — with placeholder examples (preferências de horário, contexto comercial).
- **`notaOperacional` never reaches `ia-service`** (neither via `/api/internal/clientes/*` projections nor via direct DB reads — same invariant class as R1, regression-asserted in both suites) and is never returned by `/clinico`.
- **`Cliente.observacoes` is untouched by F10** (legacy field; today feeds the AI's durable team notes by design). Whether `observacoes` should keep flowing to the AI at all is **matriz Q6** — an open product/legal decision, no longer entangled with F10.
- Clinical free text stays exclusively in `observacoesAdicionaisAnamnese` behind the F02 `/clinico` gate.
