import { DateTime } from 'luxon';
import Schedule from "../models/Schedule.js";
import Agendamento from "../models/Agendamento.js"; // <-- A LINHA CRÍTICA QUE FALTAVA

/**
 * @desc    Garante que os 7 dias da semana existem na base de dados.
 */
const initializeSchedules = async () => {
  const daysOfWeek = [
    { dayOfWeek: 0, label: 'Domingo' }, { dayOfWeek: 1, label: 'Segunda-feira' },
    { dayOfWeek: 2, label: 'Terça-feira' }, { dayOfWeek: 3, label: 'Quarta-feira' },
    { dayOfWeek: 4, label: 'Quinta-feira' }, { dayOfWeek: 5, label: 'Sexta-feira' },
    { dayOfWeek: 6, label: 'Sábado' },
  ];
  await Promise.all(daysOfWeek.map(async (day) => {
    const existing = await Schedule.findOne({ dayOfWeek: day.dayOfWeek });
    if (!existing) {
      await Schedule.create(day);
    }
  }));
};

/**
 * @desc    Buscar todos os horários e agendamentos da semana.
 * @route   GET /api/schedules
 */
export const getSchedules = async (req, res) => {
  try {
    await initializeSchedules();
    const schedules = await Schedule.find({}).sort({ dayOfWeek: 'asc' });
    const inicioSemana = DateTime.now().setZone('Europe/Lisbon').startOf('day').toJSDate();
    const fimSemana = DateTime.now().setZone('Europe/Lisbon').plus({ days: 7 }).endOf('day').toJSDate();
    
    // Esta linha precisa que o 'Agendamento' seja importado
    const agendamentosExistentes = await Agendamento.find({
      dataHora: { $gte: inicioSemana, $lte: fimSemana },
      status: { $in: ['Agendado', 'Confirmado'] }
    }).populate('cliente', 'nome');
    
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
 * @desc    Atualizar um horário específico.
 * @route   PUT /api/schedules/:dayOfWeek
 */
export const updateSchedule = async (req, res) => {
  try {
    const { dayOfWeek } = req.params;
    const { isActive, startTime, endTime, breakStartTime, breakEndTime } = req.body;
    const updatedSchedule = await Schedule.findOneAndUpdate(
      { dayOfWeek },
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