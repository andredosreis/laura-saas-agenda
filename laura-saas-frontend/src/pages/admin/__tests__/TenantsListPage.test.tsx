import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../hooks/useAdminTenants', () => ({
  useAdminTenants: vi.fn(),
  useAdminTenantStats: vi.fn(),
}));
vi.mock('../../../components/admin/CreateTenantForm', () => ({ CreateTenantForm: () => null }));

import { useAdminTenants, useAdminTenantStats } from '../../../hooks/useAdminTenants';
import TenantsListPage from '../TenantsListPage';

const mk = (status: string, tipo: string, i: number) => ({
  _id: String(i), nome: 'T' + i, slug: 't' + i,
  plano: { status, tipo }, createdAt: '2026-01-01',
});

const mockTenants = (overrides: Record<string, unknown> = {}) => {
  (useAdminTenants as any).mockReturnValue({
    tenants: [mk('trial', 'pro', 1)],
    pagination: { total: 1, page: 1, pages: 1, limit: 20 },
    loading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
};

const mockStats = (overrides: Record<string, unknown> = {}) => {
  (useAdminTenantStats as any).mockReturnValue({
    stats: {
      total: 42,
      porStatus: { trial: 11, ativo: 22, suspenso: 3, cancelado: 1, expirado: 2 },
      porTipo: { basico: 6, pro: 7, elite: 8, custom: 9 },
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
};

describe('TenantsListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenants();
    mockStats();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renderiza o strip de overview, a distribuição por plano e a tabela', () => {
    render(<MemoryRouter><TenantsListPage /></MemoryRouter>);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Em Trial')).toBeInTheDocument();
    expect(screen.getByText('Distribuição por plano')).toBeInTheDocument();
    expect(screen.getByText('t1')).toBeInTheDocument(); // slug (único; o nome colidiria com as iniciais do Avatar)
  });

  it('os KPIs vêm do endpoint de stats, não da página de tenants carregada', () => {
    // stats.total (42) é muito maior que tenants.length (1) — se os KPIs ainda
    // fossem derivados client-side de `tenants`, este teste apanhava-o.
    render(<MemoryRouter><TenantsListPage /></MemoryRouter>);
    expect(screen.getByText('42')).toBeInTheDocument(); // Total
    expect(screen.getByText('11')).toBeInTheDocument(); // Em Trial
    expect(screen.getByText('22')).toBeInTheDocument(); // Activos
    expect(screen.getByText('5')).toBeInTheDocument(); // Suspensos = suspenso(3) + expirado(2)
  });

  it('não mostra o antigo aviso de tecto de 100 tenants', () => {
    mockTenants({ pagination: { total: 250, page: 1, pages: 13, limit: 20 } });
    render(<MemoryRouter><TenantsListPage /></MemoryRouter>);
    expect(screen.queryByText(/limitados a 100/)).not.toBeInTheDocument();
  });

  it('debounce de 300ms na pesquisa: só chama o hook com `search` depois da janela, e repõe page=1', () => {
    vi.useFakeTimers();
    render(<MemoryRouter><TenantsListPage /></MemoryRouter>);

    const input = screen.getByPlaceholderText('Pesquisar por nome ou slug...');
    fireEvent.change(input, { target: { value: 'salao' } });

    // Ainda dentro da janela de debounce — a última chamada ao hook não tem `search`.
    let lastCall = (useAdminTenants as any).mock.calls.at(-1);
    expect(lastCall[2].search).toBeUndefined();

    act(() => { vi.advanceTimersByTime(299); });
    lastCall = (useAdminTenants as any).mock.calls.at(-1);
    expect(lastCall[2].search).toBeUndefined();

    act(() => { vi.advanceTimersByTime(1); });
    lastCall = (useAdminTenants as any).mock.calls.at(-1);
    expect(lastCall[2].search).toBe('salao');
    expect(lastCall[0]).toBe(1); // page reposto a 1
  });

  it('reset a page=1 ao mudar o filtro de estado, mesmo depois de avançar de página', () => {
    mockTenants({ pagination: { total: 45, page: 1, pages: 3, limit: 20 } });
    render(<MemoryRouter><TenantsListPage /></MemoryRouter>);

    fireEvent.click(screen.getByText('Seguinte'));
    let lastCall = (useAdminTenants as any).mock.calls.at(-1);
    expect(lastCall[0]).toBe(2); // avançou para a página 2

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'ativo' } });
    lastCall = (useAdminTenants as any).mock.calls.at(-1);
    expect(lastCall[0]).toBe(1); // reposto a 1
    expect(lastCall[2].status).toBe('ativo');
  });

  it('o filtro de plano aplica-se de imediato (sem debounce) e repõe page=1', () => {
    render(<MemoryRouter><TenantsListPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Filtrar por plano'), { target: { value: 'elite' } });
    const lastCall = (useAdminTenants as any).mock.calls.at(-1);
    expect(lastCall[2].plano).toBe('elite');
    expect(lastCall[0]).toBe(1);
  });

  it('paginação usa o shape do servidor (pagination.page/pages/total)', () => {
    mockTenants({ pagination: { total: 45, page: 2, pages: 3, limit: 20 } });
    render(<MemoryRouter><TenantsListPage /></MemoryRouter>);
    expect(screen.getByText('Página 2 de 3 · 45 tenants')).toBeInTheDocument();
  });
});
