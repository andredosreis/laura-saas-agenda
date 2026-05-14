/**
 * GAP-01 — Slot conflict atomicity.
 *
 * Verifica que o índice composto único parcial
 * `(tenantId, dataHora) where ocupaSlot=true` em Agendamento substitui
 * o padrão check-then-create por uma garantia atómica:
 *
 *   - Dois `Agendamento.create` com a mesma (tenantId, dataHora) →
 *     o segundo falha com E11000 (DuplicateKey).
 *   - Cancelar um agendamento liberta o slot (ocupaSlot=false via hook).
 *   - Alterar status via findOneAndUpdate também actualiza ocupaSlot
 *     (hook pre('findOneAndUpdate')).
 *
 * Estes testes provam que a corrida real (duas chamadas paralelas a
 * F09 create_appointment para o mesmo slot) é resolvida pela DB —
 * nenhuma lógica de aplicação adicional necessária.
 */

import mongoose from 'mongoose';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Agendamento from '../src/models/Agendamento.js';

beforeAll(async () => {
  await setupTestDB();
  // Garante que o índice parcial está criado antes dos testes correrem.
  await Agendamento.syncIndexes();
});
afterAll(teardownTestDB);
beforeEach(clearDB);

describe('GAP-01: Slot conflict atomicity (Agendamento)', () => {
  const futureDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

  it('rejeita criação duplicada para a mesma (tenantId, dataHora) com E11000', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const dataHora = futureDate();

    const first = await Agendamento.create({
      tenantId,
      tipo: 'Avaliacao',
      lead: { nome: 'Lead 1', telefone: '910000001' },
      dataHora,
      status: 'Agendado',
    });
    expect(first.ocupaSlot).toBe(true);

    let duplicateError;
    try {
      await Agendamento.create({
        tenantId,
        tipo: 'Avaliacao',
        lead: { nome: 'Lead 2', telefone: '910000002' },
        dataHora,
        status: 'Agendado',
      });
    } catch (err) {
      duplicateError = err;
    }

    expect(duplicateError).toBeDefined();
    expect(duplicateError.code).toBe(11000);
  });

  it('permite criação no mesmo slot em tenants diferentes (isolamento multi-tenant)', async () => {
    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();
    const dataHora = futureDate();

    await Agendamento.create({
      tenantId: tenantA,
      tipo: 'Avaliacao',
      lead: { nome: 'A', telefone: '910000001' },
      dataHora,
      status: 'Agendado',
    });

    // Mesma dataHora exacta, tenant diferente — deve aceitar.
    const segundo = await Agendamento.create({
      tenantId: tenantB,
      tipo: 'Avaliacao',
      lead: { nome: 'B', telefone: '910000002' },
      dataHora,
      status: 'Agendado',
    });

    expect(segundo._id).toBeDefined();
  });

  it('liberta o slot quando o agendamento é cancelado (ocupaSlot=false via save hook)', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const dataHora = futureDate();

    const original = await Agendamento.create({
      tenantId,
      tipo: 'Avaliacao',
      lead: { nome: 'X', telefone: '910000001' },
      dataHora,
      status: 'Agendado',
    });

    original.status = 'Cancelado Pelo Cliente';
    await original.save();
    expect(original.ocupaSlot).toBe(false);

    // Após cancelamento, o mesmo slot deve aceitar nova marcação.
    const novo = await Agendamento.create({
      tenantId,
      tipo: 'Avaliacao',
      lead: { nome: 'Y', telefone: '910000002' },
      dataHora,
      status: 'Agendado',
    });
    expect(novo.ocupaSlot).toBe(true);
  });

  it('actualiza ocupaSlot quando status é alterado via findOneAndUpdate', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const dataHora = futureDate();

    const original = await Agendamento.create({
      tenantId,
      tipo: 'Avaliacao',
      lead: { nome: 'X', telefone: '910000001' },
      dataHora,
      status: 'Agendado',
    });

    await Agendamento.findOneAndUpdate(
      { _id: original._id },
      { $set: { status: 'Cancelado Pelo Salão' } },
    );

    const reloaded = await Agendamento.findById(original._id);
    expect(reloaded.status).toBe('Cancelado Pelo Salão');
    expect(reloaded.ocupaSlot).toBe(false);

    // E o slot deve estar livre para nova marcação.
    const novo = await Agendamento.create({
      tenantId,
      tipo: 'Avaliacao',
      lead: { nome: 'Y', telefone: '910000002' },
      dataHora,
      status: 'Agendado',
    });
    expect(novo._id).toBeDefined();
  });

  it('tratamento concorrente: Promise.all de dois creates → exactamente um sucede', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const dataHora = futureDate();

    const tentativas = [
      Agendamento.create({
        tenantId,
        tipo: 'Avaliacao',
        lead: { nome: 'A', telefone: '910000001' },
        dataHora,
        status: 'Agendado',
      }),
      Agendamento.create({
        tenantId,
        tipo: 'Avaliacao',
        lead: { nome: 'B', telefone: '910000002' },
        dataHora,
        status: 'Agendado',
      }),
    ];

    const results = await Promise.allSettled(tentativas);
    const sucessos = results.filter((r) => r.status === 'fulfilled');
    const falhas = results.filter((r) => r.status === 'rejected');

    expect(sucessos).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect(falhas[0].reason.code).toBe(11000);

    // E só existe um documento na DB para este slot.
    const count = await Agendamento.countDocuments({ tenantId, dataHora });
    expect(count).toBe(1);
  });
});
