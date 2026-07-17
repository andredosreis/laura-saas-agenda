import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SecurityPage from '../SecurityPage';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  logout: vi.fn(),
  refreshAuth: vi.fn(),
  toastSuccess: vi.fn(),
  currentUser: { nome: 'Super Admin', role: 'superadmin', twoFactorEnabled: false },
}));

vi.mock('../../../services/api', () => ({
  apiHelpers: { post: mocks.post },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mocks.currentUser,
    logout: mocks.logout,
    refreshAuth: mocks.refreshAuth,
  }),
}));

vi.mock('react-toastify', () => ({
  toast: { success: mocks.toastSuccess },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/security']}>
      <Routes>
        <Route path="/admin/security" element={<SecurityPage />} />
        <Route path="/login" element={<div>Ecrã de login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SecurityPage — TOTP', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.logout.mockReset();
    mocks.refreshAuth.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.logout.mockResolvedValue(undefined);
    mocks.refreshAuth.mockResolvedValue(undefined);
    mocks.currentUser.twoFactorEnabled = false;
  });

  it('mostra QR local + chave manual, activa e força logout', async () => {
    const user = userEvent.setup();
    mocks.post
      .mockResolvedValueOnce({
        success: true,
        data: {
          otpauthUri: 'otpauth://totp/Marcai%20Admin:super%40marcai.pt?secret=ABC123',
          secret: 'ABC123',
        },
      })
      .mockResolvedValueOnce({ success: true, data: { enabled: true } });
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Activar 2FA' }));

    expect(mocks.post).toHaveBeenNthCalledWith(1, '/admin/2fa/setup', {});
    expect(await screen.findByTitle('QR code para configurar 2FA')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    const code = screen.getByLabelText('Código de 6 dígitos');
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar e activar' }));

    expect(mocks.post).toHaveBeenNthCalledWith(2, '/admin/2fa/activate', { token: '123456' });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('2FA activado. Volte a iniciar sessão para concluir.');
    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Ecrã de login')).toBeInTheDocument();
  });

  it('desactiva apenas depois do diálogo danger e permite cancelar com Escape', async () => {
    const user = userEvent.setup();
    mocks.currentUser.twoFactorEnabled = true;
    mocks.post.mockResolvedValue({ success: true, data: { enabled: false } });
    renderPage();

    await user.type(screen.getByLabelText('Código de 6 dígitos'), '654321');
    const trigger = screen.getByRole('button', { name: 'Desactivar 2FA' });
    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Desactivar autenticação em dois passos?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desactivar 2FA' }));

    expect(mocks.post).toHaveBeenCalledWith('/admin/2fa/disable', { token: '654321' });
    expect(mocks.refreshAuth).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('2FA desactivado.');
    await waitFor(() => expect(screen.getByText('Estado: não configurada')).toBeInTheDocument());
  });
});
