import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from '../Login';

const login = vi.fn();
const complete2FALogin = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ login, complete2FALogin, isLoading: false }),
}));

vi.mock('../../components/MarcaiLogo', () => ({
  default: () => <div>Marcaí</div>,
}));

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/tenants" element={<div>Consola</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function reachChallenge(user) {
  await user.type(screen.getByLabelText('Email'), 'super@marcai.pt');
  await user.type(screen.getByLabelText('Senha'), 'TestPass@123');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return screen.findByRole('heading', { name: 'Verificação em dois passos' });
}

describe('Login — desafio 2FA', () => {
  beforeEach(() => {
    login.mockReset();
    complete2FALogin.mockReset();
    login.mockResolvedValue({
      success: true,
      requires2FA: true,
      challengeToken: 'challenge-123',
    });
  });

  it('faz o segundo passo e entra na consola sem emitir sessão no primeiro passo', async () => {
    const user = userEvent.setup();
    complete2FALogin.mockResolvedValue({
      success: true,
      user: { role: 'superadmin' },
    });
    renderLogin();

    await reachChallenge(user);

    expect(login).toHaveBeenCalledWith('super@marcai.pt', 'TestPass@123');
    const code = screen.getByLabelText('Código de autenticação');
    expect(code).toHaveFocus();
    await user.type(code, '12a3456');
    expect(code).toHaveValue('123456');
    await user.click(screen.getByRole('button', { name: 'Verificar e entrar' }));

    expect(complete2FALogin).toHaveBeenCalledWith('challenge-123', '123456');
    expect(await screen.findByText('Consola')).toBeInTheDocument();
  });

  it('recupera de challenge expirado e preserva as credenciais para repetir a senha', async () => {
    const user = userEvent.setup();
    complete2FALogin.mockResolvedValue({
      success: false,
      code: 'CHALLENGE_EXPIRED',
      error: 'Desafio 2FA inválido ou expirado',
    });
    renderLogin();

    await reachChallenge(user);
    await user.type(screen.getByLabelText('Código de autenticação'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verificar e entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O desafio expirou. Introduza novamente a senha.'
    );
    expect(screen.getByLabelText('Email')).toHaveValue('super@marcai.pt');
    expect(screen.getByLabelText('Senha')).toHaveValue('TestPass@123');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Verificação em dois passos' })).not.toBeInTheDocument());
  });
});
