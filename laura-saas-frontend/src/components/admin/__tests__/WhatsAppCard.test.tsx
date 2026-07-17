import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../services/api', () => ({
  apiHelpers: { get: vi.fn(), post: vi.fn() },
}));

import { apiHelpers } from '../../../services/api';
import { WhatsAppCard } from '../WhatsAppCard';
import { TenantWhatsApp } from '../../../types/admin';

const semInstancia: TenantWhatsApp = {
  provider: 'evolution',
  instanceName: null,
  numeroWhatsapp: null,
  webhookConfigured: false,
  connectionState: 'unknown',
  evolutionReachable: false,
};

const ligada: TenantWhatsApp = {
  provider: 'evolution',
  instanceName: 'clinica-teste',
  numeroWhatsapp: '351912000111',
  webhookConfigured: true,
  connectionState: 'open',
  evolutionReachable: true,
};

const mockGet = apiHelpers.get as ReturnType<typeof vi.fn>;
const mockPost = apiHelpers.post as ReturnType<typeof vi.fn>;

const renderCard = () => render(<WhatsAppCard tenantId="tenant-1" tenantNome="Clínica Teste" />);

describe('WhatsAppCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sem instância → empty state com acção de criar', async () => {
    mockGet.mockResolvedValue({ success: true, data: semInstancia });
    renderCard();

    expect(await screen.findByRole('button', { name: 'Criar instância' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desligar sessão' })).not.toBeInTheDocument();
  });

  it('cria a instância com o nome indicado e recarrega o card', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ success: true, data: semInstancia });
    mockPost.mockResolvedValue({ success: true, data: { instanceName: 'nome-escolhido', connectionState: 'connecting' } });
    renderCard();

    await user.type(await screen.findByLabelText(/Nome da instância/), 'nome-escolhido');
    await user.click(screen.getByRole('button', { name: 'Criar instância' }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/admin/tenants/tenant-1/whatsapp/instancia', {
        instanceName: 'nome-escolhido',
      }),
    );
    // Recarrega para reflectir o novo estado (1x no mount + 1x após criar).
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('com instância → mostra estado, instância e número; QR só a pedido', async () => {
    mockGet.mockResolvedValue({ success: true, data: ligada });
    renderCard();

    expect(await screen.findByText('Ligado')).toBeInTheDocument();
    expect(screen.getByText('clinica-teste')).toBeInTheDocument();
    expect(screen.getByText('351912000111')).toBeInTheDocument();
    // O QR é uma credencial: não é pedido sem acção explícita do operador.
    expect(screen.queryByRole('img', { name: /QR/i })).not.toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('"Mostrar QR" vai buscar e rende o QR', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) =>
      url.endsWith('/qr')
        ? Promise.resolve({ success: true, data: { qrBase64: 'data:image/png;base64,AAA', pairingCode: 'WZYEH1YY' } })
        : Promise.resolve({ success: true, data: ligada }),
    );
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Mostrar QR' }));

    const img = await screen.findByRole('img', { name: /QR code/i });
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AAA');
    expect(screen.getByText('WZYEH1YY')).toBeInTheDocument();
  });

  it('Evolution inacessível → aviso âmbar, dados guardados na mesma', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { ...ligada, connectionState: 'unknown', evolutionReachable: false },
    });
    renderCard();

    expect(await screen.findByText(/Evolution inacessível/)).toBeInTheDocument();
    expect(screen.getByText('clinica-teste')).toBeInTheDocument();
    expect(screen.getByText('Desconhecido')).toBeInTheDocument();
  });

  it('"Desligar sessão" exige confirmação e explica a consequência', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ success: true, data: ligada });
    mockPost.mockResolvedValue({ success: true, data: { connectionState: 'close' } });
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Desligar sessão' }));

    expect(screen.getByText(/a IA e os lembretes deste cliente deixam de conseguir enviar mensagens/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled(); // ainda não confirmou

    // Dois botões partilham a copy: o do card e o de confirmação do diálogo (o último a montar).
    const botoes = screen.getAllByRole('button', { name: 'Desligar sessão' });
    await user.click(botoes[botoes.length - 1]);

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/tenants/tenant-1/whatsapp/logout', {}));
  });

  it('cancelar a confirmação não desliga nada', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ success: true, data: ligada });
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Desligar sessão' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('erro ao criar → mensagem inline do backend', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ success: true, data: semInstancia });
    mockPost.mockRejectedValue({ response: { data: { error: 'Já existe um tenant com esta instância' } } });
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Criar instância' }));

    expect(await screen.findByText('Já existe um tenant com esta instância')).toBeInTheDocument();
  });
});
