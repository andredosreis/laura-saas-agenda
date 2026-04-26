import { describe, it, expect } from 'vitest';

/**
 * Smoke test — valida que Vitest + Vite + jsdom + RTL setup está funcional.
 * Não testa nada de produção; é o equivalente a "Hello World" para o test runner.
 * Se este passar, qualquer teste futuro tem ambiente correcto.
 */
describe('Test infrastructure smoke', () => {
  it('Vitest está a executar', () => {
    expect(1 + 1).toBe(2);
  });

  it('jsdom expõe document', () => {
    expect(document).toBeDefined();
    expect(document.body).toBeDefined();
  });

  it('window.matchMedia mock funciona (necessário para alguns components)', () => {
    expect(window.matchMedia('(prefers-color-scheme: dark)')).toEqual(
      expect.objectContaining({ matches: false })
    );
  });

  it('IntersectionObserver mock funciona', () => {
    expect(typeof IntersectionObserver).toBe('function');
    const obs = new IntersectionObserver(() => {});
    expect(typeof obs.observe).toBe('function');
  });

  it('ResizeObserver mock funciona', () => {
    expect(typeof ResizeObserver).toBe('function');
    const obs = new ResizeObserver(() => {});
    expect(typeof obs.observe).toBe('function');
  });
});
