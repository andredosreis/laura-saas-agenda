process.env.INTERNAL_SERVICE_TOKEN = 'test-service-token';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const svc = () => ({ 'X-Service-Token': 'test-service-token' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const LABELS = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const DATE = '2027-06-07';

async function criarTenant(slug, intervalo) {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`, slug,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    configuracoes: { intervaloEntreSessoes: intervalo },
  });
  const user = await User.create({
    tenantId: tenant._id, nome: `U ${slug}`, email: `u@${slug}.pt`,
    passwordHash: 'x', role: 'admin', emailVerificado: true,
  });
  const token = jwt.sign({ userId: user._id, tenantId: tenant._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { tenant, token };
}

async function seedWeek(tenantId) {
  const { Schedule } = getModels(getTenantDB(String(tenantId)));
  await Promise.all([0,1,2,3,4,5,6].map((d) => Schedule.create({
    tenantId, dayOfWeek: d, label: LABELS[d], isActive: true,
    startTime: '09:00', endTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00',
  })));
}

describe('endpoints aplicam intervaloEntreSessoes do tenant', () => {
  it('endpoint interno (IA) usa o intervalo do tenant', async () => {
    const { tenant } = await criarTenant('int-15', 15);
    await seedWeek(tenant._id);
    const res = await request(app)
      .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&date=${DATE}&duration=60`)
      .set(svc());
    expect(res.status).toBe(200);
    expect(res.body.data.days[0].slots).toEqual(['09:00','10:15','13:00','14:15','15:30','16:45']);
  });

  it('endpoint do painel usa o intervalo do tenant (paridade)', async () => {
    const { tenant, token } = await criarTenant('painel-15', 15);
    await seedWeek(tenant._id);
    const res = await request(app)
      .get(`/api/v1/schedules/available-slots?date=${DATE}&duration=60`)
      .set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.availableSlots).toEqual(['09:00','10:15','13:00','14:15','15:30','16:45']);
  });

  it('tenant com intervalo 0 → grelha hora-a-hora (sem regressão)', async () => {
    const { tenant } = await criarTenant('int-0', 0);
    await seedWeek(tenant._id);
    const res = await request(app)
      .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&date=${DATE}&duration=60`)
      .set(svc());
    expect(res.body.data.days[0].slots).toEqual(['09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00']);
  });
});
