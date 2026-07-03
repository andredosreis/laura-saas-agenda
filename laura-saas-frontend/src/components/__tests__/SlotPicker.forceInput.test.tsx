import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SlotPicker from '../SlotPicker';

/**
 * Regressão: digitar um 2º dígito na "Hora manual" (forçar encaixe)
 * disparava `focus()` no campo dos minutos DENTRO do mesmo evento — isso
 * dispara um blur síncrono no campo da hora ANTES do React aplicar o
 * `setHInput` do 2º dígito. O `onBlur` corria então com o closure antigo
 * (só o 1º dígito) e reescrevia por cima do valor de 2 dígitos recém-
 * confirmado: "10" virava "01", "50" virava "05", etc. — qualquer hora de
 * 2 dígitos era corrompida para o 1º dígito com zero à esquerda.
 *
 * Usa `userEvent` (não `fireEvent.change`) porque a reprodução depende do
 * campo estar realmente focado no DOM — só assim o `.focus()` do minuto
 * dispara um `blur` real no campo da hora (`fireEvent.change` não move o
 * foco, por isso não reproduzia o bug).
 */

vi.mock('../../services/scheduleService', () => ({
  getDiaDisponibilidade: vi.fn().mockResolvedValue({
    slots: [],
    janela: null,
    ocupados: [],
  }),
}));

const DATA_FUTURA = '2099-01-01';

describe('SlotPicker — "Hora manual" (forçar encaixe)', () => {
  it('preserva os dois dígitos ao digitar uma hora terminada em zero (ex.: "10")', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SlotPicker
        date={DATA_FUTURA}
        value={null}
        onChange={onChange}
        allowForce
        onForceToggle={vi.fn()}
      />
    );

    const horaInput = screen.getByTestId('slot-picker-force-input');
    await user.click(horaInput);
    await user.keyboard('10');

    expect(horaInput).toHaveValue('10');
    expect(onChange).toHaveBeenLastCalledWith('10:00');
  });

  it('preserva minutos terminados em zero (ex.: "20") depois de a hora estar definida', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SlotPicker
        date={DATA_FUTURA}
        value="09:00"
        onChange={onChange}
        allowForce
        onForceToggle={vi.fn()}
      />
    );

    const minutoInput = screen.getByTestId('slot-picker-force-minutos');
    await user.clear(minutoInput);
    await user.type(minutoInput, '20');

    expect(minutoInput).toHaveValue('20');
    expect(onChange).toHaveBeenLastCalledWith('09:20');
  });
});
