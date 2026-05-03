import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';
import { gerarSnapshotMensal } from '../src/modules/financeiro/services/snapshotService.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

// Helper: tenant fresh para cada teste (evita poluição entre per-tenant DBs).
function novoContexto() {
  const tenantId = new mongoose.Types.ObjectId();
  const models = getModels(getTenantDB(tenantId.toString()));
  return { tenantId, models };
}

// Helper: cria data em Europe/Lisbon a partir de y/m/d/h. Garante reprodutibilidade
// independentemente do timezone da máquina onde os testes correm.
function dataLx(ano, mes, dia, hora = 12) {
  return DateTime.fromObject({ year: ano, month: mes, day: dia, hour: hora }, { zone: 'Europe/Lisbon' }).toJSDate();
}

// ──────────────────────────────────────────────
// TRACER — provar que a feature liga ponta-a-ponta
// ──────────────────────────────────────────────

describe('gerarSnapshotMensal — tracer', () => {
  it('mês vazio retorna período Europe/Lisbon correcto e todos os totais a zero', async () => {
    const { tenantId, models } = novoContexto();

    const snapshot = await gerarSnapshotMensal(models, tenantId.toString(), 2026, 4);

    // Período: Abril 2026 em Europe/Lisbon (BST após último domingo de Março).
    // 2026-04-01T00:00:00+01:00 = 2026-03-31T23:00:00Z
    // 2026-04-30T23:59:59.999+01:00 = 2026-04-30T22:59:59.999Z
    expect(snapshot.periodo.inicio.toISOString()).toBe('2026-03-31T23:00:00.000Z');
    expect(snapshot.periodo.fim.toISOString()).toBe('2026-04-30T22:59:59.999Z');

    expect(snapshot.totais).toEqual({
      receitas: 0,
      despesas: 0,
      saldo: 0,
      pendente: 0,
      receitasPorCategoria: [],
      receitasPorFormaPagamento: [],
      despesasPorCategoria: [],
    });
    expect(snapshot.contagens).toEqual({ transacoes: 0, pagamentos: 0, comprasPacote: 0 });
    expect(snapshot.retroactivos).toEqual({ quantidade: 0, valorTotal: 0 });
  });
});

// ──────────────────────────────────────────────
// Receitas — soma de Pagamentos cujo Transacao é Receita
// ──────────────────────────────────────────────

describe('gerarSnapshotMensal — receitas', () => {
  it('soma o valor de um Pagamento Receita feito no mês', async () => {
    const { tenantId, models } = novoContexto();

    const transacao = await models.Transacao.create({
      tenantId,
      tipo: 'Receita',
      categoria: 'Serviço Avulso',
      valor: 100,
      valorFinal: 100,
      descricao: 'Serviço de teste',
      statusPagamento: 'Pago',
      formaPagamento: 'Dinheiro',
      dataPagamento: dataLx(2026, 4, 15),
    });
    await models.Pagamento.create({
      tenantId,
      transacao: transacao._id,
      valor: 100,
      formaPagamento: 'Dinheiro',
      dataPagamento: dataLx(2026, 4, 15),
    });

    const snapshot = await gerarSnapshotMensal(models, tenantId.toString(), 2026, 4);

    expect(snapshot.totais.receitas).toBe(100);
    expect(snapshot.contagens.pagamentos).toBe(1);
    expect(snapshot.totais.saldo).toBe(100);
  });
});

// ──────────────────────────────────────────────
// Despesas — Transacao tipo='Despesa', statusPagamento='Pago' no mês
// ──────────────────────────────────────────────

describe('gerarSnapshotMensal — despesas', () => {
  it('soma valorFinal de Transacao Despesa Paga no mês e desconta do saldo', async () => {
    const { tenantId, models } = novoContexto();

    // Receita já testada em iter 2; aqui só despesa.
    await models.Transacao.create({
      tenantId,
      tipo: 'Despesa',
      categoria: 'Aluguel',
      valor: 250,
      valorFinal: 250,
      descricao: 'Renda Abril',
      statusPagamento: 'Pago',
      formaPagamento: 'Transferência Bancária',
      dataPagamento: dataLx(2026, 4, 5),
    });

    const snapshot = await gerarSnapshotMensal(models, tenantId.toString(), 2026, 4);

    expect(snapshot.totais.despesas).toBe(250);
    expect(snapshot.totais.saldo).toBe(-250);
    expect(snapshot.contagens.transacoes).toBe(1);
  });
});

// ──────────────────────────────────────────────
// Pendente — Receitas em aberto até ao fim do mês
// ──────────────────────────────────────────────

describe('gerarSnapshotMensal — pendente', () => {
  it('soma valorFinal de Receitas Pendentes criadas até ao fim do mês', async () => {
    const { tenantId, models } = novoContexto();

    // Transacao Receita pendente — sem Pagamento associado.
    // createdAt = now (ex: Maio 2026), MAS o snapshot é de Maio. Vamos pedir snapshot
    // de mês corrente para cair dentro da janela; o teste isola o cenário "tem dívida em aberto".
    const hoje = DateTime.now().setZone('Europe/Lisbon');
    await models.Transacao.create({
      tenantId,
      tipo: 'Receita',
      categoria: 'Pacote',
      valor: 200,
      valorFinal: 200,
      descricao: 'Pacote a pagar',
      statusPagamento: 'Pendente',
    });

    const snapshot = await gerarSnapshotMensal(models, tenantId.toString(), hoje.year, hoje.month);

    expect(snapshot.totais.pendente).toBe(200);
    // Pendente NÃO entra em receitas (cash-flow); só será receita quando for pago.
    expect(snapshot.totais.receitas).toBe(0);
  });

  it('Receita Parcial: pendente = valorFinal - sum(Pagamentos)', async () => {
    const { tenantId, models } = novoContexto();
    const hoje = DateTime.now().setZone('Europe/Lisbon');

    const transacao = await models.Transacao.create({
      tenantId,
      tipo: 'Receita',
      categoria: 'Pacote',
      valor: 500,
      valorFinal: 500,
      descricao: 'Pacote parcelado',
      statusPagamento: 'Parcial',
    });
    // Pagou 200 dos 500 — sobram 300 pendentes
    await models.Pagamento.create({
      tenantId,
      transacao: transacao._id,
      valor: 200,
      formaPagamento: 'Dinheiro',
      dataPagamento: hoje.toJSDate(),
    });

    const snapshot = await gerarSnapshotMensal(models, tenantId.toString(), hoje.year, hoje.month);

    expect(snapshot.totais.pendente).toBe(300);
    expect(snapshot.totais.receitas).toBe(200);
  });
});

// ──────────────────────────────────────────────
// Parcelado split — só conta Pagamentos do mês alvo
// ──────────────────────────────────────────────

describe('gerarSnapshotMensal — parcelado split entre meses', () => {
  it('para uma Transacao com 3 Pagamentos em Mar/Abr/Mai, snapshot de Abril só conta o de Abril', async () => {
    const { tenantId, models } = novoContexto();

    const transacao = await models.Transacao.create({
      tenantId,
      tipo: 'Receita',
      categoria: 'Pacote',
      valor: 600,
      valorFinal: 600,
      descricao: 'Pacote 3 parcelas',
      statusPagamento: 'Pago', // os 3 pagamentos cobrem o total
      formaPagamento: 'Dinheiro',
      dataPagamento: dataLx(2026, 5, 1),
    });

    await Promise.all([
      models.Pagamento.create({ tenantId, transacao: transacao._id, valor: 200, formaPagamento: 'Dinheiro', dataPagamento: dataLx(2026, 3, 10) }),
      models.Pagamento.create({ tenantId, transacao: transacao._id, valor: 200, formaPagamento: 'Dinheiro', dataPagamento: dataLx(2026, 4, 10) }),
      models.Pagamento.create({ tenantId, transacao: transacao._id, valor: 200, formaPagamento: 'Dinheiro', dataPagamento: dataLx(2026, 5, 10) }),
    ]);

    const snapshot = await gerarSnapshotMensal(models, tenantId.toString(), 2026, 4);

    expect(snapshot.totais.receitas).toBe(200);
    expect(snapshot.contagens.pagamentos).toBe(1);
  });
});

// ──────────────────────────────────────────────
// Retroactivos — Pagamentos com origemRetroactiva.motivo
// ──────────────────────────────────────────────

describe('gerarSnapshotMensal — retroactivos', () => {
  it('conta Pagamentos com origemRetroactiva no mês em retroactivos.{quantidade,valorTotal}', async () => {
    const { tenantId, models } = novoContexto();
    const userId = new mongoose.Types.ObjectId();

    // Pagamento 1: normal (sem origemRetroactiva)
    const t1 = await models.Transacao.create({
      tenantId, tipo: 'Receita', categoria: 'Pacote', valor: 100, valorFinal: 100,
      descricao: 'Normal', statusPagamento: 'Pago', formaPagamento: 'Dinheiro',
      dataPagamento: dataLx(2026, 4, 5),
    });
    await models.Pagamento.create({
      tenantId, transacao: t1._id, valor: 100, formaPagamento: 'Dinheiro',
      dataPagamento: dataLx(2026, 4, 5),
    });

    // Pagamento 2: retroactivo (registado em Maio mas com data de Abril)
    const t2 = await models.Transacao.create({
      tenantId, tipo: 'Receita', categoria: 'Pacote', valor: 150, valorFinal: 150,
      descricao: 'Retroactivo', statusPagamento: 'Pago', formaPagamento: 'Dinheiro',
      dataPagamento: dataLx(2026, 4, 20),
      origemRetroactiva: { motivo: 'Cliente cadastrado tarde', registadoEm: new Date(), registadoPor: userId },
    });
    await models.Pagamento.create({
      tenantId, transacao: t2._id, valor: 150, formaPagamento: 'Dinheiro',
      dataPagamento: dataLx(2026, 4, 20),
      origemRetroactiva: { motivo: 'Cliente cadastrado tarde', registadoEm: new Date(), registadoPor: userId },
    });

    const snapshot = await gerarSnapshotMensal(models, tenantId.toString(), 2026, 4);

    expect(snapshot.retroactivos).toEqual({ quantidade: 1, valorTotal: 150 });
    // Receitas inclui ambos (retroactivo conta como receita do mês alvo)
    expect(snapshot.totais.receitas).toBe(250);
  });
});

// ──────────────────────────────────────────────
// Categorias e formas de pagamento
// ──────────────────────────────────────────────

describe('gerarSnapshotMensal — agregação por categoria/forma', () => {
  it('agrega receitas por categoria (Transacao.categoria) e por formaPagamento (Pagamento.formaPagamento)', async () => {
    const { tenantId, models } = novoContexto();

    // 2 receitas Pacote (Dinheiro 100, MBWay 50) + 1 receita Serviço Avulso (Dinheiro 80)
    const tPac1 = await models.Transacao.create({
      tenantId, tipo: 'Receita', categoria: 'Pacote', valor: 100, valorFinal: 100,
      descricao: 'Pacote A', statusPagamento: 'Pago', formaPagamento: 'Dinheiro',
      dataPagamento: dataLx(2026, 4, 1),
    });
    const tPac2 = await models.Transacao.create({
      tenantId, tipo: 'Receita', categoria: 'Pacote', valor: 50, valorFinal: 50,
      descricao: 'Pacote B', statusPagamento: 'Pago', formaPagamento: 'MBWay',
      dataPagamento: dataLx(2026, 4, 5),
    });
    const tServ = await models.Transacao.create({
      tenantId, tipo: 'Receita', categoria: 'Serviço Avulso', valor: 80, valorFinal: 80,
      descricao: 'Limpeza', statusPagamento: 'Pago', formaPagamento: 'Dinheiro',
      dataPagamento: dataLx(2026, 4, 10),
    });
    await models.Pagamento.create({
      tenantId, transacao: tPac1._id, valor: 100, formaPagamento: 'Dinheiro', dataPagamento: dataLx(2026, 4, 1),
    });
    await models.Pagamento.create({
      tenantId, transacao: tPac2._id, valor: 50, formaPagamento: 'MBWay', dataPagamento: dataLx(2026, 4, 5),
      dadosMBWay: { telefone: '912345678' },
    });
    await models.Pagamento.create({
      tenantId, transacao: tServ._id, valor: 80, formaPagamento: 'Dinheiro', dataPagamento: dataLx(2026, 4, 10),
    });

    // 1 despesa Aluguel + 1 despesa Salário
    await models.Transacao.create({
      tenantId, tipo: 'Despesa', categoria: 'Aluguel', valor: 300, valorFinal: 300,
      descricao: 'Renda', statusPagamento: 'Pago', formaPagamento: 'Transferência Bancária',
      dataPagamento: dataLx(2026, 4, 5),
    });
    await models.Transacao.create({
      tenantId, tipo: 'Despesa', categoria: 'Salário', valor: 800, valorFinal: 800,
      descricao: 'Salário Maria', statusPagamento: 'Pago', formaPagamento: 'Transferência Bancária',
      dataPagamento: dataLx(2026, 4, 28),
    });

    const snapshot = await gerarSnapshotMensal(models, tenantId.toString(), 2026, 4);

    expect(snapshot.totais.receitas).toBe(230);
    expect(snapshot.totais.despesas).toBe(1100);

    // Ordem não importa — comparar como sets
    const recCat = new Map(snapshot.totais.receitasPorCategoria.map(c => [c.categoria, c.valor]));
    expect(recCat.get('Pacote')).toBe(150);
    expect(recCat.get('Serviço Avulso')).toBe(80);

    const recForma = new Map(snapshot.totais.receitasPorFormaPagamento.map(c => [c.forma, c.valor]));
    expect(recForma.get('Dinheiro')).toBe(180);
    expect(recForma.get('MBWay')).toBe(50);

    const despCat = new Map(snapshot.totais.despesasPorCategoria.map(c => [c.categoria, c.valor]));
    expect(despCat.get('Aluguel')).toBe(300);
    expect(despCat.get('Salário')).toBe(800);
  });
});

// ──────────────────────────────────────────────
// Timezone Europe/Lisbon — fronteira do mês
// ──────────────────────────────────────────────

describe('gerarSnapshotMensal — timezone Europe/Lisbon', () => {
  it('Pagamento à 23:30 Lisboa do último dia conta no mês; à 00:30 Lisboa do dia 1 do próximo conta no próximo', async () => {
    const { tenantId, models } = novoContexto();

    // 23:30 BST 30 Abril = 22:30 UTC — ainda Abril em Lisboa
    const dentroAbril = new Date('2026-04-30T22:30:00Z');
    // 00:30 BST 1 Maio = 23:30 UTC 30 Abril — já Maio em Lisboa
    const foraAbril = new Date('2026-04-30T23:30:00Z');

    const t1 = await models.Transacao.create({
      tenantId, tipo: 'Receita', categoria: 'Pacote', valor: 100, valorFinal: 100,
      descricao: 'Última hora de Abril', statusPagamento: 'Pago', formaPagamento: 'Dinheiro',
      dataPagamento: dentroAbril,
    });
    await models.Pagamento.create({
      tenantId, transacao: t1._id, valor: 100, formaPagamento: 'Dinheiro',
      dataPagamento: dentroAbril,
    });

    const t2 = await models.Transacao.create({
      tenantId, tipo: 'Receita', categoria: 'Pacote', valor: 200, valorFinal: 200,
      descricao: 'Primeira meia-hora de Maio', statusPagamento: 'Pago', formaPagamento: 'Dinheiro',
      dataPagamento: foraAbril,
    });
    await models.Pagamento.create({
      tenantId, transacao: t2._id, valor: 200, formaPagamento: 'Dinheiro',
      dataPagamento: foraAbril,
    });

    const snapAbril = await gerarSnapshotMensal(models, tenantId.toString(), 2026, 4);
    expect(snapAbril.totais.receitas).toBe(100);
    expect(snapAbril.contagens.pagamentos).toBe(1);

    const snapMaio = await gerarSnapshotMensal(models, tenantId.toString(), 2026, 5);
    expect(snapMaio.totais.receitas).toBe(200);
    expect(snapMaio.contagens.pagamentos).toBe(1);
  });
});

// ──────────────────────────────────────────────
// CompraPacote count — vendas com dataCompra no mês
// ──────────────────────────────────────────────

describe('gerarSnapshotMensal — contagem comprasPacote', () => {
  it('conta CompraPacotes cuja dataCompra cai no mês (incluindo retroactivos)', async () => {
    const { tenantId, models } = novoContexto();
    const cliente = await models.Cliente.create({ tenantId, nome: 'Cliente Teste', telefone: '910000001' });
    const pacote = await models.Pacote.create({ tenantId, nome: 'Pacote Teste', categoria: 'Estética', sessoes: 5, valor: 100 });

    // 2 compras em Abril, 1 em Maio
    await models.CompraPacote.create({
      tenantId, cliente: cliente._id, pacote: pacote._id,
      sessoesContratadas: 5, sessoesRestantes: 5, valorTotal: 100, valorPendente: 100,
      dataCompra: dataLx(2026, 4, 5),
    });
    await models.CompraPacote.create({
      tenantId, cliente: cliente._id, pacote: pacote._id,
      sessoesContratadas: 5, sessoesRestantes: 5, valorTotal: 100, valorPendente: 100,
      dataCompra: dataLx(2026, 4, 20),
    });
    await models.CompraPacote.create({
      tenantId, cliente: cliente._id, pacote: pacote._id,
      sessoesContratadas: 5, sessoesRestantes: 5, valorTotal: 100, valorPendente: 100,
      dataCompra: dataLx(2026, 5, 2),
    });

    const snapshot = await gerarSnapshotMensal(models, tenantId.toString(), 2026, 4);
    expect(snapshot.contagens.comprasPacote).toBe(2);
  });
});
