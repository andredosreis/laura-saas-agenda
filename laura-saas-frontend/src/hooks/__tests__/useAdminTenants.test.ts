import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../services/api', () => ({ apiHelpers: { get: vi.fn() } }));
vi.mock('react-toastify', () => ({ toast: { error: vi.fn() } }));

import { apiHelpers } from '../../services/api';
import { useAdminTenants, useAdminTenantStats } from '../useAdminTenants';

describe('useAdminTenants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('constrói a query string com page/limit e os filtros preenchidos', async () => {
    (apiHelpers.get as any).mockResolvedValue({
      success: true,
      data: [{ _id: '1', nome: 'A', slug: 'a', plano: { tipo: 'pro', status: 'ativo' }, createdAt: '2026-01-01' }],
      pagination: { total: 1, page: 2, pages: 1, limit: 20 },
    });

    const { result } = renderHook(() =>
      useAdminTenants(2, 20, { search: 'sal', plano: 'pro', status: 'ativo' })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiHelpers.get).toHaveBeenCalledTimes(1);
    expect(apiHelpers.get).toHaveBeenCalledWith('/admin/tenants?page=2&limit=20&search=sal&plano=pro&status=ativo');
    expect(result.current.tenants).toHaveLength(1);
    expect(result.current.pagination).toEqual({ total: 1, page: 2, pages: 1, limit: 20 });
    expect(result.current.error).toBeNull();
  });

  it('omite filtros vazios da query string (só page/limit)', async () => {
    (apiHelpers.get as any).mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, page: 1, pages: 1, limit: 20 },
    });

    renderHook(() => useAdminTenants());
    await waitFor(() => expect(apiHelpers.get).toHaveBeenCalled());

    expect(apiHelpers.get).toHaveBeenCalledWith('/admin/tenants?page=1&limit=20');
  });

  it('refetch repete o pedido com os mesmos parâmetros', async () => {
    (apiHelpers.get as any).mockResolvedValue({
      success: true, data: [], pagination: { total: 0, page: 1, pages: 1, limit: 20 },
    });
    const { result } = renderHook(() => useAdminTenants(1, 20, { plano: 'elite' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.refetch();

    expect(apiHelpers.get).toHaveBeenCalledTimes(2);
    expect(apiHelpers.get).toHaveBeenLastCalledWith('/admin/tenants?page=1&limit=20&plano=elite');
  });

  it('expõe o erro inline sem lançar', async () => {
    (apiHelpers.get as any).mockRejectedValue({ response: { data: { error: 'Tenants indisponíveis' } } });

    const { result } = renderHook(() => useAdminTenants());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Tenants indisponíveis');
    expect(result.current.tenants).toEqual([]);
  });

  it('ignora respostas obsoletas: A (lenta) resolve depois de B, o estado final é o de B', async () => {
    // Duas pesquisas em voo. A é disparada primeiro mas resolve por último
    // (rede mais lenta). Sem a guarda de sequência, o setData de A sobreporia
    // os resultados de B e o operador via a lista errada.
    let resolveA!: (value: unknown) => void;
    let resolveB!: (value: unknown) => void;
    const promiseA = new Promise((resolve) => { resolveA = resolve; });
    const promiseB = new Promise((resolve) => { resolveB = resolve; });

    (apiHelpers.get as any)
      .mockReturnValueOnce(promiseA) // 1º fetch — filters.search === 'a'
      .mockReturnValueOnce(promiseB); // 2º fetch — filters.search === 'b'

    const respostaA = {
      success: true,
      data: [{ _id: 'A', nome: 'Antiga', slug: 'a', plano: { tipo: 'pro', status: 'ativo' }, createdAt: '2026-01-01' }],
      pagination: { total: 99, page: 1, pages: 5, limit: 20 },
    };
    const respostaB = {
      success: true,
      data: [{ _id: 'B', nome: 'Nova', slug: 'b', plano: { tipo: 'elite', status: 'trial' }, createdAt: '2026-01-02' }],
      pagination: { total: 1, page: 1, pages: 1, limit: 20 },
    };

    const { result, rerender } = renderHook(
      ({ filters }) => useAdminTenants(1, 20, filters),
      { initialProps: { filters: { search: 'a' } as any } }
    );

    // Muda a pesquisa para 'b' → dispara o 2º fetch enquanto A ainda está pendente.
    rerender({ filters: { search: 'b' } });

    // B (rápida) resolve primeiro, A (lenta) depois — ordem invertida da emissão.
    await act(async () => { resolveB(respostaB); });
    await act(async () => { resolveA(respostaA); });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // O estado final tem de ser o de B, não o de A que chegou atrasada.
    expect(result.current.tenants).toEqual(respostaB.data);
    expect(result.current.pagination).toEqual(respostaB.pagination);
  });
});

describe('useAdminTenantStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('faz fetch a /admin/tenants/stats e expõe os totais do servidor', async () => {
    (apiHelpers.get as any).mockResolvedValue({
      success: true,
      data: {
        total: 5,
        porStatus: { trial: 1, ativo: 2, suspenso: 1, cancelado: 1, expirado: 0 },
        porTipo: { basico: 1, pro: 2, elite: 1, custom: 1 },
      },
    });

    const { result } = renderHook(() => useAdminTenantStats());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiHelpers.get).toHaveBeenCalledWith('/admin/tenants/stats');
    expect(result.current.stats).toEqual({
      total: 5,
      porStatus: { trial: 1, ativo: 2, suspenso: 1, cancelado: 1, expirado: 0 },
      porTipo: { basico: 1, pro: 2, elite: 1, custom: 1 },
    });
    expect(result.current.error).toBeNull();
  });

  it('expõe o erro inline sem emitir um toast duplicado', async () => {
    (apiHelpers.get as any).mockRejectedValue({ response: { data: { error: 'Stats indisponíveis' } } });

    const { result } = renderHook(() => useAdminTenantStats());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Stats indisponíveis');
    expect(result.current.stats).toBeNull();
  });
});
