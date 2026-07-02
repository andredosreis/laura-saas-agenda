/**
 * Endpoint interno de disponibilidade (F03 — ADR-028 Fase 2).
 *
 * Fonte ÚNICA de disponibilidade para a IA: expõe os slots calculados pelo
 * helper partilhado `resolveAvailableSlots` (a mesma lógica F02-extendida que
 * o painel/PWA usa via `getAvailableSlots`), garantindo paridade.
 *
 * Autenticado por X-Service-Token (não JWT). `tenantId` vem na query, não em
 * req.user — tal como as outras rotas `/api/internal/*`. Nunca exposto em
 * `/api/v1`.
 */

import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import Tenant from '../models/Tenant.js';
import { getTenantDB } from '../config/tenantDB.js';
import { getModels } from '../models/registry.js';
import { resolveAvailableSlots } from './scheduleController.js';
import logger from '../utils/logger.js';

const TIMEZONE = 'Europe/Lisbon';
const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;
const DEFAULT_DURATION = 60;

// Indexado por dayOfWeek Mongoose (0=Domingo .. 6=Sábado).
const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Mirror local de `resolveTenantContext` (clienteInternalRoutes) — a função lá
// é uma closure não-exportada, por isso é copiada aqui (spec §2).
async function resolveTenantContext(tenantId) {
  if (!tenantId || !mongoose.Types.ObjectId.isValid(String(tenantId))) {
    const err = new Error('tenantId inválido');
    err.statusCode = 400;
    throw err;
  }
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) {
    const err = new Error('Tenant não encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (!['ativo', 'trial'].includes(tenant.plano?.status)) {
    const err = new Error('Plano inactivo');
    err.statusCode = 403;
    throw err;
  }
  return { tenant, models: getModels(getTenantDB(String(tenant._id))) };
}

// Valida "YYYY-MM-DD" (estrito) e devolve o DateTime no início do dia, ou 400.
function parseDateParam(value, campo) {
  const dt = DateTime.fromFormat(String(value), 'yyyy-MM-dd', { zone: TIMEZONE });
  if (!dt.isValid) {
    const err = new Error(`${campo}: formato inválido (YYYY-MM-DD)`);
    err.statusCode = 400;
    throw err;
  }
  return dt.startOf('day');
}

// Resolve o conjunto de datas: `date` (dia único) | `from`/`to` (intervalo) |
// janela `today..today+days` (default).
function resolveDays({ date, from, to, daysNum }) {
  if (date) {
    return [parseDateParam(date, 'date')];
  }
  if (from || to) {
    if (!from || !to) {
      const err = new Error('from e to são ambos obrigatórios para um intervalo');
      err.statusCode = 400;
      throw err;
    }
    const start = parseDateParam(from, 'from');
    const end = parseDateParam(to, 'to');
    if (end < start) {
      const err = new Error('to anterior a from');
      err.statusCode = 400;
      throw err;
    }
    // Math.round (não floor): no spring-forward DST o dia tem 23h e o diff dá
    // ~0.958 — floor cortaria o dia `to` do intervalo silenciosamente.
    const count = Math.round(end.diff(start, 'days').days) + 1;
    if (count > MAX_DAYS) {
      const err = new Error(`intervalo demasiado grande (máx ${MAX_DAYS} dias)`);
      err.statusCode = 400;
      throw err;
    }
    return Array.from({ length: count }, (_, i) => start.plus({ days: i }));
  }
  const today = DateTime.now().setZone(TIMEZONE).startOf('day');
  // Semântica: hoje + N dias à frente (inclusivo) — mas nunca mais do que
  // MAX_DAYS datas no total, para ser consistente com o cap do caminho from/to
  // (sem isto, days=30 devolvia 31 datas).
  return Array.from({ length: Math.min(daysNum + 1, MAX_DAYS) }, (_, i) => today.plus({ days: i }));
}

/**
 * @desc  Slots disponíveis para a IA propor (fonte única de disponibilidade).
 * @route GET /api/internal/disponibilidade
 * @auth  X-Service-Token
 * @query tenantId (obrigatório), date | from/to | days (default 7, max 30), duration (default 60)
 */
export const getDisponibilidadeInterna = async (req, res) => {
  try {
    const { tenantId, date, from, to, duration } = req.query;

    const { tenant, models } = await resolveTenantContext(tenantId);
    const interval = tenant?.configuracoes?.intervaloEntreSessoes || 0;

    const durationNum = Math.max(1, parseInt(duration, 10) || DEFAULT_DURATION);
    const daysNum = Math.min(MAX_DAYS, Math.max(1, parseInt(req.query.days, 10) || DEFAULT_DAYS));
    const dates = resolveDays({ date, from, to, daysNum });

    // Empty-but-flagged: tenant sem NENHUM Schedule → 200 scheduleConfigured:false,
    // nunca um 4xx/5xx (a IA nunca inventa horários).
    const scheduleConfigured = Boolean(await models.Schedule.exists({ tenantId }));
    if (!scheduleConfigured) {
      return res.status(200).json({
        success: true,
        data: { tenantId, timezone: TIMEZONE, duration: durationNum, scheduleConfigured: false, days: [] },
      });
    }

    const days = await Promise.all(dates.map(async (dt) => {
      const isoDate = dt.toISODate();
      const result = await resolveAvailableSlots({
        Schedule: models.Schedule,
        ScheduleException: models.ScheduleException,
        Agendamento: models.Agendamento,
        tenantId,
        date: isoDate,
        duration: durationNum,
        interval,
      });
      const dow = dt.weekday === 7 ? 0 : dt.weekday;
      return {
        date: isoDate,
        weekday: WEEKDAY_LABELS[dow],
        isException: result.isException,
        exceptionType: result.exceptionType,
        slots: result.slots,
      };
    }));

    res.status(200).json({
      success: true,
      data: { tenantId, timezone: TIMEZONE, duration: durationNum, scheduleConfigured: true, days },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    logger.error({ err: err.message, stack: err.stack }, '[internal] GET /disponibilidade');
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

export default { getDisponibilidadeInterna };
