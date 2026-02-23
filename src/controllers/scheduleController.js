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
      status: { $in: ['Agendado', 'Confirmado'] }
    }).populate('cliente', 'nome telefone');

    res.status(200).json({
      disponibilidade: schedules,
      agendamentos: agendamentosExistentes,
    });
  } catch (error) {
    console.error('Erro em getSchedules:', error);
    res.status(500).json({ message: 'Erro ao buscar horários', error: error.message });
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

    const schedule = await Schedule.findOne({ dayOfWeek, tenantId: req.tenantId });

    if (!schedule || !schedule.isActive) {
      return res.status(200).json({ availableSlots: [], message: 'O salão não está ativo para agendamentos neste dia.' });
    }

    const startWorkMinutes = timeToMinutes(schedule.startTime);
    const endWorkMinutes = timeToMinutes(schedule.endTime);
    const breakStartMinutes = timeToMinutes(schedule.breakStartTime);
    const breakEndMinutes = timeToMinutes(schedule.breakEndTime);

    const existingAgendamentos = await Agendamento.find({
      tenantId: req.tenantId,
      dataHora: {
        $gte: targetDate.startOf('day').toJSDate(),
        $lte: targetDate.endOf('day').toJSDate(),
      },
      status: { $in: ['Agendado', 'Confirmado'] }
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
    res.status(500).json({ message: 'Erro ao buscar slots disponíveis', error: error.message });
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
    const { isActive, startTime, endTime, breakStartTime, breakEndTime } = req.body;

    const updatedSchedule = await Schedule.findOneAndUpdate(
      { dayOfWeek, tenantId: req.tenantId },
      { isActive, startTime, endTime, breakStartTime, breakEndTime },
      { new: true, runValidators: true }
    );

    if (!updatedSchedule) {
      return res.status(404).json({ message: 'Dia da semana não encontrado' });
    }

    res.status(200).json(updatedSchedule);
  } catch (error) {
    console.error('Erro em updateSchedule:', error);
    res.status(500).json({ message: 'Erro ao atualizar horário', error: error.message });
  }
};
