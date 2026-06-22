// getTenantDBAdmin — acessor read-only do painel (Gate 4b). É fail-closed:
// sem MONGO_TENANT_RO_URI lança, NUNCA cai na conexão principal read-write.
import { getTenantDBAdmin } from '../src/modules/admin/getTenantDBAdmin.js';

describe('getTenantDBAdmin — fail-closed', () => {
  it('lança se MONGO_TENANT_RO_URI não estiver definido (nunca usa a conexão principal)', () => {
    const saved = process.env.MONGO_TENANT_RO_URI;
    delete process.env.MONGO_TENANT_RO_URI;
    try {
      expect(() => getTenantDBAdmin('507f1f77bcf86cd799439011')).toThrow(/MONGO_TENANT_RO_URI/);
    } finally {
      if (saved !== undefined) process.env.MONGO_TENANT_RO_URI = saved;
    }
  });
});
