import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';
import { resolveAvailableSlots } from '../src/controllers/scheduleController.js';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const DATE = '2027-06-07'; // futuro, para não cair no filtro "hoje"
const LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function models(tenantId) { return getModels(getTenantDB(String(tenantId))); }

// Semeia os 7 dias com janela e pausa dadas.
async function seedWeek(tenantId, { start = '09:00', end = '18:00', bStart = '12:00', bEnd = '13:00' } = {}) {
  const { Schedule } = models(tenantId);
  await Promise.all([0,1,2,3,4,5,6].map((d) => Schedule.create({
    tenantId, dayOfWeek: d, label: LABELS[d], isActive: true,
    startTime: start, endTime: end, breakStartTime: bStart, breakEndTime: bEnd,
  })));
}

async function seedBooking(tenantId, isoLocal) {
  const { Agendamento } = models(tenantId);
  await Agendamento.create({
    tenantId,
    dataHora: DateTime.fromISO(isoLocal, { zone: 'Europe/Lisbon' }).toJSDate(),
    status: 'Agendado',
  });
}

function call(tenantId, interval) {
  const { Schedule, ScheduleException, Agendamento } = models(tenantId);
  return resolveAvailableSlots({ Schedule, ScheduleException, Agendamento, tenantId, date: DATE, duration: 60, interval });
}

describe('resolveAvailableSlots — intervalo de arrumação', () => {
  it('interval=0 → grelha hora-a-hora (regressão, comportamento atual)', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await seedWeek(tenantId); // 09-18, pausa 12-13
    const { slots } = await call(tenantId, 0);
    expect(slots).toEqual(['09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00']);
  });

  it('interval=15 → cadência de 75 min por bloco (manhã/tarde), sem invadir a pausa', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await seedWeek(tenantId); // 09-18, pausa 12-13
    const { slots } = await call(tenantId, 15);
    expect(slots).toEqual(['09:00','10:15','13:00','14:15','15:30','16:45']);
  });

  it('interval=15 → ancora na marcação real (booking desalinhado às 13:30)', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await seedWeek(tenantId); // 09-18, pausa 12-13
    await seedBooking(tenantId, `${DATE}T13:30`); // 13:30–14:30 + arrumação até 14:45
    const { slots } = await call(tenantId, 15);
    // manhã intacta; tarde reancora no fim do booking (14:45)
    expect(slots).toEqual(['09:00','10:15','14:45','16:00']);
  });

  it('interval=15 → slot que terminaria depois do fecho NÃO entra', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await seedWeek(tenantId, { start: '13:00', end: '20:00', bStart: '13:00', bEnd: '13:00' }); // bloco único 13-20
    const { slots } = await call(tenantId, 15);
    // 13:00,14:15,15:30,16:45,18:00 ; 19:15→20:15 passa do fecho → fora
    expect(slots).toEqual(['13:00','14:15','15:30','16:45','18:00']);
  });

  it('interval=15 → candidato NÃO invade a arrumação da marcação seguinte (regressão)', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await seedWeek(tenantId, { start: '13:00', end: '20:00', bStart: '13:00', bEnd: '13:00' }); // bloco único 13-20
    await seedBooking(tenantId, `${DATE}T14:00`); // marcação real às 14:00
    const { slots } = await call(tenantId, 15);
    // 13:00–14:00 deixaria 0 min de arrumação antes da marcação das 14:00 —
    // o helper não pode oferecer um slot que o booking depois rejeita (409).
    expect(slots).not.toContain('13:00');
    expect(slots).toEqual(['15:15','16:30','17:45','19:00']);
  });
});

describe('resolveAvailableSlots — pausa parcialmente sobreposta à janela', () => {
  it('pausa que ultrapassa o fecho continua a excluir os slots dentro da pausa', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    // Config incoerente mas alcançável pelo painel: fecho às 13:20, pausa 12:00-15:00.
    await seedWeek(tenantId, { start: '09:00', end: '13:20', bStart: '12:00', bEnd: '15:00' });
    const { slots } = await call(tenantId, 0);
    expect(slots).not.toContain('12:00');
    expect(slots).toEqual(['09:00', '10:00', '11:00']);
  });

  it('excepção cuja janela começa a meio da pausa base respeita a parte da pausa dentro da janela', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await seedWeek(tenantId); // base 09-18, pausa 12-13
    const { ScheduleException } = models(tenantId);
    await ScheduleException.create({ tenantId, data: DATE, tipo: 'horas-extra', inicio: '12:30', fim: '20:00' });
    const { slots } = await call(tenantId, 0);
    // A pausa aplica-se também às janelas de excepção: 12:30 cai dentro dela.
    expect(slots).not.toContain('12:30');
    expect(slots).toEqual(['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']);
  });
});
