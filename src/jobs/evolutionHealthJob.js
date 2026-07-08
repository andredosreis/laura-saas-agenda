/**
 * CRON de saúde da ligação WhatsApp (Evolution). A cada 5 min verifica cada
 * instância configurada e alerta (email + Sentry) quando cai / recupera.
 * Também liga o caminho reactivo (falha de envio → check imediato).
 */
import cron from 'node-cron';
import Tenant from '../models/Tenant.js';
import logger from '../utils/logger.js';
import { registerSendFailureHandler } from '../utils/evolutionClient.js';
import { checkInstanceHealth, noteSendFailure } from '../services/evolutionHealthService.js';

const ZONA = 'Europe/Lisbon';

export async function checkAllInstances() {
  const tenants = await Tenant.find({ 'whatsapp.instanceName': { $type: 'string', $ne: '' } })
    .select('_id nome whatsapp.instanceName whatsapp.health')
    .lean();
  if (tenants.length === 0) return;
  const resultados = await Promise.allSettled(tenants.map((t) => checkInstanceHealth(t)));
  const erros = resultados.filter((r) => r.status === 'rejected').length;
  logger.info({ total: tenants.length, erros }, '[EvolutionHealth] Ciclo de verificação concluído');
}

export function startEvolutionHealthCron() {
  if (process.env.EVOLUTION_HEALTH_CRON === 'off') {
    logger.info('[EvolutionHealth] CRON desactivado por EVOLUTION_HEALTH_CRON=off');
    return null;
  }
  registerSendFailureHandler(noteSendFailure); // liga o caminho reactivo
  const schedule = process.env.EVOLUTION_HEALTH_CRON_SCHEDULE || '*/5 * * * *';
  const task = cron.schedule(schedule, checkAllInstances, { scheduled: true, timezone: ZONA });
  logger.info({ schedule }, '[EvolutionHealth] CRON registado');
  return task;
}
