/**
 * Lembretes/templates ligados à Conversa (caso Cris, 2026-07-15).
 *
 * O histórico que a IA lê (GET /api/internal/clientes/:id/messages) filtra por
 * `conversa: conversa._id`. O registarNaThread gravava o template SEM esse link
 * — o template aparecia no inbox (agrupa por telefone) mas era invisível para o
 * agente: a cliente respondia "Ok obrigada" ao template de confirmação e a IA
 * cumprimentava como primeiro contacto, sem contexto nenhum.
 */

import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';
import { registarNaThread } from '../src/workers/notificationWorker.js';
import mongoose from 'mongoose';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

function models(tenantId) { return getModels(getTenantDB(String(tenantId))); }

const TEMPLATE = '✅ *Agendamento Confirmado!*\n\nOlá Cris! sábado, 01/08 às 09:00';

describe('registarNaThread — link à Conversa', () => {
  it('liga o template à Conversa existente do telefone (com/sem 351)', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const { Conversa, Mensagem } = models(tenantId);
    const conversa = await Conversa.create({
      tenantId, telefone: '351912345678', estado: 'aguardando_agendamento',
    });

    await registarNaThread(Mensagem, Conversa, {
      tenantId, telefone: '912345678', mensagem: TEMPLATE,
    });

    const msg = await Mensagem.findOne({ tenantId }).lean();
    expect(msg.geradoPor).toBe('sistema');
    expect(String(msg.conversa)).toBe(String(conversa._id));
  });

  it('cria a Conversa quando o cliente ainda não tem thread', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const { Conversa, Mensagem } = models(tenantId);

    await registarNaThread(Mensagem, Conversa, {
      tenantId, telefone: '351919999999', mensagem: TEMPLATE,
    });

    const conversa = await Conversa.findOne({ tenantId }).lean();
    const msg = await Mensagem.findOne({ tenantId }).lean();
    expect(conversa).not.toBeNull();
    expect(String(msg.conversa)).toBe(String(conversa._id));
  });

  it('o template fica visível no histórico que a IA lê (query por conversa)', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const { Conversa, Mensagem } = models(tenantId);
    const conversa = await Conversa.create({
      tenantId, telefone: '912345678', estado: 'aguardando_agendamento',
    });

    await registarNaThread(Mensagem, Conversa, {
      tenantId, telefone: '912345678', mensagem: TEMPLATE,
    });

    // Mesma query do GET /api/internal/clientes/:id/messages
    const historico = await Mensagem.find({ conversa: conversa._id, tenantId }).lean();
    expect(historico).toHaveLength(1);
    expect(historico[0].mensagem).toBe(TEMPLATE);
  });
});
