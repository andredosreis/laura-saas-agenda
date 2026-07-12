import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuickAppointmentModal from '../QuickAppointmentModal';

/**
 * Regressão F05: o toggle "Forçar encaixe" do admin desbloqueava a grelha do
 * SlotPicker mas o payload enviado ao backend NÃO incluía `forcarEncaixe: true`
 * — o enforcement de disponibilidade devolvia sempre 400 ("Horário fora da
 * disponibilidade configurada.") e o encaixe forçado era impossível na prática.
 */

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
}));

vi.mock('../../services/api', () => ({
  default: {
    // pacotes do cliente — vazio força serviceMode 'oferta' (caminho mais curto)
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock('react-toastify', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// O SlotPicker tem testes próprios — aqui interessa apenas o contrato com o
// modal: onChange(hora) e onForceToggle(true) têm de resultar num payload
// com dataHora composto e forcarEncaixe.
vi.mock('../SlotPicker', () => ({
  default: ({
    onChange,
    onForceToggle,
    allowForce,
  }: {
    onChange: (hora: string) => void;
    onForceToggle?: (next: boolean) => void;
    allowForce?: boolean;
  }) => (
    <div data-testid="slot-picker-stub" data-allow-force={allowForce ? 'true' : 'false'}>
      <button type="button" onClick={() => onForceToggle?.(true)}>
        stub-forcar-encaixe
      </button>
      <button type="button" onClick={() => onChange('08:30')}>
        stub-hora-0830
      </button>
    </div>
  ),
}));

describe('QuickAppointmentModal — encaixe forçado (F05)', () => {
  const futureDate = '2099-07-10';

  it('inclui forcarEncaixe: true no payload quando o admin activa o toggle', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <QuickAppointmentModal
        isOpen
        onClose={vi.fn()}
        selectedDate={null}
        clientes={[{ _id: 'c1', nome: 'Ana Silva', telefone: '910000001' }]}
        onSubmit={onSubmit}
      />
    );

    // 1. Seleccionar cliente (dropdown combobox)
    fireEvent.click(screen.getByLabelText('Mostrar todos os clientes'));
    fireEvent.click(await screen.findByText('Ana Silva'));

    // 2. Sem pacotes activos → serviceMode passa a 'oferta'; preencher o nome
    const ofertaInput = await screen.findByPlaceholderText('Ex: Sessão cortesia');
    fireEvent.change(ofertaInput, { target: { value: 'Sessão teste' } });

    // 3. Escolher a data e depois a hora fora do horário via força
    const dateInput = document.querySelector('input[name="dataDia"]');
    expect(dateInput).not.toBeNull();
    fireEvent.change(dateInput as Element, { target: { value: futureDate } });

    fireEvent.click(screen.getByText('stub-forcar-encaixe'));
    fireEvent.click(screen.getByText('stub-hora-0830'));

    // 4. Submeter
    fireEvent.click(screen.getByRole('button', { name: 'Criar Agendamento' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        dataHora: `${futureDate}T08:30`,
        forcarEncaixe: true,
      })
    );
  });

  it('NÃO envia forcarEncaixe quando o toggle está desligado', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <QuickAppointmentModal
        isOpen
        onClose={vi.fn()}
        selectedDate={null}
        clientes={[{ _id: 'c1', nome: 'Ana Silva', telefone: '910000001' }]}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByLabelText('Mostrar todos os clientes'));
    fireEvent.click(await screen.findByText('Ana Silva'));

    const ofertaInput = await screen.findByPlaceholderText('Ex: Sessão cortesia');
    fireEvent.change(ofertaInput, { target: { value: 'Sessão teste' } });

    const dateInput = document.querySelector('input[name="dataDia"]');
    fireEvent.change(dateInput as Element, { target: { value: futureDate } });
    fireEvent.click(screen.getByText('stub-hora-0830'));

    fireEvent.click(screen.getByRole('button', { name: 'Criar Agendamento' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.forcarEncaixe).toBeUndefined();
  });
});
