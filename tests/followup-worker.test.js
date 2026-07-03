// tests/followup-worker.test.js
// processFollowUpJob — wiring DB + envio + persistência no inbox + idempotência.
import { jest } from '@jest/globals';

const sendMock = jest.fn().mockResolvedValue({ success: true });
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: sendMock,
}));

const { processFollowUpJob } = await import('../src/workers/followUpPosSessao.js');
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;
const { getTenantDB } = await import('../src/config/tenantDB.js');
const { getModels } = await import('../src/models/registry.js');

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(async () => {
  await clearDB();
  sendMock.mockClear();
});

async function seed({ tenantOverrides = {}, clienteOverrides = {}, agOverrides = {} } = {}) {
  const tenant = await Tenant.create({
    nome: 'Clínica FW',
    slug: `clinica-fw-${Date.now()}`,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    whatsapp: { instanceName: 'clinica-fw' },
    ...tenantOverrides,
  });
  const models = getModels(getTenantDB(String(tenant._id)));
  const cliente = await models.Cliente.create({
    tenantId: tenant._id,
    nome: 'Maria',
    telefone: '351910000001',
    ...clienteOverrides,
  });
  const dataHora = new Date(Date.now() + 60 * 60 * 1000); // futura (pre-save bloqueia passado)
  const agendamento = await models.Agendamento.create({
    tenantId: tenant._id,
    cliente: cliente._id,
    dataHora,
    status: 'Confirmado',
    confirmacao: { tipo: 'confirmado' },
    ...agOverrides,
  });
  const job = {
    id: 'j1',
    data: {
      tipo: 'follow-up-pos-sessao',
      agendamentoId: String(agendamento._id),
      tenantId: String(tenant._id),
      dataHora: dataHora.toISOString(),
    },
  };
  return { tenant, models, cliente, agendamento, job };
}

describe('processFollowUpJob', () => {
  it('envia com a instância do tenant, liga Mensagem à Conversa e marca enviadoEm', async () => {
    const { models, agendamento, job } = await seed();

    await processFollowUpJob(job);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [telefone, texto, instancia] = sendMock.mock.calls[0];
    expect(telefone).toBe('351910000001');
    expect(texto).toContain('como correu');
    expect(instancia).toBe('clinica-fw');

    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.followUp.enviadoEm).toBeInstanceOf(Date);

    const msg = await models.Mensagem.findOne({ tenantId: ag.tenantId }).lean();
    expect(msg).not.toBeNull();
    expect(msg.direcao).toBe('saida');
    expect(msg.geradoPor).toBe('sistema');
    expect(msg.conversa).not.toBeNull();

    const conversa = await models.Conversa.findById(msg.conversa).lean();
    expect(conversa).not.toBeNull();
  });

  it('é idempotente — segunda execução não reenvia', async () => {
    const { job } = await seed();
    await processFollowUpJob(job);
    await processFollowUpJob(job);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('não envia quando iaGlobalAtiva=false', async () => {
    const { job } = await seed({
      tenantOverrides: { configuracoes: { iaGlobalAtiva: false } },
    });
    await processFollowUpJob(job);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('não envia para agendamento cancelado', async () => {
    const { models, agendamento, job } = await seed();
    await models.Agendamento.updateOne(
      { _id: agendamento._id },
      { $set: { status: 'Cancelado Pelo Cliente' } }
    );
    await processFollowUpJob(job);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('não envia para agendamento sem cliente (lead)', async () => {
    const { models, tenant } = await seed();
    const dataHora = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const agLead = await models.Agendamento.create({
      tenantId: tenant._id,
      tipo: 'Avaliacao',
      lead: { nome: 'Lead X', telefone: '351920000000' },
      dataHora,
      status: 'Agendado',
    });
    sendMock.mockClear();
    await processFollowUpJob({
      id: 'j2',
      data: {
        tipo: 'follow-up-pos-sessao',
        agendamentoId: String(agLead._id),
        tenantId: String(tenant._id),
        dataHora: dataHora.toISOString(),
      },
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('variante falta quando Laura marcou Não Compareceu', async () => {
    const { models, agendamento, job } = await seed();
    await models.Agendamento.updateOne(
      { _id: agendamento._id },
      { $set: { status: 'Não Compareceu' } }
    );
    await processFollowUpJob(job);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][1]).toMatch(/falta/i);
  });

  it('falha de envio lança erro (BullMQ retry) e NÃO marca enviadoEm', async () => {
    const { models, agendamento, job } = await seed();
    sendMock.mockResolvedValueOnce({ success: false, error: 'down' });
    await expect(processFollowUpJob(job)).rejects.toThrow();
    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.followUp?.enviadoEm ?? null).toBeNull();
  });

  it('após falha de envio o claim é libertado — o retry seguinte envia', async () => {
    const { models, agendamento, job } = await seed();
    sendMock.mockResolvedValueOnce({ success: false, error: 'down' });
    await expect(processFollowUpJob(job)).rejects.toThrow();

    await processFollowUpJob(job); // retry do BullMQ

    expect(sendMock).toHaveBeenCalledTimes(2);
    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.followUp.enviadoEm).toBeInstanceOf(Date);
  });

  it('sendWhatsAppMessage a lançar (erro de rede) liberta o claim e propaga', async () => {
    const { models, agendamento, job } = await seed();
    sendMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(processFollowUpJob(job)).rejects.toThrow();
    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.followUp?.enviadoEm ?? null).toBeNull();
  });

  it('execuções concorrentes do mesmo job: claim atómico → um único envio', async () => {
    const { job } = await seed();
    await Promise.all([processFollowUpJob(job), processFollowUpJob(job)]);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
