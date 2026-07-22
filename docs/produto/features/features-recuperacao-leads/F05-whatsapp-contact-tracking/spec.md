# F05 — WhatsApp Action & Contact Tracking — Spec

**PRD:** `docs/produto/PRD-recuperacao-leads.md` (F05, §5/§6/§9 + Cross-Feature Integration)
**Design reference:** `docs/superpowers/specs/2026-07-22-recuperacao-leads-design.md` (§6.3, §7.4, §5)
**Complexity:** moderate
**Module:** `src/modules/leads/` (backend, tenant-scoped, edit-only) + `laura-saas-frontend/src/{utils,components,services,types,pages}` (frontend)

---

## 1. Scope

**Included:**
- `PATCH /api/v1/leads/:id/recuperacao` — records a contact attempt outcome on the `recuperacao` subdocument that F01 adds to the `Lead` model. Server-derived `contactadoEm`/`contactadoPor`; body only carries `resultado`.
- The **no-reset-on-re-edit** rule: once `recuperacao.contactadoEm` is set, a later PATCH during the 30-day cool-off updates `resultado` only — `contactadoEm`/`contactadoPor` are left untouched, so the cool-off clock (owned by F02) never restarts because someone corrected the outcome.
- Frontend phone normalizer (`whatsappLink.ts`) — pure, unit-testable — and the `wa.me` link builder with an editable, frontend-default suggested message.
- Frontend per-row action component (button → popover → `wa.me` new tab → on-focus-return "mark as contacted?" prompt → outcome picker → optimistic removal with 5 s undo), wired into the F04 page `RecuperacaoLeads.tsx`.

**Provides (to later features / already-shipped consumers):**
- The written `recuperacao.contactadoEm` value — F02's 30-day exclusion rule reads this field; F05 does not implement that exclusion, only writes the timestamp it depends on.

**Consumes:**
- `Lead.recuperacao { contactadoEm, contactadoPor, resultado }` subdocument and the `resultado` enum — from **F01** (prerequisite, not created here).
- Recoverable lead rows (name, digits-only phone, stalled stage) — from **F02**'s report response (prerequisite).
- The page shell, filters, and list rendering — from **F04** (prerequisite); F05 only adds the per-row action and its state.

**Explicitly out of scope (PRD §7 / design §11–§12):**
- Per-tenant recovery message template editor — the suggested message is a frontend constant only (registered debt).
- Mass/automated WhatsApp dispatch (ADR-025, GDPR F09).
- The 30-day exclusion logic itself and the cold-lead derivation — both live in F02; F05 only supplies the field F02 reads.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/modules/leads/pipelineConstants.js` | edit | Add `RECUPERACAO_RESULTADO_VALUES` (5-value enum: `pendente, sem_resposta, respondeu, reagendou, recusou`), co-located with the existing `LEAD_STAGES`/`ORIGEM_VALUES`/`URGENCIA_VALUES` constants so the Zod schema and any future consumer share one source of truth. *(Skip this file if F01 already exported this constant when it added the `recuperacao` subdocument — reuse it instead of duplicating.)* |
| `src/modules/leads/leadSchemas.js` | edit | Add `marcarRecuperacaoSchema` — body `{ resultado }`, `.strict()` like every other schema in this file (rejects `contactadoEm`/`contactadoPor`/any extra key with 400, not silent drop) |
| `src/modules/leads/leadController.js` | edit | Add `marcarRecuperacao` handler — same shape/size as the existing `toggleAi` (small `findOne` + conditional field set + `save`), not a new service file (no report/aggregation logic here, unlike F02's `recuperacaoService.js`) |
| `src/modules/leads/leadRoutes.js` | edit | Add `router.patch('/:id/recuperacao', requirePermission('verLeads'), validate(leadIdParamSchema,'params'), validate(marcarRecuperacaoSchema), marcarRecuperacao)` next to the other "Acções específicas" routes |
| `laura-saas-frontend/src/utils/whatsappLink.ts` | new | Pure functions: `normalizeToE164(telefoneDigits)`, `buildWaMeUrl(e164, mensagem)`, exported constant `DEFAULT_RECOVERY_MESSAGE` |
| `laura-saas-frontend/src/utils/__tests__/whatsappLink.test.ts` | new | Vitest unit tests for the normalizer (existing convention: `__tests__/` sibling folder, e.g. `src/components/__tests__/SlotPicker.test.ts`) |
| `laura-saas-frontend/src/components/leads/WhatsAppContactAction.tsx` | new | Per-row UI: "Chamar no WhatsApp" button (disabled + tooltip when normalization fails) → editable-message popover → opens `wa.me` in a new tab → on window-focus-return shows inline "Marcar como contactado?" → outcome picker (5 options, default `pendente`) → calls `leadsService.markRecuperacao`; reports success/failure to the parent via callbacks (list mutation stays in the page, per `.claude/rules/react-components.md` — `components/` is UI, not state owner) |
| `laura-saas-frontend/src/services/leadsService.ts` | edit | Add `markRecuperacao(id, resultado): Promise<LeadResponse>` → `api.patch('/leads/:id/recuperacao', { resultado })` |
| `laura-saas-frontend/src/types/lead.ts` | edit | Add `RECUPERACAO_RESULTADO` const + `RecuperacaoResultado` type, `MarkRecuperacaoDTO`, and the `recuperacao?: { contactadoEm?: string \| null; contactadoPor?: string \| null; resultado?: RecuperacaoResultado }` field on the `Lead` interface (mirrors the backend model per this file's own header comment) |
| `laura-saas-frontend/src/pages/RecuperacaoLeads.tsx` | edit (F04 prerequisite) | Render `WhatsAppContactAction` per row; own the optimistic removal + 5 s undo toast + rollback-on-error (list state lives in the page) |
| `tests/lead-recuperacao-contact.test.js` | new | Backend integration tests (Jest ESM + supertest + `mongodb-memory-server`) |

Pattern references: `src/modules/leads/leadController.js` → `toggleAi` (small tenant-scoped PATCH), `src/modules/leads/leadSchemas.js` → `pauseAiSchema` (single-field `.strict()` body), `src/modules/gdpr/gdprController.js` → `registarConsentimento` (server-derived fields never read from body, `req.user.userId` usage), `laura-saas-frontend/src/services/leadsService.ts` (existing `pauseAi` wrapper is the closest sibling to `markRecuperacao`).

---

## 3. Data Model

`Lead.recuperacao` is defined by **F01** (not created by this feature); F05 only writes to it:

```js
// src/models/Lead.js (F01 prerequisite — shown for reference, not written by F05)
recuperacao: {
  contactadoEm:  { type: Date, default: null },
  contactadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  resultado:     { type: String, enum: RECUPERACAO_RESULTADO_VALUES, default: null },
},
```

### 3.1 Write semantics (owned by F05)

The PATCH handler distinguishes **first contact** from **outcome re-edit** by checking whether `contactadoEm` is already set:

```js
const jaContactado = Boolean(lead.recuperacao?.contactadoEm);
const agora = DateTime.now().setZone('Europe/Lisbon').toJSDate();

lead.recuperacao = {
  contactadoEm:  jaContactado ? lead.recuperacao.contactadoEm  : agora,
  contactadoPor: jaContactado ? lead.recuperacao.contactadoPor : req.user.userId,
  resultado:     req.body.resultado,
};
await lead.save();
```

- **First PATCH** on a lead with no prior `contactadoEm`: sets `contactadoEm = now` (Luxon, `Europe/Lisbon`), `contactadoPor = req.user.userId`, `resultado = body.resultado`. This starts F02's 30-day exclusion window.
- **Re-edit PATCH** during the cool-off (`contactadoEm` already set): `resultado` is overwritten with the new value; **`contactadoEm` and `contactadoPor` are left exactly as they were**. This is the documented nuance from the PRD — the cool-off window must not restart just because someone corrected `pendente` → `reagendou` a few days later. `contactadoPor` is frozen for the same reason: it records *who made first contact*, an audit fact that a later outcome edit should not overwrite (`[Auto-Accept]`, PRD only mandates `contactadoEm` not resetting; freezing `contactadoPor` alongside it keeps the two fields internally consistent instead of one moving without the other).
- `req.body` never supplies `contactadoEm`/`contactadoPor`/`tenantId` — the Zod schema's `.strict()` rejects any of those keys outright (400), and even if a key coincidentally matched a schema field, the controller ignores `req.body` for anything but `resultado`.

### 3.2 Frontend row shape consumed (assumed from F02/F04, not owned by F05)

`[Auto-Accept]` — F02/F04 specs are produced in parallel; this feature assumes the recovery list row exposes at minimum:

```ts
interface RecuperacaoLeadRow {
  _id: string;
  nome?: string;
  telefone: string;       // digits-only, same convention as Lead.telefone
  recuperacao?: { contactadoEm?: string | null; resultado?: RecuperacaoResultado };
  // + whatever else F02/F04 define (etapaParada, motivo, diasParado, ...) — irrelevant to F05
}
```

If F02/F04 land with a different field name for the row id or phone, `WhatsAppContactAction` only needs `_id` and `telefone` as props — reconcile at integration time, no redesign needed.

---

## 4. API Contracts

### `PATCH /api/v1/leads/:id/recuperacao` — record/update a contact outcome

Guarded by `requirePermission('verLeads')` (design decision — contacting a lead is an operational action on the recovery list, not lead editing, so it does not require `editarLeads`). Tenant-scoped via `req.tenantId`; `:id` validated via `leadIdParamSchema`.

**Request:**
```json
{ "resultado": "reagendou" }
```

**Response `200` (first contact):**
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "nome": "Ana Silva",
    "telefone": "351912345678",
    "status": "qualificado",
    "recuperacao": {
      "contactadoEm": "2026-07-22T14:03:00.000Z",
      "contactadoPor": "665aaaa000000000000000a",
      "resultado": "reagendou"
    },
    "updatedAt": "2026-07-22T14:03:00.000Z"
  }
}
```

**Response `200` (re-edit during cool-off — `contactadoEm` unchanged from the original call):**
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "recuperacao": {
      "contactadoEm": "2026-07-15T09:10:00.000Z",
      "contactadoPor": "665aaaa000000000000000a",
      "resultado": "respondeu"
    }
  }
}
```

**Error cases:**

`400` — invalid `resultado`:
```json
{ "success": false, "error": "resultado: Invalid enum value. Expected 'pendente' | 'sem_resposta' | 'respondeu' | 'reagendou' | 'recusou', received 'foo'" }
```

`400` — extra/unexpected body key (e.g., client sends `contactadoEm`):
```json
{ "success": false, "error": "Unrecognized key(s) in object: 'contactadoEm'" }
```

`400` — invalid `:id` (not a valid ObjectId):
```json
{ "success": false, "error": "ID inválido" }
```

`404` — lead does not exist, or belongs to another tenant:
```json
{ "success": false, "error": "Lead não encontrado" }
```

`403` — caller lacks `verLeads`:
```json
{ "success": false, "error": "Sem permissão para executar esta acção", "requiredPermission": "verLeads" }
```

---

## 5. Requirements / Business Rules

- **R1.** `resultado` must be one of the 5 enum values (`pendente | sem_resposta | respondeu | reagendou | recusou`); anything else → 400 naming the allowed values (Zod's default enum message already lists them).
- **R2.** `contactadoEm` and `contactadoPor` are **never** accepted from the request body — the schema's `.strict()` rejects extra keys outright, and the controller only ever reads `req.body.resultado`.
- **R3.** `contactadoEm`/`contactadoPor` are set **once**: on the first successful PATCH for a given lead (when `recuperacao.contactadoEm` is falsy). Every subsequent PATCH updates only `resultado`.
- **R4.** Lead lookup is always `Lead.findOne({ _id, tenantId: req.tenantId })` — a lead belonging to another tenant returns 404, never 403 (`.claude/rules/multi-tenant.md`).
- **R5.** `:id` is validated as an ObjectId before the query (`leadIdParamSchema`, shared with the rest of the module) — invalid format → 400 before any DB round-trip.
- **R6.** Guarded by `requirePermission('verLeads')` — the same permission used by `GET /leads` and (per F02's design) `GET /leads/recuperacao`; contacting is read/operate on the recovery list, not a lead edit, so `editarLeads` is deliberately not required.
- **R7.** This endpoint does not itself exclude the lead from any list — that exclusion (30-day window on `contactadoEm`) is F02's responsibility, read at query time. F05's only contract with F02 is: *write an accurate `contactadoEm`*.

### Phone normalization decision table (frontend, `whatsappLink.ts`)

| Input (digits-only, after stripping non-digits) | Rule | Output |
|---|---|---|
| 9 digits, starts with `9` (e.g. `912345678`) | Portuguese mobile without country code | prefix `351` → `351912345678` |
| More than 9 digits (e.g. `5511987654321`) | Already carries a country code | use as-is |
| Anything else (e.g. 7–8 digits, or 9 digits not starting with `9`) | Not normalizable — cannot build a safe `wa.me` link | button disabled, `title`/tooltip: `"Número sem indicativo — verificar na ficha"` |

`normalizeToE164` never throws — it returns a discriminated result (`{ ok: true, e164 } | { ok: false, reason }`) so the component can render the disabled state without a try/catch.

- **R8.** The suggested message is a frontend constant (`DEFAULT_RECOVERY_MESSAGE`), always editable in the popover before the link is built; the final (possibly edited) text is URL-encoded into `?text=`.
- **R9.** Clicking "Chamar no WhatsApp" opens `https://wa.me/<e164>?text=<encoded>` in a **new tab** (`window.open(url, '_blank', 'noopener,noreferrer')`) — never navigates the current tab away from the recovery list.
- **R10.** On return focus (`window` `focus` event after the WhatsApp tab was opened) the component shows an inline "Marcar como contactado?" prompt — it does not assume the outcome; the user still picks one of the 5 values (default `pendente` if they don't change it).
- **R11.** Marking as contacted is optimistic: the row is removed from the visible list immediately, with a 5 s "Desfazer" (undo) toast. If the user undoes within the window, no PATCH is sent (or the local removal is simply reverted if the PATCH already started — see Error Handling). If the PATCH fails after optimistic removal, the row is restored and an error toast is shown.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| `resultado` missing or out of enum | 400 | `{ success:false, error:"resultado: ..." }` naming allowed values |
| Extra/unexpected body key (`contactadoEm`, `contactadoPor`, etc.) | 400 | `{ success:false, error:"Unrecognized key(s) in object: '...'" }` |
| Invalid `:id` (not an ObjectId) | 400 | `{ success:false, error:'ID inválido' }` |
| Lead not found / belongs to another tenant | 404 | `{ success:false, error:'Lead não encontrado' }` (never 403 — do not reveal existence) |
| Caller lacks `verLeads` | 403 | `{ success:false, error:'Sem permissão para executar esta acção', requiredPermission:'verLeads' }` |
| No/invalid token | 401 | handled by `authenticate` |
| Unexpected | 500 | `{ success:false, error:'Erro interno ao marcar recuperação.' }` — never a stack trace |
| **Frontend:** phone not normalizable | n/a (no request sent) | Button rendered `disabled`, `title="Número sem indicativo — verificar na ficha"` |
| **Frontend:** PATCH fails after optimistic removal | n/a | Row restored to the list; `toast.error(err.response?.data?.error \|\| 'Erro ao marcar como contactado.')` |

---

## 7. Testing Strategy

### Backend — `tests/lead-recuperacao-contact.test.js` (Jest ESM + supertest + `mongodb-memory-server`)

**Acceptance (PRD §9 F05 + Cross-Feature Integration):**
- `PATCH .../recuperacao` with a valid `resultado` → 200, `recuperacao.contactadoEm` set to (approximately) now, `recuperacao.contactadoPor` set to the caller's user id, `recuperacao.resultado` equals the body value.
- `PATCH` with `resultado: 'foo'` → 400, naming the allowed values; no field is written (fetch the lead again, `recuperacao` unchanged from before the call).
- `PATCH` with an extra body key (`contactadoEm`, `contactadoPor`, `tenantId`) → 400 (mass-assignment attempt rejected outright by `.strict()`); no field is written.
- `PATCH` on an invalid ObjectId → 400 `{ error: 'ID inválido' }`.
- `PATCH` on a non-existent lead id (valid ObjectId, no matching doc) → 404.
- **Re-edit does not reset `contactadoEm`:** PATCH once (`resultado: 'pendente'`) capturing the returned `contactadoEm`; wait/advance a beat; PATCH again (`resultado: 'reagendou'`) on the same lead → 200, `recuperacao.resultado === 'reagendou'`, **`recuperacao.contactadoEm` is byte-identical to the first call's value** (and `contactadoPor` also unchanged).
- `verLeads` missing → 403 (use a role/permission combination that has `editarLeads` but not `verLeads`, to also prove `editarLeads` is not sufficient — R6).

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- Tenant B's token PATCHing Tenant A's lead id → 404 (never 403, never leaks that the lead exists).
- Tenant A's own PATCH still succeeds normally in the same test file (sanity control).

### Frontend — `laura-saas-frontend/src/utils/__tests__/whatsappLink.test.ts` (Vitest)

- `normalizeToE164('912345678')` → `{ ok: true, e164: '351912345678' }`.
- `normalizeToE164('5511987654321')` → `{ ok: true, e164: '5511987654321' }` (used as-is, already has a country code).
- `normalizeToE164('1234567')` (7 digits) → `{ ok: false, reason: expect.any(String) }` — component must render the button disabled.
- `normalizeToE164('812345678')` (9 digits, not starting with `9`) → `{ ok: false }` (does not blindly prefix `351` on any 9-digit input — only the `9`-leading PT-mobile shape).
- `buildWaMeUrl('351912345678', 'Olá!')` → `https://wa.me/351912345678?text=Ol%C3%A1!` (URL-encoding verified, including accented characters).
- Non-digit characters in the raw input (spaces, `+`, `-`) are stripped before the rule is applied (e.g. `+351 912 345 678` normalizes the same as `351912345678`).

**Not covered here (deferred to F04's own test suite):** the optimistic-removal/undo-toast interaction test for the full `RecuperacaoLeads.tsx` page — F05 only guarantees `WhatsAppContactAction` calls the right callbacks; the page's list-mutation behavior is exercised where the page itself is tested.

---

## 8. Assumptions & Decisions

- `[Auto-Accept]` `marcarRecuperacao` lives directly in `leadController.js`, not in a new `recuperacaoController.js` — it is a single-field, tenant-scoped PATCH the same shape as the existing `toggleAi`, unlike F02/F03's aggregation-heavy report logic which the design doc explicitly extracts into `recuperacaoService.js`/`csvExport.js`. Splitting it out would add a file for one ~15-line handler with no reuse.
- `[Auto-Accept]` `contactadoPor` is frozen alongside `contactadoEm` on re-edit (see §3.1) — the PRD text only names `contactadoEm` explicitly, but leaving `contactadoPor` mutable while `contactadoEm` is frozen would let the audit trail claim "contacted by X" while never having recorded when X made contact after a later editor's PATCH. Freezing both keeps the pair internally consistent.
- `[Auto-Accept]` The route is `PATCH /:id/recuperacao` (sub-resource of `:id`), which does not collide with F02's `GET /recuperacao` (different HTTP method and a different path shape — two segments vs. one) — no reordering relative to F02's routes is needed in `leadRoutes.js`, unlike the `GET /:id` vs. `GET /recuperacao` conflict F02 has to solve.
- `[Auto-Accept]` `req.user.userId` (not `req.user._id`) is used for `contactadoPor` — this project's real `authenticate` middleware (`src/middlewares/auth.js`) populates `req.user.userId`, and the already-implemented `gdprController.js` (`registrarConsentimento`) follows the same convention for its `registadoPor` field. The generic `CLAUDE.md`/PRD phrasing ("`req.user._id`") does not match the actual JWT payload shape in this codebase.
- `[Auto-Accept]` `RECUPERACAO_RESULTADO_VALUES` is added to `pipelineConstants.js` if F01 did not already export a named constant for the `resultado` enum (the design doc §4.2 shows it inline in the schema). Centralizing it here mirrors how `LEAD_STAGES`/`ORIGEM_VALUES`/`URGENCIA_VALUES` are already shared between the Mongoose schema and the Zod schemas in this module.
- `[Auto-Accept]` The unrecognized-key rejection for `contactadoEm`/`contactadoPor` comes from Zod's `.strict()` returning 400 (fail loudly), rather than the `validate` middleware's `SERVER_MANAGED_KEYS` silent-strip mechanism — `SERVER_MANAGED_KEYS` currently only strips `_id`/`tenantId`/`__v`/`createdAt`/`updatedAt`, not `contactadoEm`/`contactadoPor`. Adding these to that shared list was considered but rejected: it would silently drop a client bug (e.g. a stale form still submitting them) instead of surfacing it, and no other route in this module needs a "recuperacao"-shaped strip.
- `[Auto-Accept]` The exact shape of `RecuperacaoLeadRow` (§3.2) is assumed pending F02/F04's own specs, generated in the same batch. `WhatsAppContactAction` is designed to need only `_id`, `nome` (optional, falls back to `telefone`), and `telefone` as props, minimizing reconciliation risk.
- `[Auto-Accept]` Frontend unit tests for the normalizer run under Vitest (`laura-saas-frontend/package.json` → `"test": "vitest"`), following the existing `src/**/__tests__/*.test.ts` convention (e.g. `src/components/__tests__/SlotPicker.test.ts`), not Jest — the two test runners in this repo are backend (Jest) and frontend (Vitest), never mixed.
