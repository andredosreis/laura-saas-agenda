import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgendaDisponibilidade from '../Disponibilidade';

/**
 * Regressão F01: a página de Disponibilidade é um editor de horário base — não
 * renderiza agendamentos (isso vive no Calendário). Ainda assim, a resposta de
 * `/schedules` inclui `agendamentos`, que podem trazer `cliente` a null. A página
 * NÃO pode rebentar por causa desses dados — deve ignorá-los e montar na mesma.
 * (Antes, `AgendamentoSlot` acedia `agendamento.cliente.nome` e o ecrã ficava branco.)
 */

vi.mock('../../services/scheduleService.js', () => ({
  getSchedules: vi.fn().mockResolvedValue({
    disponibilidade: [
      {
        _id: 'sch-1', dayOfWeek: 1, label: 'Segunda-feira', isActive: true,
        startTime: '09:00', endTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    // cliente AUSENTE — dados reais que rebentavam a página antiga
    agendamentos: [{ _id: 'ag-1', dataHora: '2026-06-29T09:00:00.000Z', cliente: null }],
  }),
  updateSchedule: vi.fn(),
}));

describe('Disponibilidade — regressão cliente null', () => {
  it('monta sem crashar quando a resposta traz um agendamento sem cliente', async () => {
    render(<AgendaDisponibilidade />);

    // A página montou (não ficou em branco)
    expect(await screen.findByText('Horário base')).toBeInTheDocument();
    // O dia base é apresentado como cartão editável
    expect(await screen.findByText('Segunda-feira')).toBeInTheDocument();
  });
});
