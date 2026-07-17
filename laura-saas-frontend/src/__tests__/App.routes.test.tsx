import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthValue = {
  isAuthenticated: true,
  isLoading: false,
  user: { nome: 'Super Admin', role: 'superadmin' },
  tenant: null,
  logout: vi.fn(),
};

vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuthValue,
}));

vi.mock('../contexts/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../components/InstallPrompt', () => ({ default: () => null }));
vi.mock('../components/PWAUpdatePrompt', () => ({ default: () => null }));
vi.mock('../pages/admin/TenantsListPage', () => ({
  default: () => <div>Lista de tenants</div>,
}));

vi.mock('../pages/admin/SecurityPage', () => ({
  default: () => <div>Segurança do operador</div>,
}));

import App from '../App';

describe('App routing', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('renderiza a página 404 pública numa rota desconhecida', () => {
    window.history.replaceState({}, '', '/rota-que-nao-existe');

    render(<App />);

    expect(screen.getByRole('heading', { name: '404 — Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar ao dashboard/i })).toHaveAttribute('href', '/dashboard');
  });

  it('redireciona /admin para /admin/tenants numa sessão super-admin', async () => {
    window.history.replaceState({}, '', '/admin');

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/admin/tenants');
    });
    expect(await screen.findByText('Lista de tenants')).toBeInTheDocument();
  });

  it('expõe a rota protegida /admin/security', async () => {
    window.history.replaceState({}, '', '/admin/security');

    render(<App />);

    expect(await screen.findByText('Segurança do operador')).toBeInTheDocument();
  });
});
