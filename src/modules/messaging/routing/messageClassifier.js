/**
 * messageClassifier — pure classifier for inbound WhatsApp messages.
 *
 * Part of F12 (IA↔Legacy Handoff Coordinator). The classifier maps raw
 * inbound text to one of three categories so the router (Phase 3) can
 * decide which handler processes it:
 *
 *   - confirmation_yes — text matches a SIM/affirmative pattern
 *   - confirmation_no  — text matches a NÃO/negative pattern
 *   - free_text        — anything else (default)
 *
 * Pure function — no I/O, no side effects, fully testable in isolation.
 *
 * The keyword lists (PALAVRAS_SIM, PALAVRAS_NAO) below were originally
 * inlined inside `src/modules/ia/webhookController.js` (lines 169-191 of
 * the pre-F12 version). Phase 5 will replace the inline lists with a call
 * to `classify()` once `webhookController.js` is relocated to
 * `src/modules/messaging/controllers/` and the cross-module import is
 * permitted by the ADR-022 boundary.
 *
 * Normalization: input is lowercased, NFD-stripped of combining diacritics
 * (so "Não" matches "nao"), and trimmed. Matching is order-sensitive: SIM
 * patterns are evaluated first, then NÃO. A message that hypothetically
 * matches both lists resolves to confirmation_yes — documented in tests.
 *
 * @see docs/F12-ia-legacy-handoff-coordinator/spec.md §4.1
 */

/**
 * Words and phrases that indicate an affirmative confirmation.
 * Frozen to prevent runtime mutation.
 * @type {readonly string[]}
 */
export const PALAVRAS_SIM = Object.freeze([
  'sim', 's',
  'confirmo', 'confirmar', 'confirma', 'confirmado',
  'ok', 'okay',
  'certo', 'correto', 'exato', 'exatamente',
  'claro', 'com certeza', 'certeza',
  'perfeito', 'combinado',
  'pode', 'pode ser',
  'beleza', 'boa',
  'ta bom', 'ta bem', 'tudo bem', 'tudo certo',
  'yes', '1',
]);

/**
 * Words and phrases that indicate a negative response.
 * Frozen to prevent runtime mutation.
 * @type {readonly string[]}
 */
export const PALAVRAS_NAO = Object.freeze([
  'nao', 'n',
  'cancelar', 'cancela', 'cancel', 'cancelado',
  'desmarcar', 'desmarco', 'desmarque',
  'nao posso', 'nao consigo', 'nao vou',
  'nao quero',
  'desistir', 'desisto',
  'remover',
  'nope', 'no',
  '2',
]);

/**
 * Normalize a raw inbound text: lowercase + NFD strip diacritics + trim.
 * Non-string input returns an empty string (defensive).
 *
 * @param {unknown} raw
 * @returns {string}
 */
function normalize(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Pre-sort keyword lists by length DESC so that more specific multi-word
// phrases (e.g. "nao posso") match before their shorter prefixes (e.g. "nao").
// Sort happens once at module load — runtime classify() pays no sort cost.
const PALAVRAS_SIM_SORTED = Object.freeze(
  [...PALAVRAS_SIM].sort((a, b) => b.length - a.length),
);
const PALAVRAS_NAO_SORTED = Object.freeze(
  [...PALAVRAS_NAO].sort((a, b) => b.length - a.length),
);

/**
 * Match a normalized text against a keyword list.
 *
 * A match requires either:
 *   (a) full equality (text === keyword), or
 *   (b) the keyword appears at the start AND the character right after it
 *       is a word boundary (any non-alphanumeric: space, comma, period,
 *       exclamation, question mark, etc.). This prevents single-word roots
 *       like "sim" from matching "simbolo" (next char is "b", alphanumeric)
 *       while still capturing "sim, pode ser", "sim! claro", "sim. ok".
 *
 * The keyword list is iterated in length-DESC order so longer specific
 * phrases (e.g. "nao posso") match before their shorter prefixes ("nao").
 *
 * @param {string} normalized
 * @param {readonly string[]} keywordsSorted  must be pre-sorted by length DESC
 * @returns {string | null} the matched keyword, or null
 */
function findMatch(normalized, keywordsSorted) {
  if (!normalized) return null;
  for (const keyword of keywordsSorted) {
    if (normalized === keyword) return keyword;
    if (normalized.startsWith(keyword)) {
      const afterChar = normalized[keyword.length];
      // Word boundary: undefined (end-of-string was handled by === above)
      // or any non-alphanumeric character.
      if (afterChar !== undefined && !/[a-z0-9]/.test(afterChar)) {
        return keyword;
      }
    }
  }
  return null;
}

/**
 * @typedef {object} ClassifiedMessage
 * @property {'confirmation_yes' | 'confirmation_no' | 'free_text'} kind
 * @property {string} original    the raw input as received
 * @property {string} normalized  the lowercased + NFD-stripped + trimmed form
 * @property {string} [matched]   present only when kind is a confirmation — the keyword that fired
 */

/**
 * Classify a raw inbound WhatsApp message.
 *
 * @param {unknown} rawText
 * @returns {ClassifiedMessage}
 */
export function classify(rawText) {
  const original = typeof rawText === 'string' ? rawText : '';
  const normalized = normalize(original);

  // SIM evaluated first, by design (see file-level docstring).
  const simMatch = findMatch(normalized, PALAVRAS_SIM_SORTED);
  if (simMatch !== null) {
    return { kind: 'confirmation_yes', original, normalized, matched: simMatch };
  }

  const naoMatch = findMatch(normalized, PALAVRAS_NAO_SORTED);
  if (naoMatch !== null) {
    return { kind: 'confirmation_no', original, normalized, matched: naoMatch };
  }

  return { kind: 'free_text', original, normalized };
}
