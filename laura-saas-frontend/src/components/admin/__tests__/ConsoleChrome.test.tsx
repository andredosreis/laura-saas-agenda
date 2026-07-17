import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mostra o badge do ambiente com o fallback DEV', () => {
    render(
      <MemoryRouter>
        <ConsoleChrome><div>conteúdo</div></ConsoleChrome>
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Ambiente: DEV')).toBeInTheDocument();
  });

  it('dá prioridade ao VITE_ENV_LABEL no badge do ambiente', () => {
    vi.stubEnv('VITE_ENV_LABEL', 'STAGING');

    render(
      <MemoryRouter>
        <ConsoleChrome><div>conteúdo</div></ConsoleChrome>
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Ambiente: STAGING')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ambiente: DEV')).not.toBeInTheDocument();
  });

  // O vermelho é o sinal de perigo: um rótulo de produção escrito de outra forma
  // não pode passar por ambiente seguro.
  it.each(['PRODUCTION', 'PROD', 'Produção'])('marca %s como produção (badge vermelho)', (label) => {
    vi.stubEnv('VITE_ENV_LABEL', label);

    render(
      <MemoryRouter>
        <ConsoleChrome><div>conteúdo</div></ConsoleChrome>
      </MemoryRouter>
    );

    expect(screen.getByLabelText(`Ambiente: ${label}`).className).toContain('red');
  });

  it('mantém o badge de DEV fora do estilo de produção', () => {
    render(
      <MemoryRouter>
        <ConsoleChrome><div>conteúdo</div></ConsoleChrome>
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Ambiente: DEV').className).toContain('emerald');
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

  it('inclui a navegação para Segurança', () => {
    render(
      <MemoryRouter>
        <ConsoleChrome><div>conteúdo</div></ConsoleChrome>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Segurança' })).toHaveAttribute('href', '/admin/security');
  });

  it('mostra um banner recuperável quando o backend exige configuração 2FA', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ConsoleChrome><div>conteúdo</div></ConsoleChrome>
      </MemoryRouter>
    );

    window.dispatchEvent(new CustomEvent('marcai:two-factor-setup-required'));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'A autenticação em dois passos é obrigatória.'
    );
    expect(screen.getByRole('link', { name: 'Configurar 2FA' })).toHaveAttribute('href', '/admin/security');

    await user.click(screen.getByRole('button', { name: 'Fechar aviso de 2FA' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
