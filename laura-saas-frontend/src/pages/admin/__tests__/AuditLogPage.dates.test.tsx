import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../services/api', () => ({ apiHelpers: { get: vi.fn() } }));

import { apiHelpers } from '../../../services/api';
import AuditLogPage from '../AuditLogPage';

describe('AuditLogPage — filtros de data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiHelpers.get as any).mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, page: 1, pages: 0, limit: 20 },
    });
  });

  // TZ fixado a Europe/Lisbon no vitest.config.ts. Em Julho o offset é UTC+1,
  // por isso as fronteiras locais do dia recuam uma hora ao converter para ISO.
  it('envia De no início do dia e Até inclusivo no fim do dia, em hora local', async () => {
    const user = userEvent.setup();
    render(<AuditLogPage />);

    await waitFor(() => expect(apiHelpers.get).toHaveBeenCalledWith('/admin/audit?page=1&limit=20'));

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-07-14' } });
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));

    await waitFor(() => {
      expect(apiHelpers.get).toHaveBeenLastCalledWith(
        '/admin/audit?page=1&limit=20&from=2026-06-30T23%3A00%3A00.000Z&to=2026-07-14T22%3A59%3A59.999Z'
      );
    });
  });

  it('bloqueia um intervalo invertido antes do pedido', async () => {
    render(<AuditLogPage />);
    await waitFor(() => expect(apiHelpers.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-07-15' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-07-14' } });

    expect(screen.getByRole('button', { name: 'Filtrar' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('igual ou posterior');
    expect(apiHelpers.get).toHaveBeenCalledTimes(1);
  });
});
