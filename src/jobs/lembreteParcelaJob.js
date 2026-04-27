// CRON job: lembrete WhatsApp 5 dias antes da próxima parcela.
//
// Corre todos os dias às 09:00 (Europe/Lisbon). Para cada tenant:
//   1. Procura CompraPacote com:
//      - status: 'Ativo'
//      - valorPendente > 0
//      - dataProximaParcela entre hoje+5d 00:00 e hoje+5d 23:59
//      - lembreteParcelaEnviadoEm: null  (idempotência)
//   2. Envia mensagem WhatsApp ao cliente via Evolution API
//   3. Marca lembreteParcelaEnviadoEm = agora
//
// Idempotência: se a CRON correr 2x no mesmo dia, o segundo run não envia
// duplicado porque lembreteParcelaEnviadoEm deixa de ser null.
// Se o utilizador alterar dataProximaParcela, o controller reseta
// lembreteParcelaEnviadoEm para null → próximo run envia novamente.

import cron from 'node-cron';
import { DateTime } from 'luxon';
import Tenant from '../models/Tenant.js';
import { getTenantDB } from '../config/tenantDB.js';
import { getModels } from '../models/registry.js';
import { sendWhatsAppMessage } from '../utils/evolutionClient.js';
import logger from '../utils/logger.js';

const ZONA = 'Europe/Lisbon';
const DIAS_ANTES = parseInt(process.env.LEMBRETE_PARCELA_DIAS_ANTES, 10) || 5;

function buildMensagem({ clienteNome, valor, dataVencimento, pacoteNome, salaoNome }) {
  const dataFormatada = DateTime.fromJSDate(dataVencimento).setZone(ZONA).toFormat('dd/MM/yyyy');
  return `🔔 *Lembrete de Pagamento*\n\nOlá ${clienteNome}!\n\nLembramos que tem uma parcela do seu pacote *${pacoteNome}* prevista para *${dataFormatada}* (daqui a ${DIAS_ANTES} dias).\n\n💰 Valor: €${valor.toFixed(2)}\n\nQualquer dúvida, estamos à disposição.\n\n_${salaoNome}_`;
}

async function processarTenant(tenant) {
  const tenantDb = getTenantDB(tenant._id);
  const { CompraPacote } = getModels(tenantDb);

  // Janela de 1 dia em Europe/Lisbon: hoje+DIAS_ANTES, das 00:00 até 23:59
  const inicio = DateTime.now().setZone(ZONA).plus({ days: DIAS_ANTES }).startOf('day').toJSDate();
  const fim    = DateTime.now().setZone(ZONA).plus({ days: DIAS_ANTES }).endOf('day').toJSDate();

  const compras = await CompraPacote.find({
    status: 'Ativo',
    valorPendente: { $gt: 0 },
    dataProximaParcela: { $gte: inicio, $lte: fim },
    lembreteParcelaEnviadoEm: null
  }).populate('cliente', 'nome telefone').populate('pacote', 'nome');

  if (compras.length === 0) {
    return { tenantId: tenant._id, enviados: 0, falhados: 0 };
  }

  let enviados = 0;
  let falhados = 0;
  const salaoNome = tenant.nome || tenant.slug || 'Marcai';

  for (const compra of compras) {
    const telefone = compra.cliente?.telefone;
    if (!telefone) {
      logger.warn({ compraId: compra._id, tenantId: tenant._id }, '[LembreteParcela] Cliente sem telefone — ignorado');
      continue;
    }

    const valorParcela = compra.valorParcela > 0
      ? Math.min(compra.valorParcela, compra.valorPendente)
      : compra.valorPendente;

    const mensagem = buildMensagem({
      clienteNome: compra.cliente.nome,
      valor: valorParcela,
      dataVencimento: compra.dataProximaParcela,
      pacoteNome: compra.pacote?.nome || 'pacote',
      salaoNome
    });

    const resultado = await sendWhatsAppMessage(telefone, mensagem);
    if (resultado.success) {
      compra.lembreteParcelaEnviadoEm = new Date();
      await compra.save();
      enviados++;
      logger.info({ compraId: compra._id, cliente: compra.cliente.nome, tenantId: tenant._id }, '[LembreteParcela] Lembrete enviado');
    } else {
      falhados++;
      logger.error({ compraId: compra._id, err: resultado.error, tenantId: tenant._id }, '[LembreteParcela] Falha ao enviar — vai tentar amanhã');
    }
  }

  return { tenantId: tenant._id, enviados, falhados };
}

export async function executarLembretes() {
  const inicio = Date.now();
  logger.info('[LembreteParcela] Job iniciado');

  try {
    const tenants = await Tenant.find({ ativo: { $ne: false } }).select('_id nome slug').lean();
    logger.info({ totalTenants: tenants.length }, '[LembreteParcela] Tenants a processar');

    const resultados = await Promise.allSettled(tenants.map(t => processarTenant(t)));

    const sumario = resultados.reduce((acc, r) => {
      if (r.status === 'fulfilled') {
        acc.enviados += r.value.enviados;
        acc.falhados += r.value.falhados;
      } else {
        acc.errosTenant++;
        logger.error({ err: r.reason }, '[LembreteParcela] Erro ao processar tenant');
      }
      return acc;
    }, { enviados: 0, falhados: 0, errosTenant: 0 });

    logger.info(
      { ...sumario, duracaoMs: Date.now() - inicio },
      '[LembreteParcela] Job concluído'
    );
  } catch (err) {
    logger.error({ err }, '[LembreteParcela] Erro inesperado no job');
  }
}

export function startLembreteParcelaCron() {
  // Permite desligar via env var (útil em testes / múltiplas instâncias)
  if (process.env.LEMBRETE_PARCELA_CRON === 'off') {
    logger.info('[LembreteParcela] CRON desactivado por LEMBRETE_PARCELA_CRON=off');
    return null;
  }

  // Padrão: 09:00 todos os dias, fuso Europe/Lisbon
  const schedule = process.env.LEMBRETE_PARCELA_CRON_SCHEDULE || '0 9 * * *';

  const task = cron.schedule(schedule, executarLembretes, {
    scheduled: true,
    timezone: ZONA
  });

  logger.info({ schedule, diasAntes: DIAS_ANTES }, '[LembreteParcela] CRON registado');
  return task;
}
