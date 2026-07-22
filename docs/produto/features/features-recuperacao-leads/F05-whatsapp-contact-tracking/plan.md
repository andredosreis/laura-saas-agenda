# F05 — WhatsApp Action & Contact Tracking — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 3

## Prerequisites
- **F01** (Standardized Loss Reasons Foundation) merged: `Lead.recuperacao { contactadoEm, contactadoPor, resultado }` subdocument exists on the model, with `resultado` enum `pendente | sem_resposta | respondeu | reagendou | recusou`.
- **F02** (Recovery Report API) merged: `GET /api/v1/leads/recuperacao` returns recoverable lead rows (name, digits-only phone, stalled stage) and already implements the 30-day `contactadoEm` exclusion rule that F05's PATCH feeds.
- **F04** (Recovery Page UI) merged: `laura-saas-frontend/src/pages/RecuperacaoLeads.tsx` exists at route `/leads/recuperacao`, rendering the filtered list this feature adds a per-row action to.
- Project running locally (backend + frontend, per `CLAUDE.md` → Environment).
- Patterns confirmed: `src/modules/leads/leadController.js` → `toggleAi` (small tenant-scoped PATCH), `src/modules/gdpr/gdprController.js` → `registarConsentimento` (server-derived fields, `req.user.userId`), `laura-saas-frontend/src/services/leadsService.ts` (existing wrapper conventions).

## Phase 1 — Backend: PATCH endpoint
1. **Resultado enum** — In `src/modules/leads/pipelineConstants.js`, add `RECUPERACAO_RESULTADO_VALUES` (reuse F01's constant if it already exists instead of duplicating it).
2. **Zod schema** — In `src/modules/leads/leadSchemas.js`, add `marcarRecuperacaoSchema` (`{ resultado: z.enum(RECUPERACAO_RESULTADO_VALUES) }.strict()`), following `pauseAiSchema`'s shape.
3. **Controller** — In `src/modules/leads/leadController.js`, add `marcarRecuperacao`: `findOne({ _id, tenantId: req.tenantId })` → 404 if missing → compute `jaContactado = Boolean(lead.recuperacao?.contactadoEm)` → set `contactadoEm`/`contactadoPor` only when `!jaContactado` (Luxon `DateTime.now().setZone('Europe/Lisbon')`, `req.user.userId`), always set `resultado` from `req.body` → `save()` → 200 with the updated lead.
4. **Route** — In `src/modules/leads/leadRoutes.js`, add `router.patch('/:id/recuperacao', requirePermission('verLeads'), validate(leadIdParamSchema,'params'), validate(marcarRecuperacaoSchema), marcarRecuperacao)` alongside the other "Acções específicas" routes.

## Phase 2 — Frontend: normalizer, action component, wiring
5. **Phone normalizer** — Create `laura-saas-frontend/src/utils/whatsappLink.ts`: `normalizeToE164(digits)` (9-digit `9`-leading → prefix `351`; already has a country code → as-is; otherwise → `{ ok: false, reason }`), `buildWaMeUrl(e164, mensagem)` (URL-encodes the message), `DEFAULT_RECOVERY_MESSAGE` constant. Pure, no React/DOM imports.
6. **Types + service** — In `laura-saas-frontend/src/types/lead.ts`, add `RECUPERACAO_RESULTADO`/`RecuperacaoResultado`/`MarkRecuperacaoDTO` and the `recuperacao?` field on `Lead`. In `laura-saas-frontend/src/services/leadsService.ts`, add `markRecuperacao(id, resultado)` → `api.patch('/leads/:id/recuperacao', { resultado })`.
7. **Action component** — Create `laura-saas-frontend/src/components/leads/WhatsAppContactAction.tsx`: button (disabled + tooltip when `normalizeToE164` fails) → small popover with the editable default message → `window.open(buildWaMeUrl(...), '_blank', 'noopener,noreferrer')` → `window` `focus` listener shows "Marcar como contactado?" → outcome picker (5 options, default `pendente`) → calls `leadsService.markRecuperacao` and reports the result via `onContacted`/`onError` callback props (does not own list state, per `.claude/rules/react-components.md`).
8. **Wire into F04's page** — In `laura-saas-frontend/src/pages/RecuperacaoLeads.tsx`, render `WhatsAppContactAction` per row; implement optimistic removal on `onContacted` with a 5 s `react-toastify` undo toast, and rollback + `toast.error` on `onError`.

## Phase 3 — Tests & gates
9. **Backend tests** — Create `tests/lead-recuperacao-contact.test.js`: valid PATCH (200, fields set correctly), invalid `resultado` (400), extra body key rejected (400), invalid ObjectId (400), non-existent lead (404), re-edit during cool-off does not reset `contactadoEm`/`contactadoPor` (the key regression test), missing `verLeads` (403), tenant isolation (404 on another tenant's lead) — per spec §7.
10. **Frontend tests** — Create `laura-saas-frontend/src/utils/__tests__/whatsappLink.test.ts` covering the normalization table in spec §5 (`912345678` → `351912345678`; `5511987654321` → as-is; 7-digit → disabled/`ok:false`; 9-digit not `9`-leading → `ok:false`; URL-encoding of `buildWaMeUrl`).
11. **Gates** — Backend: `npm run lint` and `npm test` (or `npm test -- --testPathPattern=lead-recuperacao`). Frontend: `cd laura-saas-frontend && npm run lint && npm run test:run` and `npm run build` (TypeScript check). All green before `/implement-evaluate`.
