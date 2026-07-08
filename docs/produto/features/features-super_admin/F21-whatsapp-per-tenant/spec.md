# F21 — Per-Tenant WhatsApp/Evolution Management · Spec

ADR-024 Phase 4 (never implemented) + ADR-021 (Evolution instance per tenant). Onboarding a client today requires manual Evolution Manager work; this brings instance lifecycle (view state, create, connect via QR, disconnect) into the tenant detail page.

**This is the least-mechanical spec of the phase: it depends on the Evolution API v2 surface. Step 0 for the implementer is discovery — do not skip it.**

## Mandatory reading (Step 0 — discovery)
- `docs/adrs/generated/ADR-021-evolution-instance-per-tenant.md` and `ADR-016-evolution-api-v2-upgrade.md`
- `src/utils/evolutionClient.js` — **currently exposes ONLY `sendWhatsAppMessage` and `getMediaBase64`**; all instance-management functions are new. Copy its auth/base-URL conventions (`EVOLUTION_API_URL`, API-key header) exactly.
- `src/models/Tenant.js:116-140` — the `whatsapp` subdocument (`provider`, `instanceName` unique+sparse slug, `instanceToken`, `numeroWhatsapp`, `webhookConfigured`, `webhookUrl`)
- How the webhook is configured for existing instances: search `scripts/tools/` + `src/modules/ia/` for `webhook` + Evolution instance provisioning; mirror whatever production instances use (webhook URL + token header), or the new instance will be mute.
- Evolution API v2 instance endpoints via context7/official docs: `POST /instance/create`, `GET /instance/connectionState/{name}`, `GET /instance/connect/{name}` (QR/pairing), `DELETE /instance/logout/{name}` — **verify exact paths/payloads against the deployed Evolution version in `docker-compose.prod.yml` before coding.**

## Component Overview
- `src/utils/evolutionClient.js` — new functions: `createInstance(instanceName, opts)`, `getConnectionState(instanceName)`, `getConnectQR(instanceName)`, `logoutInstance(instanceName)` (shared util — the IA module and workers may reuse them later).
- `src/modules/admin/adminController.js` + `adminRoutes.js` + `adminSchemas.js` — 4 routes below.
- Frontend: `WhatsAppCard.tsx` in `components/admin/` rendered by `TenantDetailPage`; `useAdminTenantWhatsApp.ts` hook.

## Scope
**Included:** view instance status, create instance (+persist on Tenant + webhook config), fetch QR to connect, logout/disconnect.
**Out of scope:** deleting instances, migrating legacy Z-API fields, multi-number per tenant, sending test messages, the IA toggle (exists elsewhere).

## Requirements / Business Rules

### Routes (all inherit the four gates; mutations via `adminMutation`)
1. **`GET /tenants/:id/whatsapp`** (read) — returns the Tenant's allowlisted whatsapp fields (`provider`, `instanceName`, `numeroWhatsapp`, `webhookConfigured` — NEVER `instanceToken`) plus, when an instance exists, the **live** `connectionState` from Evolution (wrap the external call: Evolution down → return the stored fields with `connectionState: 'unknown'` and `evolutionReachable: false`, HTTP 200 — the panel must not 500 because Evolution is down). `req.audit.set({ action: 'tenant.whatsapp.view', targetTenantId: id })`.
2. **`POST /tenants/:id/whatsapp/instancia`** — create. Zod body: `{ instanceName?: string }` (slug `[a-z0-9-]`, default derived from tenant slug). Flow (external-then-persist):
   - 409 if the tenant already has `whatsapp.instanceName`.
   - Call `createInstance` (Evolution) **before** the DB mutation; configure the webhook in the same call or a follow-up call (URL + `x-api-token` per production convention — from discovery).
   - Then `adminMutation('tenant.whatsapp.create', work)` persists `{ provider: 'evolution', instanceName, instanceToken, webhookConfigured: true, webhookUrl }` on the Tenant.
   - **Compensation:** if the DB mutation fails after Evolution creation, best-effort delete/logout the orphan instance and log it; the request returns the error. (External side-effects cannot live inside the transaction — same rationale as F06's e-mail in `afterCommit`, but creation must precede persistence because the token comes from Evolution.)
   - Audit `before/after`: `{ instanceName, webhookConfigured }` only — never the token.
3. **`GET /tenants/:id/whatsapp/qr`** (read) — proxy the QR/pairing payload for connecting the device. Audit `tenant.whatsapp.qr` with NO QR payload in metadata (it is a session credential). 404 if the tenant has no instance.
4. **`POST /tenants/:id/whatsapp/logout`** — `adminMutation('tenant.whatsapp.logout', work)`: call Evolution logout first; on success persist any state change (e.g. clear `numeroWhatsapp` if the discovery shows it is derived from the session). Idempotent: logging out a disconnected instance succeeds.

### Frontend — `WhatsAppCard` in `TenantDetailPage`
- No instance → empty state + "Criar instância" (gradient button) → optional instanceName input → create → card refreshes.
- Instance exists → status pill (`connected` emerald / `connecting` amber / `disconnected` red / `unknown` slate), instanceName (mono), numeroWhatsapp, "Mostrar QR" button → renders the QR image (Evolution returns base64) with a refresh action (QRs expire ~30s — poll or manual refresh; manual refresh is enough for MVP).
- "Desligar sessão" → `ConfirmDialog` **danger** with explicit copy ("a IA e os lembretes deste cliente deixam de conseguir enviar mensagens").
- Evolution unreachable → amber inline notice, card still renders stored data.

## API Contracts
- `GET .../whatsapp` → `200 { success, data: { provider, instanceName?, numeroWhatsapp?, webhookConfigured, connectionState, evolutionReachable } }`
- `POST .../whatsapp/instancia` `{ instanceName? }` → `201 { success, data: { instanceName, connectionState } }` · 409 already exists · 502 Evolution error (contract body, generic message)
- `GET .../whatsapp/qr` → `200 { success, data: { qrBase64 | pairingCode } }` (per discovery) · 404 no instance
- `POST .../whatsapp/logout` → `200 { success, data: { connectionState } }`
- All: 400 invalid id · 404 tenant not found / non-superadmin

## Error Handling
- Every Evolution call has a timeout (follow `evolutionClient`'s axios config) and maps failures to 502 with a generic message — never leak Evolution URLs/keys in responses.
- Secrets hygiene: `instanceToken`, QR payloads and Evolution global API key never appear in responses (except QR to the operator, by design), audit entries or logs.

## Testing Strategy
- `tests/admin-tenant-whatsapp.test.js` — **mock `src/utils/evolutionClient.js` entirely** (house rule: never real external services; see mocking style in existing tests / `.claude/rules/testing.md`).
  1. View: no instance → `connectionState` absent/`unknown`; with instance → merged live state; Evolution mock rejects → 200 with `evolutionReachable:false`.
  2. Create: happy path persists tenant fields + ONE `tenant.whatsapp.create` audit entry without the token (JSON scan); duplicate → 409; Evolution failure → 502, tenant unchanged; DB failure after create → compensation called (assert mock).
  3. QR: returns payload; audit metadata contains no QR; no instance → 404.
  4. Logout: idempotent; audited.
  5. Sweep test auto-covers all four routes.

## Assumptions / Decisions
- **[Key]** External-call-BEFORE-mutation with best-effort compensation (instead of afterCommit) because the instance token only exists after Evolution creates it; an orphan Evolution instance is recoverable garbage, an orphan DB record pointing at nothing is a broken tenant.
- **[Key]** Discovery step is mandatory: exact Evolution endpoints/payloads and the webhook wiring MUST be confirmed against the deployed version (docker-compose) — the spec deliberately does not hardcode them.
- **[Auto-Accept]** Legacy Z-API fields untouched (retrocompat, ADR-014); `provider` flips to `'evolution'` on instance creation.
