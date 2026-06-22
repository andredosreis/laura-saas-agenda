import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../services/api', () => ({ apiHelpers: { get: vi.fn() } }));
vi.mock('react-toastify', () => ({ toast: { error: vi.fn() } }));

import { apiHelpers } from '../../services/api';
import { useAdminTenants } from '../useAdminTenants';

describe('useAdminTenants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('faz um único fetch com limit=100 e expõe tenants + total', async () => {
    (apiHelpers.get as any).mockResolvedValue({
      success: true,
      data: [{ _id: '1', nome: 'A', slug: 'a', plano: { tipo: 'pro', status: 'ativo' }, createdAt: '2026-01-01' }],
      pagination: { total: 1, page: 1, pages: 1, limit: 100 },
    });

    const { result } = renderHook(() => useAdminTenants());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiHelpers.get).toHaveBeenCalledTimes(1);
    expect(apiHelpers.get).toHaveBeenCalledWith('/v1/admin/tenants?page=1&limit=100');
    expect(result.current.tenants).toHaveLength(1);
    expect(result.current.total).toBe(1);
    expect(result.current.error).toBeNull();
  });
});
