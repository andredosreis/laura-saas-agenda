import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

describe('Tenant.configuracoes.intervaloEntreSessoes', () => {
  it('default é 0 quando não indicado', async () => {
    const t = await Tenant.create({ nome: 'X', slug: 'x', plano: { tipo: 'basico', status: 'ativo' } });
    expect(t.configuracoes.intervaloEntreSessoes).toBe(0);
  });

  it('aceita valor explícito (15)', async () => {
    const t = await Tenant.create({
      nome: 'Y', slug: 'y', plano: { tipo: 'basico', status: 'ativo' },
      configuracoes: { intervaloEntreSessoes: 15 },
    });
    expect(t.configuracoes.intervaloEntreSessoes).toBe(15);
  });
});
