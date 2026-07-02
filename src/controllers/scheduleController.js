import { DateTime } from 'luxon';
import Tenant from '../models/Tenant.js';

/**
 * @desc    Garante que os 7 dias da semana existem na base de dados para o tenant.
 */
const initializeSchedules = async (Schedule, tenantId) => {
  const daysOfWeek = [
    { dayOfWeek: 0, label: 'Domingo' }, { dayOfWeek: 1, label: 'Segunda-feira' },
    { dayOfWeek: 2, label: 'Terça-feira' }, { dayOfWeek: 3, label: 'Quarta-feira' },
    { dayOfWeek: 4, label: 'Quinta-feira' }, { dayOfWeek: 5, label: 'Sexta-feira' },
    { dayOfWeek: 6, label: 'Sábado' },
  ];
  // Upsert atómico ($setOnInsert): o antigo findOne→create tinha uma corrida
  // check-then-act que, sob o índice único { tenantId, dayOfWeek } (F03),
  // rebentava com E11000 em pedidos concorrentes do primeiro acesso de um
  // tenant. Um E11000 residual (corrida de upserts concorrentes) é benigno —
  // significa que o doc já existe — e é ignorado.
  await Promise.all(daysOfWeek.map((day) =>
    Schedule.updateOne(
      { dayOfWeek: day.dayOfWeek, tenantId },
      { $setOnInsert: { ...day, tenantId } },
      { upsert: true }
    ).catch((err) => {
      if (err?.code !== 11000) throw err;
    })
  ));
};

// Função auxiliar para converter hora string (HH:mm) para minutos desde a meia-noite
const timeToMinutes = (timeString) => {
  if (!timeString) return null;
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

// Função auxiliar para converter minutos para hora string (HH:mm)
const minutesToTime = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * @desc  Helper puro (F03) — calcula os slots disponíveis para UMA data,
 *        aplicando a lógica F02-extendida: horário base do dia da semana
 *        + precedência da excepção por data (`fechado` → sem slots;
 *        `horas-extra`/`horario-especial` → janela da excepção) + pausa
 *        do dia base + agendamentos existentes.
 *
 *        É a ÚNICA fonte de cálculo de slots no backend: usada tanto pelo
 *        handler legado `getAvailableSlots` (rota do painel/PWA) como pelo
 *        endpoint interno `/api/internal/disponibilidade` que a IA consome.
 *        Garante paridade (mesmos slots para o mesmo tenant/data/duração).
 *
 * @param {object}  args
 * @param {import('mongoose').Model} args.Schedule
 * @param {import('mongoose').Model} args.ScheduleException
 * @param {import('mongoose').Model} args.Agendamento
 * @param {string}  args.tenantId
 * @param {string}  args.date       — "YYYY-MM-DD" (assume já validada)
 * @param {number}  args.duration   — duração do serviço em minutos (default 60)
 * @param {number}  args.interval   — minutos de arrumação reservados após cada sessão (default 0)
 * @returns {Promise<{ slots: string[], isException: boolean, exceptionType: (string|null), hasBaseSchedule: boolean, baseActive: boolean }>}
 */
export const resolveAvailableSlots = async ({ Schedule, ScheduleException, Agendamento, tenantId, date, duration = 60, interval = 0 }) => {
  const targetDate = DateTime.fromISO(date, { zone: 'Europe/Lisbon' });
  const dayOfWeek = targetDate.weekday === 7 ? 0 : targetDate.weekday; // Luxon: 1=Seg..7=Dom → Mongoose: 0=Dom..6=Sab
  const dateKey = targetDate.toISODate(); // "YYYY-MM-DD"

  // Queries independentes em paralelo (regra "queries paralelas").
  // Excepção por data tem PRECEDÊNCIA sobre o horário base (F02).
  const [schedule, excecao] = await Promise.all([
    Schedule.findOne({ dayOfWeek, tenantId }),
    ScheduleException.findOne({ tenantId, data: dateKey }),
  ]);

  const hasBaseSchedule = Boolean(schedule);
  const baseActive = Boolean(schedule && schedule.isActive);

  // A pausa vem sempre do dia base (aplica-se também às janelas de excepção).
  const breakStartMinutes = schedule ? timeToMinutes(schedule.breakStartTime) : null;
  const breakEndMinutes = schedule ? timeToMinutes(schedule.breakEndTime) : null;

  let startWorkMinutes;
  let endWorkMinutes;
  let isException = false;
  let exceptionType = null;

  if (excecao) {
    isException = true;
    exceptionType = excecao.tipo;
    if (excecao.tipo === 'fechado') {
      return { slots: [], isException: true, exceptionType: 'fechado', hasBaseSchedule, baseActive };
    }
    // horas-extra / horario-especial → a janela da excepção substitui a base.
    startWorkMinutes = timeToMinutes(excecao.inicio);
    endWorkMinutes = timeToMinutes(excecao.fim);
    // Guarda defensiva: uma excepção não-fechado com janela incompleta
    // (inicio/fim null — só possível por escrita directa na BD, o Zod da API
    // bloqueia) geraria slots-fantasma desde a meia-noite (null coage a 0 no
    // loop). Sem janela válida → sem slots.
    if (startWorkMinutes === null || endWorkMinutes === null) {
      return { slots: [], isException: true, exceptionType: excecao.tipo, hasBaseSchedule, baseActive };
    }
  } else {
    if (!baseActive) {
      return { slots: [], isException: false, exceptionType: null, hasBaseSchedule, baseActive };
    }
    startWorkMinutes = timeToMinutes(schedule.startTime);
    endWorkMinutes = timeToMinutes(schedule.endTime);
  }

  const existingAgendamentos = await Agendamento.find({
    tenantId,
    dataHora: {
      $gte: targetDate.startOf('day').toJSDate(),
      $lte: targetDate.endOf('day').toJSDate(),
    },
    status: { $in: ['Agendado', 'Confirmado'] },
    'confirmacao.tipo': { $ne: 'rejeitado' }
  });

  // Cada agendamento reserva a sessão + a arrumação a seguir.
  const dur = Number(duration);
  const gap = Number(interval) || 0;
  const step = dur + gap;

  const reserved = existingAgendamentos
    .map((ag) => {
      const start = timeToMinutes(DateTime.fromJSDate(ag.dataHora, { zone: 'Europe/Lisbon' }).toFormat('HH:mm'));
      return { start, end: start + dur + gap };
    })
    .sort((a, b) => a.start - b.start);

  // Para HOJE, não propor horas já passadas (paridade com o antigo guard
  // Python `if slot < now_naive: continue`, removido no rewire F03 — sem
  // isto a IA proporia 09:00 às 15:00 do próprio dia).
  const agora = DateTime.now().setZone('Europe/Lisbon');
  const nowMinutes = dateKey === agora.toISODate() ? agora.hour * 60 + agora.minute : null;

  // Blocos de trabalho: a pausa (se dentro da janela) divide o dia em manhã/tarde.
  const blocks = [];
  const hasBreak =
    breakStartMinutes !== null && breakEndMinutes !== null &&
    breakStartMinutes >= startWorkMinutes && breakEndMinutes <= endWorkMinutes &&
    breakStartMinutes < breakEndMinutes;
  if (hasBreak) {
    if (breakStartMinutes > startWorkMinutes) blocks.push([startWorkMinutes, breakStartMinutes]);
    if (breakEndMinutes < endWorkMinutes) blocks.push([breakEndMinutes, endWorkMinutes]);
  } else {
    blocks.push([startWorkMinutes, endWorkMinutes]);
  }

  const slots = [];
  for (const [blockStart, blockEnd] of blocks) {
    let cursor = blockStart;
    while (cursor + dur <= blockEnd) {
      const slotEnd = cursor + dur;
      if (nowMinutes !== null && cursor <= nowMinutes) { cursor += step; continue; }
      // Colisão com uma marcação real (sessão + arrumação) → saltar e reancorar no fim dela.
      // Simétrico: a arrumação DO PRÓPRIO candidato (slotEnd + gap) também não
      // pode invadir a marcação seguinte — senão o helper oferece um slot que
      // o booking depois rejeita com 409 (arrumação insuficiente antes da marcação real).
      const hit = reserved.find((r) => cursor < r.end && (slotEnd + gap) > r.start);
      if (hit) { cursor = hit.end; continue; }
      slots.push(minutesToTime(cursor));
      cursor += step;
    }
  }

  return { slots, isException, exceptionType, hasBaseSchedule, baseActive };
};

/**
 * @desc    Buscar todos os horários e agendamentos da semana.
 * @route   GET /api/schedules
 */
export const getSchedules = async (req, res) => {
  try {
    const { Schedule, Agendamento } = req.models;
    await initializeSchedules(Schedule, req.tenantId);

    const schedules = await Schedule.find({ tenantId: req.tenantId }).sort({ dayOfWeek: 'asc' });

    const inicioSemana = DateTime.now().setZone('Europe/Lisbon').startOf('day').toJSDate();
    const fimSemana = DateTime.now().setZone('Europe/Lisbon').plus({ days: 7 }).endOf('day').toJSDate();

    const agendamentosExistentes = await Agendamento.find({
      tenantId: req.tenantId,
      dataHora: { $gte: inicioSemana, $lte: fimSemana },
      status: { $in: ['Agendado', 'Confirmado'] },
      'confirmacao.tipo': { $ne: 'rejeitado' }
    }).populate('cliente', 'nome telefone');

    res.status(200).json({
      disponibilidade: schedules,
      agendamentos: agendamentosExistentes,
    });
  } catch (error) {
    console.error('Erro em getSchedules:', error);
    res.status(500).json({ message: 'Erro ao buscar horários' });
  }
};

/**
 * @desc    Calcula e retorna os slots de horários disponíveis para um determinado dia.
 * @route   GET /api/schedules/available-slots
 * @query   date (YYYY-MM-DD)
 * @query   duration (duração do serviço em minutos, padrão 60)
 */
export const getAvailableSlots = async (req, res) => {
  try {
    const { Schedule, ScheduleException, Agendamento } = req.models;
    const { date, duration = 60 } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'A data (YYYY-MM-DD) é obrigatória.' });
    }

    const targetDate = DateTime.fromISO(date, { zone: 'Europe/Lisbon' });
    if (!targetDate.isValid) {
      return res.status(400).json({ message: 'Formato de data inválido. Use YYYY-MM-DD.' });
    }

    const tenantDoc = await Tenant.findById(req.tenantId).select('configuracoes.intervaloEntreSessoes').lean();
    const interval = tenantDoc?.configuracoes?.intervaloEntreSessoes || 0;

    // Cálculo delegado ao helper partilhado (F03) — mesma fonte que o
    // endpoint interno da IA, garantindo paridade.
    const result = await resolveAvailableSlots({
      Schedule, ScheduleException, Agendamento,
      tenantId: req.tenantId, date, duration, interval,
    });

    // Mensagens informativas do contrato legado (preservadas).
    if (result.slots.length === 0) {
      if (result.isException && result.exceptionType === 'fechado') {
        return res.status(200).json({ availableSlots: [], message: 'Dia fechado (excepção).' });
      }
      if (!result.isException && !result.baseActive) {
        return res.status(200).json({ availableSlots: [], message: 'O salão não está ativo para agendamentos neste dia.' });
      }
    }

    res.status(200).json({ availableSlots: result.slots });

  } catch (error) {
    console.error('Erro em getAvailableSlots:', error);
    res.status(500).json({ message: 'Erro ao buscar slots disponíveis' });
  }
};

/**
 * @desc    Atualizar um horário específico.
 * @route   PUT /api/schedules/:dayOfWeek
 */
export const updateSchedule = async (req, res) => {
  try {
    const { Schedule } = req.models;
    const { dayOfWeek } = req.params;
    const { isActive, startTime, endTime, breakStartTime, breakEndTime, observacao } = req.body;

    // Só actualiza os campos presentes (evita apagar com undefined).
    const update = {};
    if (isActive !== undefined) update.isActive = isActive;
    if (startTime !== undefined) update.startTime = startTime;
    if (endTime !== undefined) update.endTime = endTime;
    if (breakStartTime !== undefined) update.breakStartTime = breakStartTime;
    if (breakEndTime !== undefined) update.breakEndTime = breakEndTime;
    if (observacao !== undefined) update.observacao = observacao;

    const updatedSchedule = await Schedule.findOneAndUpdate(
      { dayOfWeek, tenantId: req.tenantId },
      update,
      { new: true, runValidators: true }
    );

    if (!updatedSchedule) {
      return res.status(404).json({ message: 'Dia da semana não encontrado' });
    }

    res.status(200).json(updatedSchedule);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    console.error('Erro em updateSchedule:', error);
    res.status(500).json({ message: 'Erro ao atualizar horário' });
  }
};

// ============================================================
// Excepções de disponibilidade por data (F02 — ADR-028 Fase 1)
// Endpoints NOVOS → contrato canónico { success, data/error }.
// ============================================================

// Normaliza inicio/fim conforme o tipo (fechado → null).
const normalizeJanela = ({ tipo, inicio, fim }) => (
  tipo === 'fechado'
    ? { inicio: null, fim: null }
    : { inicio: inicio ?? null, fim: fim ?? null }
);

/**
 * @desc  Listar excepções do tenant (qualquer staff autenticado).
 * @route GET /api/schedules/excecoes?from=&to=
 */
export const listarExcecoes = async (req, res) => {
  try {
    const { ScheduleException } = req.models;
    const { from, to } = req.query;

    const filtro = { tenantId: req.tenantId };
    if (from || to) {
      filtro.data = {};
      if (from) filtro.data.$gte = from;
      if (to) filtro.data.$lte = to;
    }

    // Máximo 100 por página (convenção do projecto). O frontend consulta sempre
    // por janela from/to (~1 mês), pelo que na prática o limite nunca é atingido.
    const excecoes = await ScheduleException.find(filtro).sort({ data: 'asc' }).limit(100);
    res.status(200).json({ success: true, data: excecoes });
  } catch (error) {
    console.error('Erro em listarExcecoes:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

/**
 * @desc  Criar excepção (admin/gerente).
 * @route POST /api/schedules/excecoes
 */
export const criarExcecao = async (req, res) => {
  try {
    const { ScheduleException } = req.models;
    const { data, tipo, inicio, fim, observacao } = req.body;
    const janela = normalizeJanela({ tipo, inicio, fim });

    // Pré-verificação (uma excepção por data). O índice único garante a corrida.
    const existente = await ScheduleException.findOne({ tenantId: req.tenantId, data });
    if (existente) {
      return res.status(409).json({ success: false, error: 'Já existe uma excepção para esta data' });
    }

    const excecao = await ScheduleException.create({
      tenantId: req.tenantId, // do JWT, nunca do body
      data,
      tipo,
      inicio: janela.inicio,
      fim: janela.fim,
      observacao: observacao ?? '',
    });

    res.status(201).json({ success: true, data: excecao });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'Já existe uma excepção para esta data' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Erro em criarExcecao:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

/**
 * @desc  Actualizar excepção (admin/gerente). Tenant-scoped → 404 cross-tenant.
 * @route PUT /api/schedules/excecoes/:id
 */
export const actualizarExcecao = async (req, res) => {
  try {
    const { ScheduleException } = req.models;
    const { id } = req.params;
    const { data, tipo, inicio, fim, observacao } = req.body;
    const janela = normalizeJanela({ tipo, inicio, fim });

    const update = { tipo, inicio: janela.inicio, fim: janela.fim };
    if (data !== undefined) update.data = data;
    if (observacao !== undefined) update.observacao = observacao;

    const excecao = await ScheduleException.findOneAndUpdate(
      { _id: id, tenantId: req.tenantId },
      update,
      { new: true, runValidators: true }
    );

    if (!excecao) {
      return res.status(404).json({ success: false, error: 'Excepção não encontrada' });
    }

    res.status(200).json({ success: true, data: excecao });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'Já existe uma excepção para esta data' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Erro em actualizarExcecao:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

/**
 * @desc  Remover excepção (admin/gerente). Tenant-scoped → 404 cross-tenant.
 * @route DELETE /api/schedules/excecoes/:id
 */
export const removerExcecao = async (req, res) => {
  try {
    const { ScheduleException } = req.models;
    const { id } = req.params;

    const excecao = await ScheduleException.findOneAndDelete({ _id: id, tenantId: req.tenantId });
    if (!excecao) {
      return res.status(404).json({ success: false, error: 'Excepção não encontrada' });
    }

    res.status(200).json({ success: true, data: { _id: excecao._id } });
  } catch (error) {
    console.error('Erro em removerExcecao:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
};
