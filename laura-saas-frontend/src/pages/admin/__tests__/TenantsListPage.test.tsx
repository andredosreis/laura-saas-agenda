import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../hooks/useAdminTenants', () => ({ useAdminTenants: vi.fn() }));
vi.mock('../../../components/admin/CreateTenantForm', () => ({ CreateTenantForm: () => null }));

import { useAdminTenants } from '../../../hooks/useAdminTenants';
import TenantsListPage from '../TenantsListPage';

const mk = (status: string, tipo: string, i: number) => ({
  _id: String(i), nome: 'T' + i, slug: 't' + i,
  plano: { status, tipo }, createdAt: '2026-01-01',
});

describe('TenantsListPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderiza o strip de overview e a tabela a partir do hook', () => {
    (useAdminTenants as any).mockReturnValue({
      tenants: [mk('trial', 'pro', 1)], total: 1, loading: false, error: null, refetch: vi.fn(),
    });
    render(<MemoryRouter><TenantsListPage /></MemoryRouter>);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Em Trial')).toBeInTheDocument();
    expect(screen.getByText('Distribuição por plano')).toBeInTheDocument();
    expect(screen.getByText('t1')).toBeInTheDocument(); // slug (único; o nome colidiria com as iniciais do Avatar)
  });

  it('mostra aviso de cap quando total > tenants carregados', () => {
    (useAdminTenants as any).mockReturnValue({
      tenants: [mk('ativo', 'pro', 1)], total: 150, loading: false, error: null, refetch: vi.fn(),
    });
    render(<MemoryRouter><TenantsListPage /></MemoryRouter>);
    expect(screen.getByText(/de 150 tenants/)).toBeInTheDocument();
  });
});
