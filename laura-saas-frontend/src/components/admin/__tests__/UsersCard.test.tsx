import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../hooks/useAdminTenantUsers', () => ({ useAdminTenantUsers: vi.fn() }));

import { useAdminTenantUsers } from '../../../hooks/useAdminTenantUsers';
import { UsersCard } from '../UsersCard';

const mkUser = (overrides: Partial<any> = {}) => ({
  _id: 'u1',
  nome: 'Dono Original',
  email: 'dono@salao.pt',
  role: 'admin',
  ativo: true,
  emailVerificado: true,
  ultimoLogin: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('UsersCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra o spinner de loading', () => {
    (useAdminTenantUsers as any).mockReturnValue({ users: [], loading: true, error: null });
    render(<UsersCard tenantId="t1" />);
    expect(screen.getByText('A carregar utilizadores...')).toBeInTheDocument();
  });

  // Acima do cap de 100 a tabela trunca — sem este indicador o operador leria
  // as 100 linhas como o total real do tenant.
  it('avisa quando a tabela está truncada (total > utilizadores carregados)', () => {
    (useAdminTenantUsers as any).mockReturnValue({
      users: [mkUser({ _id: 'u1' }), mkUser({ _id: 'u2', email: 'b@salao.pt' })],
      pagination: { total: 150, page: 1, pages: 2, limit: 100 },
      loading: false,
      error: null,
    });
    render(<UsersCard tenantId="t1" />);
    expect(screen.getByText('A mostrar 2 de 150 utilizadores')).toBeInTheDocument();
  });

  it('não mostra o aviso de truncagem quando a tabela mostra tudo', () => {
    (useAdminTenantUsers as any).mockReturnValue({
      users: [mkUser({ _id: 'u1' })],
      pagination: { total: 1, page: 1, pages: 1, limit: 100 },
      loading: false,
      error: null,
    });
    render(<UsersCard tenantId="t1" />);
    expect(screen.queryByText(/A mostrar/)).not.toBeInTheDocument();
  });

  it('mostra o erro inline', () => {
    (useAdminTenantUsers as any).mockReturnValue({ users: [], loading: false, error: 'Tenant não encontrado' });
    render(<UsersCard tenantId="t1" />);
    expect(screen.getByText('Tenant não encontrado')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando não há utilizadores', () => {
    (useAdminTenantUsers as any).mockReturnValue({ users: [], loading: false, error: null });
    render(<UsersCard tenantId="t1" />);
    expect(screen.getByText('Sem utilizadores.')).toBeInTheDocument();
  });

  it('marca o primeiro admin como "Dono" e mostra role/estado/último login', () => {
    (useAdminTenantUsers as any).mockReturnValue({
      users: [
        mkUser({ _id: 'u1', nome: 'Dono Original', role: 'admin', ultimoLogin: '2026-07-10T10:00:00.000Z' }),
        mkUser({ _id: 'u2', nome: 'Recepcionista', email: 'recep@salao.pt', role: 'recepcionista', ativo: false, ultimoLogin: null }),
        mkUser({ _id: 'u3', nome: 'Segundo Admin', email: 'admin2@salao.pt', role: 'admin', ultimoLogin: null }),
      ],
      loading: false,
      error: null,
    });

    render(<UsersCard tenantId="t1" />);

    expect(screen.getByText('Dono Original')).toBeInTheDocument();
    expect(screen.getByText('Dono')).toBeInTheDocument(); // badge — só aparece uma vez
    expect(screen.getAllByText('admin')).toHaveLength(2); // 2 role badges 'admin'
    expect(screen.getByText('recepcionista')).toBeInTheDocument();

    // Estado activo/inactivo — u1 e u3 activos, u2 inactivo
    expect(screen.getAllByText('Activo')).toHaveLength(2);
    expect(screen.getByText('Inactivo')).toBeInTheDocument();

    // Último login: com valor formatado pt-PT, e "Nunca" quando ausente
    expect(screen.getAllByText('Nunca')).toHaveLength(2);
  });
});
