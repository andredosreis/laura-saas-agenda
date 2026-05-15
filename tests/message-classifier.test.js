/**
 * Unit tests for messageClassifier — F12 §4.1 + §7.1
 *
 * Pure-function tests: no DB, no harness, no async. Fast feedback loop
 * for keyword list tuning. The 10 first tests mirror the spec §7.1
 * matrix exactly; the last 3 are defensive guards that protect against
 * regressions in normalization and type-handling.
 */

import {
  classify,
  PALAVRAS_SIM,
  PALAVRAS_NAO,
} from '../src/modules/messaging/routing/messageClassifier.js';

describe('messageClassifier (F12 §4.1)', () => {
  // ─── Spec §7.1 — 10 canonical cases ───────────────────────────────

  test('accepts simple "sim"', () => {
    const r = classify('sim');
    expect(r.kind).toBe('confirmation_yes');
    expect(r.matched).toBe('sim');
  });

  test('accepts capitalized + accented "Não"', () => {
    const r = classify('Não');
    expect(r.kind).toBe('confirmation_no');
    expect(r.matched).toBe('nao');
  });

  test('accepts startsWith pattern "sim, pode ser"', () => {
    const r = classify('sim, pode ser');
    expect(r.kind).toBe('confirmation_yes');
    expect(r.matched).toBe('sim');
  });

  test('treats "simbolo" (false-positive root) as free-text', () => {
    const r = classify('simbolo');
    expect(r.kind).toBe('free_text');
    expect(r.matched).toBeUndefined();
  });

  test('accepts "OK" as confirmation', () => {
    const r = classify('OK');
    expect(r.kind).toBe('confirmation_yes');
    expect(r.matched).toBe('ok');
  });

  test('treats unrelated free-text as free_text', () => {
    const r = classify('quero marcar para terça');
    expect(r.kind).toBe('free_text');
    expect(r.matched).toBeUndefined();
  });

  test('handles empty string', () => {
    const r = classify('');
    expect(r.kind).toBe('free_text');
    expect(r.normalized).toBe('');
  });

  test('strips accents and lowercases ("NÃO POSSO")', () => {
    const r = classify('NÃO POSSO');
    expect(r.kind).toBe('confirmation_no');
    expect(r.matched).toBe('nao posso');
  });

  test('"cancelar" matches NÃO', () => {
    const r = classify('cancelar');
    expect(r.kind).toBe('confirmation_no');
    expect(r.matched).toBe('cancelar');
  });

  test('"1" matches SIM (legacy numeric option)', () => {
    const r = classify('1');
    expect(r.kind).toBe('confirmation_yes');
    expect(r.matched).toBe('1');
  });

  // ─── Defensive guards (not in spec §7.1 but protect against regressions) ───

  test('preserves original and normalized fields verbatim', () => {
    const r = classify('  Sim, claro  ');
    expect(r.original).toBe('  Sim, claro  ');
    expect(r.normalized).toBe('sim, claro');
    expect(r.kind).toBe('confirmation_yes');
  });

  test('handles non-string input gracefully (undefined/null/number)', () => {
    expect(classify(undefined).kind).toBe('free_text');
    expect(classify(undefined).normalized).toBe('');
    expect(classify(null).kind).toBe('free_text');
    expect(classify(123).kind).toBe('free_text');
    expect(classify({}).kind).toBe('free_text');
  });

  test('keyword lists are frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(PALAVRAS_SIM)).toBe(true);
    expect(Object.isFrozen(PALAVRAS_NAO)).toBe(true);
    // Defensive: attempting to push silently no-ops or throws in strict mode
    expect(() => { PALAVRAS_SIM.push('hack'); }).toThrow();
  });

  // ─── Order invariant: SIM evaluated before NÃO ───────────────────

  test('SIM keywords win over NÃO when both could theoretically match', () => {
    // No real keyword from PALAVRAS_SIM is a prefix of one in PALAVRAS_NAO
    // or vice-versa today, but if that changes the order rule keeps "sim"
    // from being misclassified. Sanity-check with a synthetic two-keyword
    // overlap: "ok" (SIM) before "n" (NÃO) — even though "ok n" is unusual.
    const r = classify('ok n não');
    expect(r.kind).toBe('confirmation_yes');
    expect(r.matched).toBe('ok');
  });
});
