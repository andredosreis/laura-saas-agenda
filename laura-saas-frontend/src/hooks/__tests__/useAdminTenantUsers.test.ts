import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../services/api', () => ({ apiHelpers: { get: vi.fn() } }));
vi.mock('react-toastify', () => ({ toast: { error: vi.fn() } }));

import { toast } from 'react-toastify';
import { apiHelpers } from '../../services/api';
import { useAdminTenantUsers } from '../useAdminTenantUsers';

describe('useAdminTenantUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('não chama a API sem tenantId', () => {
    renderHook(() => useAdminTenantUsers(undefined));
    expect(apiHelpers.get).not.toHaveBeenCalled();
  });

  it('busca os utilizadores do tenant com page/limit na query', async () => {
    (apiHelpers.get as any).mockResolvedValue({
      success: true,
      data: [{ _id: 'u1', nome: 'Dono', email: 'dono@a.pt', role: 'admin', ativo: true, emailVerificado: true, createdAt: '2026-01-01T00:00:00.000Z' }],
      pagination: { total: 1, page: 1, pages: 1, limit: 100 },
    });

    const { result } = renderHook(() => useAdminTenantUsers('tenant-1', 1, 100));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiHelpers.get).toHaveBeenCalledWith('/admin/tenants/tenant-1/users?page=1&limit=100');
    expect(result.current.users).toHaveLength(1);
    expect(result.current.users[0].email).toBe('dono@a.pt');
    expect(result.current.pagination).toMatchObject({ total: 1, page: 1 });
    expect(result.current.error).toBeNull();
  });

  it('expõe o erro inline sem emitir um toast duplicado', async () => {
    (apiHelpers.get as any).mockRejectedValue({
      response: { data: { error: 'Tenant não encontrado' } },
    });

    const { result } = renderHook(() => useAdminTenantUsers('tenant-x'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Tenant não encontrado');
    expect(result.current.users).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
