import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const logout = vi.fn();
const navigate = vi.fn();

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { nome: 'Dev Super' }, logout }),
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

import { ConsoleChrome } from '../ConsoleChrome';

describe('ConsoleChrome', () => {
  beforeEach(() => {
    logout.mockClear();
    navigate.mockClear();
  });

  it('mostra o botão Sair e faz logout + redireciona para /login', async () => {
    render(
      <MemoryRouter>
        <ConsoleChrome><div>conteúdo</div></ConsoleChrome>
      </MemoryRouter>
    );

    const sair = screen.getByRole('button', { name: 'Sair' });
    expect(sair).toBeInTheDocument();

    await userEvent.click(sair);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
