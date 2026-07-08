# F16 — Super-Admin 2FA (TOTP) · Spec

The super-admin logs in through the same `POST /api/auth/login` as everyone else, and `authorize()` gives that role a global bypass (`src/middlewares/auth.js:76-78`) — a stolen password/token compromises every tenant. This feature adds Google-Authenticator-compatible TOTP for the super-admin: enrol from the console, verify at login via a short-lived challenge, and (behind a flag) require it for every `/admin` request. ADR-024 Phase 5.1, scoped to 2FA (separate login = registered debt).

## Mandatory reading
- `src/modules/auth/authController.js` — `login` (`:239-368`), `generateAccessToken`/`generateRefreshToken` (top of file), `getSuperadminMockTenant` (`:67-76`), the refresh flow (`:374+`)
- `src/models/User.js` — security fields (`:176-194`), `toSafeObject` (`:282`), lockout methods (`:245-277`)
- `src/modules/admin/adminRoutes.js` + `src/modules/admin/adminMutation.js` (mutations MUST go through the factory)
- `src/middlewares/rateLimiter.js` (`loginLimiter`)
- otplib docs via context7 (current major, **functional async API**: `generateSecret()`, `await generate({secret})`, `await verify({secret, token, epochTolerance})` → `{ valid }`, `generateURI({issuer, label, secret})`)

## Component Overview
- **New dependency (backend):** `otplib` (latest). **New dependency (frontend):** `qrcode.react` (QR render from the otpauth URI; no external requests).
- `src/models/User.js` — new `twoFactor` subdocument.
- `src/modules/admin/adminController.js` + `adminRoutes.js` — `/admin/2fa/setup`, `/admin/2fa/activate`, `/admin/2fa/disable` (all via `adminMutation`) + `require2FA` middleware.
- `src/modules/auth/authController.js` + auth routes — challenge step: login returns `requires2FA`, new public `POST /api/auth/login/2fa`.
- Frontend: `Login.jsx` (challenge step), new `src/pages/admin/SecurityPage.tsx` (enrolment), `ConsoleChrome.tsx` (nav + warning banner).
- New env var: `SUPERADMIN_REQUIRE_2FA` (`'true'` enables enforcement; default off for safe rollout).

## Scope
**Included:** TOTP enrol/activate/disable, two-step login, `mfa` JWT claim, `/admin` enforcement behind the flag, frontend flows.
**Out of scope:** 2FA for tenant roles (future), recovery codes (single operator — recovery is a documented manual DB procedure), WebAuthn, separate login surface, encrypting the TOTP secret at rest (see Decisions).

## Data Model
`User.twoFactor` (shared `laura-saas` DB; meaningful only for `role === 'superadmin'`):
```javascript
twoFactor: {
  enabled:   { type: Boolean, default: false },
  secret:    { type: String, select: false },   // Base32; NEVER in responses, logs or audit entries
  confirmedAt: Date
}
```
- Add `delete obj.twoFactor` to `toSafeObject()` (`User.js:282`) — the client learns `enabled` via a dedicated field, not the raw subdocument: include `twoFactorEnabled: !!this.twoFactor?.enabled` in the safe object instead.

## Backend flows

### Enrolment (authenticated superadmin, under the admin gates)
Route order matters — declare the 2FA routes **before** `router.use(require2FA)` so an un-enrolled superadmin can still enrol when enforcement is on (Express applies `router.use` only to routes declared after it):
```
router.use(adminLimiter)                      // F13
router.use(authenticate, requireSuperadmin)
router.use(auditMiddleware)
// 2FA self-service (reachable without 2FA, by design):
POST /2fa/setup     validate(none)            adminMutation('superadmin.2fa.setup', setup2FA)
POST /2fa/activate  validate(activate2FASchema) adminMutation('superadmin.2fa.activate', activate2FA)
POST /2fa/disable   validate(activate2FASchema) adminMutation('superadmin.2fa.disable', disable2FA)
router.use(require2FA)                        // enforcement — everything below requires 2FA when flag on
... all existing routes ...
```
- `setup2FA`: `generateSecret()` → store in `twoFactor.secret` (enabled stays false) → return `{ otpauthUri, secret }` where `otpauthUri = generateURI({ issuer: 'Marcai Admin', label: req.user.email, secret })`. Re-running setup before activation replaces the secret (idempotent enrolment).
- `activate2FA` (`{ token }`, 6 digits): load secret with `.select('+twoFactor.secret')`, `await verify({ secret, token, epochTolerance: 30 })`; `valid` → `enabled: true, confirmedAt: now`. Invalid → 400 `'Código inválido'` (transaction rolls back; `status:'error'` audit).
- `disable2FA` (`{ token }`): requires a **currently valid** TOTP code; clears the subdocument.
- **Audit hygiene (critical):** the `before/after` diff and `metadata` for all three actions must contain only `{ enabled }`-level facts — never `secret` or `otpauthUri`. Assert in tests.

### Login challenge (public surface)
- In `login`, after the password/lock/active checks pass and **only** for `role === 'superadmin'` with `twoFactor.enabled`:
  - Do **not** issue tokens. Return `200 { success: true, data: { requires2FA: true, challengeToken } }`.
  - `challengeToken` = JWT signed with `JWT_SECRET`, payload `{ sub: user._id, scope: '2fa-challenge' }`, `expiresIn: '5m'`.
- New route `POST /api/auth/login/2fa` (public, behind `loginLimiter`), body `{ challengeToken, token }`:
  - Verify JWT and `scope === '2fa-challenge'` (reject any other token type — an access token must not pass) → load user with `+twoFactor.secret +passwordHash`-free select.
  - `verify({ secret, token, epochTolerance: 30 })`: invalid → `401 'Código inválido'` **and** `user.incLoginAttempts()` (the 5-tries → 423 lockout applies to the 2FA step too).
  - Valid → `resetLoginAttempts()` and issue the session exactly as `login` does today. **Refactor** the token-issuance block (`authController.js:322-359` — reset attempts, generate tokens, push refresh token `$slice:-5`, response shape) into a shared `issueSession(user, tenant, req, res)` helper used by both `login` and `login/2fa`, so the two paths cannot drift.
- **`mfa` claim:** `generateAccessToken(user, tenant, { mfa })` adds `mfa: true` when the session passed the 2FA step. The **refresh flow must propagate it**: locate where refresh builds the new access token and carry the claim from the old token's payload (a refreshed session keeps its authentication strength).
- Zod: extend the auth schemas file (wherever `login` body is validated) with `login2FASchema = { challengeToken: string, token: string 6 digits }`.

### Enforcement — `require2FA` middleware (new file `src/modules/admin/require2FA.js`)
- No-op unless `process.env.SUPERADMIN_REQUIRE_2FA === 'true'`.
- Reads the fresh user (`User.findById(req.user._id).select('twoFactor.enabled')` — one small control-plane read per admin request; acceptable for a single operator, and always fresh):
  - `enabled === false` → `403 { success:false, error: '2FA obrigatório. Configure em Segurança antes de usar o painel.' }` (403 is safe here: the caller already proved they are superadmin — nothing new is revealed).
  - `enabled === true` and the JWT lacks `mfa: true` → `401 { success:false, error: 'Sessão sem 2FA. Volte a iniciar sessão.' }` (forces re-login through the challenge; kills stale pre-2FA tokens).

## Frontend flows
- **`Login.jsx`** (existing `.jsx` — do not convert): when the login response has `data.requires2FA`, keep the credentials screen state and render a 6-digit code input (design system: glass card, gradient button); submit to `/auth/login/2fa` with the stored `challengeToken`; on success continue the existing post-login path (AuthContext receives the same response shape). Expired challenge (401 with expired token) → message + back to password step.
- **`SecurityPage.tsx`** (new, route `/admin/security` inside `AdminLayout`): shows 2FA state; "Activar" → calls setup, renders the QR (`qrcode.react` on `otpauthUri`) + the Base32 secret for manual entry, then a code input → activate → success toast + **force re-login** (the current token lacks `mfa`; call the existing logout so the operator signs back in through the challenge). "Desactivar" → code input + `ConfirmDialog` danger (reuse `SuspendReactivateControls`' dialog pattern).
- **`ConsoleChrome.tsx`**: add "Segurança" nav item; when enforcement flag is on and the API answers 403 with the configure-2FA error, surface a banner linking to `/admin/security`.
- All calls via `apiHelpers`; no double-toasting (interceptor handles errors).

## API Contracts
- `POST /api/v1/admin/2fa/setup` → `200 { success, data: { otpauthUri, secret } }`
- `POST /api/v1/admin/2fa/activate` `{ token }` → `200 { success, data: { enabled: true } }` · invalid code → 400
- `POST /api/v1/admin/2fa/disable` `{ token }` → `200 { success, data: { enabled: false } }`
- `POST /api/auth/login` (superadmin with 2FA) → `200 { success, data: { requires2FA: true, challengeToken } }`
- `POST /api/auth/login/2fa` `{ challengeToken, token }` → `200` with the standard login payload · `401` bad/expired challenge or bad code · `423` locked
- Enforcement: any `/admin/*` (except `/2fa/*`) → `403` un-enrolled / `401` session without `mfa`, only when `SUPERADMIN_REQUIRE_2FA=true`

## Error Handling
- TOTP secrets never in responses (except the one-time setup payload), never in audit entries, never in logs.
- Challenge token single-purpose: `scope` checked; an access/refresh token in its place → 401.
- Lockout parity: failed 2FA attempts count exactly like failed passwords.

## Testing Strategy
`tests/admin-2fa.test.js` (+ extend `tests/auth-superadmin.test.js`). Mock nothing crypto-related — otplib runs fine in Jest; generate valid codes in tests with `await generate({ secret })`.
1. Enrolment: setup returns URI+secret; secret absent from the API response of any other route, from `AuditLog` entries (`JSON.stringify` scan), and from `toSafeObject()`.
2. Activate with valid code → enabled; with invalid → 400 + rollback (enabled still false) + `status:'error'` audit.
3. Login: superadmin with 2FA → `requires2FA` + no tokens in the response; challenge + valid code → full session; wrong code ×5 → 423; expired challenge → 401; a normal access token used as challenge → 401.
4. Claim: token issued via challenge contains `mfa:true`; refresh preserves it.
5. Enforcement matrix (flag on): un-enrolled → 403 on `/admin/tenants`, 200 on `/admin/2fa/setup`; enrolled + tokenless-mfa → 401; enrolled + mfa token → 200. Flag off → everything passes as today.
6. Non-superadmin sweep still 404 on all routes including `/2fa/*` (sweep test covers them automatically).
7. Tenant-role login is untouched (regression: normal login never returns `requires2FA`).

## Assumptions / Decisions
- **[Key]** Enforcement behind `SUPERADMIN_REQUIRE_2FA` for safe rollout: deploy → André enrols → flip the flag in the VPS env → from then on password alone is useless. Document the flag in `.env.example` if present.
- **[Key]** TOTP secret stored `select:false` but NOT encrypted at rest: the threat model is a stolen password/token, not DB exfiltration (which already yields every tenant's data — the secret adds nothing for that attacker). Revisit alongside the audit-immutability debt.
- **[Auto-Accept]** No recovery codes: single operator with DB access; recovery = unset `twoFactor` via a maintenance script (document one line in the module docblock).
- **[Auto-Accept]** 2FA routes live under `/admin` (not `/auth`) to inherit the four gates and auditing for free; the login challenge endpoint lives under `/auth` because it runs pre-session.
