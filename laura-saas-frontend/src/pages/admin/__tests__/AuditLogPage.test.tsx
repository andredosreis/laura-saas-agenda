import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../hooks/useAdminAudit', () => ({ useAdminAudit: vi.fn() }));

import { useAdminAudit } from '../../../hooks/useAdminAudit';
import AuditLogPage from '../AuditLogPage';

const auditEntry = {
  _id: 'audit-1',
  actorUserId: '64b7f1c1a1b2c3d4e5f60708',
  actorEmail: 'admin@marcai.pt',
  action: 'tenant.plan.update',
  targetTenantId: '64b7f1c1a1b2c3d4e5f60709',
  status: 'ok' as const,
  metadata: { requestId: 'req-123' },
  before: { tipo: 'basico' },
  after: { tipo: 'pro' },
  createdAt: '2026-07-14T10:00:00.000Z',
};

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAdminAudit as any).mockReturnValue({
      data: [auditEntry],
      pagination: { total: 1, page: 1, pages: 1, limit: 20 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('mantém os detalhes recolhidos e permite expandir e recolher via teclado', async () => {
    const user = userEvent.setup();
    render(<AuditLogPage />);

    const toggle = screen.getByRole('button', { name: 'Mostrar detalhes de tenant.plan.update' });
    expect(toggle).toHaveClass('h-11', 'w-11');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Detalhes de tenant.plan.update' })).not.toBeInTheDocument();

    toggle.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'Ocultar detalhes de tenant.plan.update' })).toHaveAttribute('aria-expanded', 'true');
    const details = screen.getByRole('region', { name: 'Detalhes de tenant.plan.update' });
    expect(details).toHaveTextContent('Metadata');
    expect(details).toHaveTextContent('"requestId": "req-123"');
    expect(details).toHaveTextContent('Before');
    expect(details).toHaveTextContent('"tipo": "basico"');
    expect(details).toHaveTextContent('After');
    expect(details).toHaveTextContent('"tipo": "pro"');

    await user.keyboard('{Enter}');
    expect(screen.queryByRole('region', { name: 'Detalhes de tenant.plan.update' })).not.toBeInTheDocument();
  });
});
