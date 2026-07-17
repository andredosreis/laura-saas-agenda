import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../services/api', () => ({ apiHelpers: { get: vi.fn() } }));
vi.mock('react-toastify', () => ({ toast: { error: vi.fn() } }));

import { toast } from 'react-toastify';
import { apiHelpers } from '../../services/api';
import { useAdminAudit } from '../useAdminAudit';

describe('useAdminAudit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expõe o erro inline sem emitir um toast duplicado', async () => {
    (apiHelpers.get as any).mockRejectedValue({
      response: { data: { error: 'Auditoria indisponível' } },
    });

    const { result } = renderHook(() => useAdminAudit());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Auditoria indisponível');
    expect(toast.error).not.toHaveBeenCalled();
  });
});
