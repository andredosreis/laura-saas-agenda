import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'react-toastify';
import { CopyIdButton } from '../CopyIdButton';

describe('CopyIdButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copia o ID, confirma o sucesso e não propaga o clique', async () => {
    const user = userEvent.setup();
    const parentClick = vi.fn();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    render(
      <div onClick={parentClick}>
        <CopyIdButton id="tenant-123" />
      </div>
    );

    const button = screen.getByRole('button', { name: 'Copiar ID' });
    expect(button).toHaveClass('h-11', 'w-11');
    await user.click(button);

    expect(writeText).toHaveBeenCalledWith('tenant-123');
    expect(toast.success).toHaveBeenCalledWith('ID copiado');
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('mostra erro quando a Clipboard API falha', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('sem permissão'));

    render(<CopyIdButton id="tenant-123" />);
    await user.click(screen.getByRole('button', { name: 'Copiar ID' }));

    expect(toast.error).toHaveBeenCalledWith('Não foi possível copiar');
  });
});
