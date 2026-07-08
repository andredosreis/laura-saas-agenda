# RGPD Features — Cross-Feature Reconciliation (2026-06-25, actualizado 2026-07-07)

Resolves the seams found after the wave-batch spec generation (R1–R3, 2026-06-25) plus two gaps found in the 2026-07-07 review (R4–R5). These decisions are **authoritative**: where a feature spec says otherwise, follow this document. Each affected spec links here.

---

## R1 — AI data minimization covers the direct Mongo reader (owned by F02)

**Decision (with André):** the AI's only privacy duty is to *help send the consent link* — and even that send is **manual by staff** (F05), not the AI. The AI **never needs clinical/anamnesis data**.

Therefore F02's clinical-field minimization must cover **both** paths the AI can read client data through:
1. The HTTP internal route `src/modules/clientes/clienteInternalRoutes.js` (consumed by `ia-service`).
2. The **direct DB reader** `ia-service/src/ia_service/services/mongo_reader.py` — its `Cliente` projection must **exclude the entire clinical/anamnesis block** (the same field list F02 classifies as clinical).

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

F08 inherits all of this automatically (it only calls F07's service).
