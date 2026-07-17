import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/mocks/server';
import { AuthProvider, useAuth } from '../AuthContext';

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  ToastContainer: () => null,
}));

function Consumer() {
  const auth = useAuth();
  const [challengeToken, setChallengeToken] = useState('');

  const start = async () => {
    const result = await auth.login('super@marcai.pt', 'TestPass@123');
    setChallengeToken(result.challengeToken || '');
  };

  const complete = () => auth.complete2FALogin(challengeToken, '123456');

  return (
    <div>
      <span data-testid="loading">{auth.isLoading ? 'sim' : 'não'}</span>
      <span data-testid="authenticated">{auth.isAuthenticated ? 'sim' : 'não'}</span>
      <span data-testid="challenge">{challengeToken}</span>
      <button type="button" onClick={start}>Iniciar</button>
      <button type="button" onClick={complete}>Completar</button>
    </div>
  );
}

describe('AuthContext — sessão 2FA', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('guarda apenas o challenge no primeiro passo e persiste a sessão após TOTP', async () => {
    server.use(
      http.post('*/api/auth/login', () => HttpResponse.json({
        success: true,
        data: { requires2FA: true, challengeToken: 'challenge-123' },
      })),
      http.post('*/api/auth/login/2fa', async ({ request }) => {
        const body = await request.json() as { challengeToken: string; token: string };
        expect(body).toEqual({ challengeToken: 'challenge-123', token: '123456' });
        return HttpResponse.json({
          success: true,
          data: {
            user: { _id: 'super-1', nome: 'Super Admin', email: 'super@marcai.pt', role: 'superadmin' },
            tenant: { id: 'superadmin_tenant_id', nome: 'Painel Marcaí', plano: { tipo: 'elite', status: 'ativo' } },
            tokens: { accessToken: 'mfa-access', refreshToken: 'mfa-refresh' },
          },
        });
      })
    );

    const user = userEvent.setup();
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('não'));

    await user.click(screen.getByRole('button', { name: 'Iniciar' }));
    expect(await screen.findByTestId('challenge')).toHaveTextContent('challenge-123');
    expect(localStorage.getItem('laura_access_token')).toBeNull();
    expect(screen.getByTestId('authenticated')).toHaveTextContent('não');

    await user.click(screen.getByRole('button', { name: 'Completar' }));
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('sim'));
    expect(localStorage.getItem('laura_access_token')).toBe('mfa-access');
    expect(localStorage.getItem('laura_refresh_token')).toBe('mfa-refresh');
  });
});
