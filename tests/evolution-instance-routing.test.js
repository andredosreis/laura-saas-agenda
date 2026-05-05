/**
 * Phase 0 — ADR-021: 1 instância Evolution por tenant.
 *
 * Cobre:
 *   - schema Tenant.whatsapp.instanceName (regex, lowercase, índice unique sparse)
 *   - resolveTenantByInstance() — lookup directo via instance
 *   - isolamento: tenant inactivo / instance inexistente / instance vazia
 */

import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import { resolveTenantByInstance } from '../src/modules/ia/webhookController.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const baseTenant = (over = {}) => ({
  nome: 'Clínica Teste',
  slug: 'clinica-teste',
  plano: { tipo: 'pro', status: 'ativo', trialDias: 7 },
  ...over,
});

describe('Tenant.whatsapp.instanceName — schema', () => {
  it('aceita instanceName válido (lowercase + dígitos + hífen) e normaliza para minúsculas', async () => {
    const t = await Tenant.create(baseTenant({
      slug: 'clinica-a',
      whatsapp: { instanceName: 'CLINICA-A' },
    }));
    expect(t.whatsapp.instanceName).toBe('clinica-a');
  });

  it('rejeita instanceName com caracteres inválidos (espaços, símbolos, acentos)', async () => {
    await expect(
      Tenant.create(baseTenant({ slug: 'clinica-bad', whatsapp: { instanceName: 'clinica spaces' } }))
    ).rejects.toThrow(/instanceName/);

    await expect(
      Tenant.create(baseTenant({ slug: 'clinica-bad2', whatsapp: { instanceName: 'clínica' } }))
    ).rejects.toThrow(/instanceName/);

    await expect(
      Tenant.create(baseTenant({ slug: 'clinica-bad3', whatsapp: { instanceName: 'clinica/A' } }))
    ).rejects.toThrow(/instanceName/);
  });

  it('permite múltiplos tenants sem instanceName (sparse index)', async () => {
    await Tenant.create(baseTenant({ slug: 't1' }));
    await Tenant.create(baseTenant({ slug: 't2' }));
    const total = await Tenant.countDocuments();
    expect(total).toBe(2);
  });

  it('rejeita 2 tenants com o mesmo instanceName (unique index)', async () => {
    await Tenant.syncIndexes(); // garante que o índice unique sparse está activo
    await Tenant.create(baseTenant({ slug: 't1', whatsapp: { instanceName: 'shared' } }));
    await expect(
      Tenant.create(baseTenant({ slug: 't2', whatsapp: { instanceName: 'shared' } }))
    ).rejects.toThrow();
  });
});

describe('resolveTenantByInstance — lookup directo', () => {
  it('encontra o tenant pelo instanceName e devolve { tenant, models, tenantId }', async () => {
    const t = await Tenant.create(baseTenant({
      slug: 'clinica-pilot',
      whatsapp: { instanceName: 'pilot' },
    }));

    const result = await resolveTenantByInstance('pilot');

    expect(result).not.toBeNull();
    expect(result.tenantId).toBe(t._id.toString());
    expect(result.tenant.whatsapp.instanceName).toBe('pilot');
    expect(result.models).toBeDefined();
    expect(typeof result.models.Cliente).toBe('function'); // model class
  });

  it('aceita instance com casing/espaços e normaliza antes de procurar', async () => {
    await Tenant.create(baseTenant({
      slug: 'clinica-mixed',
      whatsapp: { instanceName: 'mixed' },
    }));

    const result = await resolveTenantByInstance('  MIXED  ');
    expect(result).not.toBeNull();
    expect(result.tenant.whatsapp.instanceName).toBe('mixed');
  });

  it('devolve null quando o instanceName não corresponde a nenhum tenant', async () => {
    await Tenant.create(baseTenant({
      slug: 'clinica-real',
      whatsapp: { instanceName: 'real' },
    }));

    const result = await resolveTenantByInstance('inexistente');
    expect(result).toBeNull();
  });

  it('devolve null quando o tenant existe mas tem plano inactivo', async () => {
    await Tenant.create(baseTenant({
      slug: 'clinica-suspensa',
      plano: { tipo: 'pro', status: 'suspenso', trialDias: 7 },
      whatsapp: { instanceName: 'suspensa' },
    }));

    const result = await resolveTenantByInstance('suspensa');
    expect(result).toBeNull();
  });

  it('devolve null para argumentos inválidos (null, undefined, vazio, não-string)', async () => {
    expect(await resolveTenantByInstance(null)).toBeNull();
    expect(await resolveTenantByInstance(undefined)).toBeNull();
    expect(await resolveTenantByInstance('')).toBeNull();
    expect(await resolveTenantByInstance(123)).toBeNull();
    expect(await resolveTenantByInstance({})).toBeNull();
  });

  it('isolamento: 2 tenants com instances diferentes nunca se cruzam', async () => {
    const a = await Tenant.create(baseTenant({
      slug: 'clinica-a', whatsapp: { instanceName: 'inst-a' },
    }));
    const b = await Tenant.create(baseTenant({
      slug: 'clinica-b', whatsapp: { instanceName: 'inst-b' },
    }));

    const ra = await resolveTenantByInstance('inst-a');
    const rb = await resolveTenantByInstance('inst-b');

    expect(ra.tenantId).toBe(a._id.toString());
    expect(rb.tenantId).toBe(b._id.toString());
    expect(ra.tenantId).not.toBe(rb.tenantId);
  });
});
