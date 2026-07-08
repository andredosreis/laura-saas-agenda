# F13 — Dedicated Admin Rate Limiting · Spec

Closes the rate-limit half of ADR-024 Guard #4 ("Rate limiting próprio e login separado").

## Mandatory reading
- `src/middlewares/rateLimiter.js` (house limiter style)
- `src/modules/admin/adminRoutes.js` (gate mounting order)
- `.claude/rules/express-middlewares.md`

## Component Overview
- `src/middlewares/rateLimiter.js` — new exported `adminLimiter`.
- `src/modules/admin/adminRoutes.js` — mount `adminLimiter` **first**, before `authenticate`.
- `express-rate-limit` is already installed at **^8.2.1** — v8 API: use `limit` (canonical), not `max`. Existing limiters use the deprecated-but-working `max` alias — **do not refactor them in this PR** (scope discipline).

## Scope
**Included:** one IP-keyed limiter for the whole admin router.
**Out of scope:** separate super-admin login (registered debt), Redis-backed store (in-memory is fine — single backend container per ADR-023), per-user keying.

## Requirements / Business Rules
- `adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, skip: isTestEnv, message: { success: false, error: 'Demasiados pedidos ao painel. Tente novamente em 15 minutos.' }, standardHeaders: true, legacyHeaders: false })`.
  - 300/15min per IP: generous for legitimate console browsing (list + detail + usage + audit ≈ dozens of requests), blocks scraping/brute-force.
  - `skip: isTestEnv` follows the house pattern (`rateLimiter.js:3`) so the suite is unaffected.
- Mount order in `adminRoutes.js`: `router.use(adminLimiter); router.use(authenticate, requireSuperadmin); router.use(auditMiddleware);` — limiting **before** auth throttles unauthenticated probing and bounds audit-log spam from denied attempts.
- IP keying relies on `app.set('trust proxy', 1)` already present in `app.js` (nginx on the VPS). Do not change it.
- Update `.claude/docs/API.md` if it documents admin route behaviour.

## API Contracts
- Any `/api/admin/*` or `/api/v1/admin/*` request beyond 300 in 15 min from one IP → `429 { success: false, error: 'Demasiados pedidos ao painel. Tente novamente em 15 minutos.' }` with `RateLimit-*` headers.

## Data Model
None.

## Error Handling
- 429 body follows the fixed `{ success:false, error }` contract (the `message` object above).

## Testing Strategy
- `tests/admin-rate-limit.test.js`, standard memory-server harness.
- Tests:
  1. With `NODE_ENV` overridden to non-test **for the limiter only** (instantiate `adminLimiter`'s factory with a tiny `limit` via a test-local `rateLimit({ windowMs, limit: 2, ... })` mirror **or** temporarily set `process.env.NODE_ENV='production'` around app import — pick the approach that does NOT weaken `skip: isTestEnv` in production code): 3rd request within the window → 429 with the contract body.
  2. Assert mount order: the 429 fires **without** a token (unauthenticated request also limited).
  3. Sweep test still passes (`admin-superadmin-sweep.test.js` — no changes needed).

## Assumptions / Decisions
- **[Key]** In-memory store is acceptable: production runs one backend container (ADR-023). If the backend is ever horizontally scaled, add `rate-limit-redis` backed by the existing Redis — note this in the code comment.
- **[Auto-Accept]** One limiter for reads and writes; mutations are additionally protected by JWT + `requireSuperadmin`, and 300/15min already bounds abuse.
