import Agendamento from '../models/Agendamento.js';
import Schedule from '../models/Schedule.js'; // Importar o modelo Schedule
import { DateTime } from 'luxon'; // Importar Luxon para manipulação de datas

// Função auxiliar para converter hora string (HH:mm) para minutos desde a meia-noite
const timeToMinutes = (timeString) => {
  if (!timeString) return null;
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

// @desc    Criar novo agendamento
export const createAgendamento = async (req, res) => {
  try {
    const { cliente, dataHora, pacote, servicoAvulsoNome, servicoAvulsoValor } = req.body;

    // 1. Validar se a dataHora é um formato válido e não está no passado (já existe no middleware do modelo, mas reforçar aqui)
    const agendamentoDateTime = DateTime.fromISO(dataHora, { zone: 'America/Sao_Paulo' }); // Usar fuso horário adequado
    if (!agendamentoDateTime.isValid) {
      return res.status(400).json({ message: 'Data e hora do agendamento inválidas.' });
    }
    if (agendamentoDateTime < DateTime.now().setZone('America/Sao_Paulo')) {
      return res.status(400).json({ message: 'Não é possível criar agendamentos com data no passado.' });
    }

    // 2. Obter o dia da semana e o horário do agendamento
    const dayOfWeek = agendamentoDateTime.weekday === 7 ? 0 : agendamentoDateTime.weekday; // Luxon: 1=Seg, ..., 7=Dom. Mongoose: 0=Dom, ..., 6=Sab
    const requestedTimeInMinutes = timeToMinutes(agendamentoDateTime.toFormat('HH:mm'));

    // 3. Buscar a disponibilidade para o dia da semana
    const schedule = await Schedule.findOne({ dayOfWeek });

    if (!schedule || !schedule.isActive) {
      return res.status(400).json({ message: `O salão não está ativo para agendamentos na ${schedule?.label || 'este dia da semana'}.` });
    }

    // 4. Verificar se o horário está dentro do período de trabalho
    const startWorkMinutes = timeToMinutes(schedule.startTime);
    const endWorkMinutes = timeToMinutes(schedule.endTime);

    if (requestedTimeInMinutes < startWorkMinutes || requestedTimeInMinutes >= endWorkMinutes) {
      return res.status(400).json({ message: 'Horário de agendamento fora do expediente de trabalho.' });
    }

    // 5. Verificar se o horário não está dentro do período de pausa
    const breakStartMinutes = timeToMinutes(schedule.breakStartTime);
    const breakEndMinutes = timeToMinutes(schedule.breakEndTime);

    if (breakStartMinutes !== null && breakEndMinutes !== null &&
        requestedTimeInMinutes >= breakStartMinutes && requestedTimeInMinutes < breakEndMinutes) {
      return res.status(400).json({ message: 'Horário de agendamento coincide com o período de pausa.' });
    }

    // 6. Verificar conflito com agendamentos existentes
    const agendamentoDurationMinutes = 60; // Assumindo duração padrão de 1 hora. Ajuste conforme a lógica de pacotes/serviços.
    const requestedEndTimeInMinutes = requestedTimeInMinutes + agendamentoDurationMinutes;

    const conflictingAgendamento = await Agendamento.findOne({
      dataHora: {
        $gte: agendamentoDateTime.minus({ minutes: agendamentoDurationMinutes - 1 }).toJSDate(), // Início do slot anterior
        $lt: agendamentoDateTime.plus({ minutes: agendamentoDurationMinutes - 1 }).toJSDate(), // Fim do slot posterior
      },
      status: { $in: ['Agendado', 'Confirmado'] },
    });

    if (conflictingAgendamento) {
      return res.status(400).json({ message: 'Já existe um agendamento para este horário.' });
    }

    // Se todas as validações passarem, criar o agendamento
    const novoAgendamento = new Agendamento({ cliente, dataHora, pacote, servicoAvulsoNome, servicoAvulsoValor });
    await novoAgendamento.save();
    res.status(201).json(novoAgendamento);
  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Dados inválidos.', details: messages });
    }
    res.status(500).json({ message: 'Erro interno ao criar agendamento.' });
  }
};

// @desc    Listar todos os agendamentos
export const getAllAgendamentos = async (req, res) => {
  try {
    const agendamentos = await Agendamento.find().populate('cliente pacote');
    res.status(200).json(agendamentos);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar agendamentos.', details: error.message });
  }
};

// @desc    Buscar um agendamento por ID
export const getAgendamento = async (req, res) => {
  try {
    const agendamento = await Agendamento.findById(req.params.id).populate('cliente pacote');
    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }
    res.status(200).json(agendamento);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID do agendamento inválido.' });
    }
    res.status(500).json({ message: 'Erro ao buscar agendamento.', details: error.message });
  }
};

// @desc    Atualizar agendamento completo
export const updateAgendamento = async (req, res) => {
  try {
    const agendamento = await Agendamento.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }
    res.status(200).json(agendamento);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Dados inválidos.', details: messages });
    }
    res.status(500).json({ message: 'Erro ao atualizar agendamento.', details: error.message });
  }
};

// @desc    Atualizar status do agendamento
export const updateStatusAgendamento = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: 'O campo status é obrigatório.' });
    }
    const agendamento = await Agendamento.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }
    res.status(200).json(agendamento);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar status.', details: error.message });
  }
};

// @desc    Deletar agendamento
export const deleteAgendamento = async (req, res) => {
  try {
    const agendamento = await Agendamento.findByIdAndDelete(req.params.id);
    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }
    res.status(200).json({ message: 'Agendamento deletado com sucesso.' });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID do agendamento inválido.' });
    }
    res.status(500).json({ message: 'Erro ao deletar agendamento.', details: error.message });
  }
};

