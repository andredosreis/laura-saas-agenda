import { DateTime } from 'luxon';

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
  await Promise.all(daysOfWeek.map(async (day) => {
    const existing = await Schedule.findOne({ dayOfWeek: day.dayOfWeek, tenantId });
    if (!existing) {
      await Schedule.create({ ...day, tenantId });
    }
  }));
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
    const { Schedule, Agendamento } = req.models;
    const { date, duration = 60 } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'A data (YYYY-MM-DD) é obrigatória.' });
    }

    const targetDate = DateTime.fromISO(date, { zone: 'Europe/Lisbon' });
    if (!targetDate.isValid) {
      return res.status(400).json({ message: 'Formato de data inválido. Use YYYY-MM-DD.' });
    }

    const dayOfWeek = targetDate.weekday === 7 ? 0 : targetDate.weekday; // Luxon: 1=Seg, ..., 7=Dom. Mongoose: 0=Dom, ..., 6=Sab
    const dateKey = targetDate.toISODate(); // "YYYY-MM-DD"

    const { ScheduleException } = req.models;
    const schedule = await Schedule.findOne({ dayOfWeek, tenantId: req.tenantId });
    // Excepção por data tem PRECEDÊNCIA sobre o horário base (F02).
    const excecao = await ScheduleException.findOne({ tenantId: req.tenantId, data: dateKey });

    let startWorkMinutes;
    let endWorkMinutes;
    // A pausa vem sempre do dia base (aplica-se também às janelas de excepção).
    const breakStartMinutes = schedule ? timeToMinutes(schedule.breakStartTime) : null;
    const breakEndMinutes = schedule ? timeToMinutes(schedule.breakEndTime) : null;

    if (excecao) {
      if (excecao.tipo === 'fechado') {
        return res.status(200).json({ availableSlots: [], message: 'Dia fechado (excepção).' });
      }
      // horas-extra / horario-especial → a janela da excepção substitui a base.
      startWorkMinutes = timeToMinutes(excecao.inicio);
      endWorkMinutes = timeToMinutes(excecao.fim);
    } else {
      if (!schedule || !schedule.isActive) {
        return res.status(200).json({ availableSlots: [], message: 'O salão não está ativo para agendamentos neste dia.' });
      }
      startWorkMinutes = timeToMinutes(schedule.startTime);
      endWorkMinutes = timeToMinutes(schedule.endTime);
    }

    const existingAgendamentos = await Agendamento.find({
      tenantId: req.tenantId,
      dataHora: {
        $gte: targetDate.startOf('day').toJSDate(),
        $lte: targetDate.endOf('day').toJSDate(),
      },
      status: { $in: ['Agendado', 'Confirmado'] },
      'confirmacao.tipo': { $ne: 'rejeitado' }
    });

    const occupiedSlots = existingAgendamentos.map(ag => {
      const agendamentoStart = DateTime.fromJSDate(ag.dataHora, { zone: 'Europe/Lisbon' });
      const agendamentoStartMinutes = timeToMinutes(agendamentoStart.toFormat('HH:mm'));
      const agendamentoEndMinutes = agendamentoStartMinutes + Number(duration);
      return { start: agendamentoStartMinutes, end: agendamentoEndMinutes };
    });

    const availableSlots = [];
    for (let time = startWorkMinutes; time < endWorkMinutes; time += Number(duration)) {
      const slotEnd = time + Number(duration);

      if (slotEnd > endWorkMinutes) continue;

      if (breakStartMinutes !== null && breakEndMinutes !== null) {
        if ((time < breakEndMinutes && slotEnd > breakStartMinutes)) {
          continue;
        }
      }

      const isOccupied = occupiedSlots.some(occupied => {
        return (time < occupied.end && slotEnd > occupied.start);
      });

      if (!isOccupied) {
        availableSlots.push(minutesToTime(time));
      }
    }

    res.status(200).json({ availableSlots });

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

    const excecoes = await ScheduleException.find(filtro).sort({ data: 'asc' });
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
