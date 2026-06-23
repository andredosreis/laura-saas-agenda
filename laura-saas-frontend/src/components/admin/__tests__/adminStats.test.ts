import { describe, it, expect } from 'vitest';
import { computeTenantStats } from '../adminStats';
import { PlanoStatus, PlanoTipo, TenantSummary } from '../../../types/admin';

const mk = (status: PlanoStatus, tipo: PlanoTipo, i: number): TenantSummary => ({
  _id: String(i), nome: 'T' + i, slug: 't' + i,
  plano: { status, tipo }, createdAt: '2026-01-01',
});

describe('computeTenantStats', () => {
  it('conta estados e distribuição por plano', () => {
    const r = computeTenantStats([
      mk('trial', 'basico', 1), mk('ativo', 'pro', 2), mk('ativo', 'pro', 3),
      mk('suspenso', 'elite', 4), mk('cancelado', 'custom', 5),
    ]);
    expect(r.trial).toBe(1);
    expect(r.ativos).toBe(2);
    expect(r.suspensos).toBe(1);
    expect(r.distribution).toEqual({ basico: 1, pro: 2, elite: 1, custom: 1 });
  });

  it('dobra "expirado" em suspensos; "cancelado" só conta no total/distribuição', () => {
    const r = computeTenantStats([
      mk('suspenso', 'pro', 1), mk('expirado', 'pro', 2), mk('cancelado', 'basico', 3),
    ]);
    expect(r.suspensos).toBe(2); // suspenso + expirado
    expect(r.trial).toBe(0);
    expect(r.ativos).toBe(0);
    expect(r.distribution).toEqual({ basico: 1, pro: 2, elite: 0, custom: 0 });
  });

  it('devolve zeros para lista vazia', () => {
    expect(computeTenantStats([])).toEqual({
      trial: 0, ativos: 0, suspensos: 0,
      distribution: { basico: 0, pro: 0, elite: 0, custom: 0 },
    });
  });
});
