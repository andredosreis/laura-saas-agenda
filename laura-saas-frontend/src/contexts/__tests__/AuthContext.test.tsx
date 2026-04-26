import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../AuthContext';

/**
 * Testes de AuthContext — fluxo de login/logout + persistência localStorage.
 * Usa MSW (configurado em tests/setup.ts) para interceptar chamadas axios.
 */

// Mock react-toastify para evitar barulho — toast.error aparece quando interceptor 401
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  ToastContainer: () => null,
}));

// Componente de teste que expõe valores do AuthContext via DOM
function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="is-authenticated">{auth.isAuthenticated ? 'true' : 'false'}</div>
      <div data-testid="is-loading">{auth.isLoading ? 'true' : 'false'}</div>
      <div data-testid="user-email">{auth.user?.email ?? 'no-user'}</div>
      <div data-testid="tenant-nome">{auth.tenant?.nome ?? 'no-tenant'}</div>
      <button onClick={() => auth.login('test@marcai.pt', 'TestPass@123')}>
        Login
      </button>
      <button onClick={() => auth.logout()}>Logout</button>
    </div>
  );
}

const renderAuthProvider = () =>
  render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );

describe('AuthContext', () => {
  beforeEach(() => {
    // Limpar localStorage entre testes para evitar state leak
    localStorage.clear();
  });

  it('inicia sem utilizador autenticado quando localStorage vazio', async () => {
    renderAuthProvider();

    // Após mount + useEffect terminar
    await waitFor(() => {
      expect(screen.getByTestId('is-loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
    expect(screen.getByTestId('user-email').textContent).toBe('no-user');
  });

  it('login: persiste tokens em localStorage e actualiza estado', async () => {
    const user = userEvent.setup();
    renderAuthProvider();

    // Aguardar fim do load inicial
    await waitFor(() => {
      expect(screen.getByTestId('is-loading').textContent).toBe('false');
    });

    // Click no botão Login (chama auth.login com credenciais válidas)
    await user.click(screen.getByRole('button', { name: 'Login' }));

    // Após login bem-sucedido (MSW intercepta e devolve dados de teste)
    await waitFor(() => {
      expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
    });

    expect(screen.getByTestId('user-email').textContent).toBe('test@marcai.pt');
    expect(screen.getByTestId('tenant-nome').textContent).toBe('Salão Teste');

    // localStorage deve ter os 4 tokens/objects guardados
    expect(localStorage.getItem('laura_access_token')).toBe('fake-access-token');
    expect(localStorage.getItem('laura_refresh_token')).toBe('fake-refresh-token');
    expect(localStorage.getItem('laura_user')).toContain('test@marcai.pt');
    expect(localStorage.getItem('laura_tenant')).toContain('Salão Teste');
  });

  it('logout: limpa as 4 keys do localStorage e zera estado', async () => {
    const user = userEvent.setup();

    // Pre-popular localStorage como se já tivesse logged in
    localStorage.setItem('laura_access_token', 'fake-access-token');
    localStorage.setItem('laura_refresh_token', 'fake-refresh-token');
    localStorage.setItem('laura_user', JSON.stringify({
      _id: 'user-test-1',
      email: 'test@marcai.pt',
      nome: 'Test User',
      role: 'admin',
    }));
    localStorage.setItem('laura_tenant', JSON.stringify({
      _id: 'tenant-test-1',
      nome: 'Salão Teste',
      plano: { tipo: 'basico', status: 'ativo' },
    }));

    renderAuthProvider();

    // Aguardar load inicial — restaura user/tenant via /auth/me
    await waitFor(() => {
      expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
    });

    // Click logout
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Logout' }));
    });

    // Estado zerado
    await waitFor(() => {
      expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
    });

    expect(screen.getByTestId('user-email').textContent).toBe('no-user');
    expect(screen.getByTestId('tenant-nome').textContent).toBe('no-tenant');

    // Todas as 4 keys foram removidas
    expect(localStorage.getItem('laura_access_token')).toBeNull();
    expect(localStorage.getItem('laura_refresh_token')).toBeNull();
    expect(localStorage.getItem('laura_user')).toBeNull();
    expect(localStorage.getItem('laura_tenant')).toBeNull();
  });
});
