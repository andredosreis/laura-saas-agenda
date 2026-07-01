# RGPD Features — Cross-Feature Reconciliation (2026-06-25)

Resolves three seams found after the wave-batch spec generation. These decisions are **authoritative**: where a feature spec says otherwise, follow this document. Each affected spec links here.

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
