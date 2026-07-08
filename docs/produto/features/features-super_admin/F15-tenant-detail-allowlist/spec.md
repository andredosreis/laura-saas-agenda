# F15 — Tenant Detail Allowlist Projection · Spec

`GET /admin/tenants/:id` currently excludes secrets by **denylist** (`adminController.js:56-58` — only `whatsapp.instanceToken`, `whatsapp.zapiToken`, `whatsapp.zapiClientToken`). Any new secret field added to the `Tenant` schema is exposed by default. Replace with an explicit **allowlist**: new fields are private until deliberately added.

## Mandatory reading
- `src/models/Tenant.js` (the full schema — the allowlist must be derived from its current fields)
- `src/modules/admin/adminController.js` — `obterTenant` (`:48-69`)
- `laura-saas-frontend/src/types/admin.ts` + `src/pages/admin/TenantDetailPage.tsx` (fields the UI actually consumes — the allowlist must be a superset of these)

## Component Overview
- `src/modules/admin/adminController.js` — `TENANT_DETAIL_FIELDS` exported const + `obterTenant` switched to an **inclusion** projection.
- No route or schema changes.

## Scope
**Included:** inclusion projection for `obterTenant`; regression test locking the response shape.
**Out of scope:** changing `listarTenants` (already a minimal inclusion select — `'nome slug plano createdAt'`), redacting fields inside audit entries (already GDPR-minimal), removing `contato` (see Decisions).

## Requirements / Business Rules
- Define `TENANT_DETAIL_FIELDS` as a single exported array in `adminController.js`, built by reading the **current** `Tenant` schema and including everything the operator legitimately needs, e.g. (verify against the schema at implementation time — do not copy blindly):
  `['nome', 'slug', 'ativo', 'plano', 'limites', 'configuracoes', 'branding', 'contato', 'whatsapp.instanceName', 'whatsapp.numeroWhatsapp', 'whatsapp.status', 'createdAt', 'updatedAt']`
- Hard exclusions that must NEVER appear (assert in tests): `whatsapp.instanceToken`, `whatsapp.zapiToken`, `whatsapp.zapiClientToken`, and any field whose name matches `/token|secret|key|password/i`.
- `obterTenant` uses `Tenant.findById(id).select(TENANT_DETAIL_FIELDS.join(' '))` — an inclusion projection (`_id` comes along by default, which is fine; the frontend uses it).
- If `configuracoes` contains sub-secrets at implementation time (check the schema), allowlist its needed subfields instead of the whole object.
- Verify the frontend still renders: `TenantDetailPage.tsx` consumes plan/limits/flags — cross-check each accessed path exists in the allowlist; extend the allowlist rather than break the page.
- Add a short comment on `TENANT_DETAIL_FIELDS` stating the rule: "novo campo no schema Tenant é privado por omissão — adicionar aqui é uma decisão deliberada" and that `contato` is included on a need-to-know basis (GDPR: operator manages the account).

## API Contracts
- `GET /api/v1/admin/tenants/:id` → `200 { success, data: { tenant, totalUsuarios } }` where `tenant` contains **only** allowlisted paths. Errors unchanged (400 invalid id, 404 not found).

## Data Model
None.

## Error Handling
Unchanged.

## Testing Strategy
- Extend `tests/admin-tenants.test.js`:
  1. Seed a tenant with ALL sensitive fields populated (`whatsapp.instanceToken: 'sekret'`, etc.) → response contains none of the hard exclusions (deep-scan the JSON: `expect(JSON.stringify(body)).not.toContain('sekret')`).
  2. Shape lock: every top-level key of `data.tenant` is in the allowlist's top-level set (catches accidental widening).
  3. Positive: `nome`, `slug`, `plano.tipo`, `limites`, `totalUsuarios` present (catches accidental narrowing that would break the UI).

## Assumptions / Decisions
- **[Key]** `contato` (owner's personal contact data) stays visible: the operator runs a done-for-you service and needs to reach the owner; access is superadmin-only and every view is audited (`tenant.view`). Documented as a GDPR need-to-know decision.
- **[Auto-Accept]** Inclusion projection over `toSafeObject()`-style stripping: projection happens in the DB, cannot leak via `toJSON`, and is self-documenting.
