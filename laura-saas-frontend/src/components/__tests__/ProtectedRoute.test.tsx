import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

/**
 * Testes de ProtectedRoute — guard de auth + roles + planos.
 *
 * Estratégia: mock do useAuth para controlar isAuthenticated/user/tenant
 * sem montar AuthProvider real (mais rápido + isolado).
 */

// Mock useAuth — variável que cada teste configura
const mockAuthValue = {
  isAuthenticated: false,
  isLoading: false,
  user: null as null | { role?: string },
  tenant: null as null | { plano?: { tipo?: string } },
};

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}));

// Helper: renderiza ProtectedRoute dentro de MemoryRouter
const renderProtected = (
  props: { allowedRoles?: string[]; requiredPlans?: string[] } = {},
  initialPath = '/dashboard'
) => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute {...props}>
              <div>Conteúdo Protegido</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Página Login</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    // Reset state entre testes
    mockAuthValue.isAuthenticated = false;
    mockAuthValue.isLoading = false;
    mockAuthValue.user = null;
    mockAuthValue.tenant = null;
  });

  it('redirecciona para /login quando não autenticado', () => {
    mockAuthValue.isAuthenticated = false;

    renderProtected();

    // Conteúdo protegido NÃO deve aparecer
    expect(screen.queryByText('Conteúdo Protegido')).not.toBeInTheDocument();
    // Página de login (route fallback) deve aparecer
    expect(screen.getByText('Página Login')).toBeInTheDocument();
  });

  it('mostra "Acesso Negado" quando role não está em allowedRoles', () => {
    mockAuthValue.isAuthenticated = true;
    mockAuthValue.user = { role: 'recepcionista' };

    renderProtected({ allowedRoles: ['admin'] });

    expect(screen.getByText('Acesso Negado')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo Protegido')).not.toBeInTheDocument();
  });

  it('mostra "Funcionalidade Premium" quando plano não está em requiredPlans', () => {
    mockAuthValue.isAuthenticated = true;
    mockAuthValue.user = { role: 'admin' };
    mockAuthValue.tenant = { plano: { tipo: 'basico' } };

    renderProtected({ requiredPlans: ['premium'] });

    expect(screen.getByText('Funcionalidade Premium')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo Protegido')).not.toBeInTheDocument();
  });

  it('renderiza children quando authenticated + role + plano OK', () => {
    mockAuthValue.isAuthenticated = true;
    mockAuthValue.user = { role: 'admin' };
    mockAuthValue.tenant = { plano: { tipo: 'premium' } };

    renderProtected({ allowedRoles: ['admin'], requiredPlans: ['premium'] });

    expect(screen.getByText('Conteúdo Protegido')).toBeInTheDocument();
  });

  it('superadmin bypassa allowedRoles mesmo se não estiver na lista', () => {
    mockAuthValue.isAuthenticated = true;
    mockAuthValue.user = { role: 'superadmin' };

    renderProtected({ allowedRoles: ['admin'] });

    // Superadmin deve passar mesmo não estando em allowedRoles
    expect(screen.getByText('Conteúdo Protegido')).toBeInTheDocument();
  });

  it('mostra loading spinner enquanto isLoading=true', () => {
    mockAuthValue.isLoading = true;

    renderProtected();

    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo Protegido')).not.toBeInTheDocument();
    expect(screen.queryByText('Página Login')).not.toBeInTheDocument();
  });
});
