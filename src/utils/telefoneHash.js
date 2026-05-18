/**
 * telefoneHash — PII-safe phone correlation key for structured logs.
 *
 * Returns the first 8 hex chars of SHA-256(phone). Used by the messaging
 * webhook controller to correlate log lines for the same phone without
 * leaking raw numbers into observability stores.
 *
 * Collision rate ~1 in 4 billion at 8 hex chars — acceptable for pilot
 * volumes. Reverse lookup is computationally infeasible (whole phone
 * space hashing is a one-shot — but anyone with the phone can also hash
 * it themselves, which is the point: correlation, not secrecy).
 *
 * UPGRADE PATH (out of scope for v1): when operators need authoritative
 * reverse lookup for debugging, switch to HMAC-SHA256 keyed by a
 * tenant-scoped secret (not a global secret) so reverse-lookup capability
 * is scoped to the tenant's authorised operators. Keys rotate annually
 * and live in the tenant document or a sealed KMS. See spec §4.3.
 */

import crypto from 'crypto';

/**
 * @param {unknown} phone
 * @returns {string|null}  8 hex chars or null for empty/invalid input
 */
export function telefoneHash(phone) {
  if (typeof phone !== 'string' || phone.length === 0) return null;
  return crypto.createHash('sha256').update(phone).digest('hex').slice(0, 8);
}
