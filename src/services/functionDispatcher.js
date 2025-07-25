// src/services/functionDispatcher.js
const Cliente     = require('../models/Cliente');
const Agendamento = require('../models/Agendamento');

/**
 * Executa a função solicitada pela LLM.
 * @param {string} name – nome da função (de functionsSchema.json)
 * @param {object} args – argumentos fornecidos pela LLM
 * @returns {object} – dados para atualização do fluxo de conversa
 */
async function dispatch(name, args) {
  switch (name) {
    case 'create_client': {
      // Cria um novo cliente temporário no BD
      const cli = await Cliente.create({
        nome: args.name,
        telefone: args.telephone || args.phone,
        dataNascimento: args.dateOfBirth || args.birthDate ? new Date(args.dateOfBirth || args.birthDate) : undefined,
        status: 'testing',
      });
      return {
        clientId: cli._id.toString(),
        updatedDados: { clientId: cli._id.toString() },
        nextState: 'aguardando_agendamento'
      };
    }

    case 'update_client_data': {
      // Atualiza nome, telefone e data de nascimento de cliente existente
      await Cliente.findByIdAndUpdate(
        args.clientId,
        {
          nome: args.name,
          telefone: args.telephone || args.phone,
          dataNascimento: new Date(args.dateOfBirth),
        }
      );
      return {
        clientId: args.clientId,
        updatedDados: {},
        nextState: 'aguardando_agendamento'
      };
    }

    case 'schedule_appointment': {
      // Cria um agendamento para o cliente
      const appt = await Agendamento.create({
        cliente: args.clientId,
        dataHora: new Date(args.datetime),
        status: 'Agendado',
      });
      return {
        appointmentId: appt._id.toString(),
        updatedDados: {},
        nextState: 'fluxo_concluido'
      };
    }

    case 'update_appointment': {
      // Reagenda ou cancela um agendamento
      if (args.action === 'reschedule') {
        const updated = await Agendamento.findByIdAndUpdate(
          args.appointmentId,
          { dataHora: new Date(args.newDateTime), status: 'Reagendado' },
          { new: true }
        );
        return {
          appointmentId: updated._id.toString(),
          updatedDados: {},
          nextState: 'fluxo_concluido'
        };
      }
      const cancelled = await Agendamento.findByIdAndUpdate(
        args.appointmentId,
        { status: 'Cancelado' },
        { new: true }
      );
      return {
        appointmentId: cancelled._id.toString(),
        updatedDados: {},
        nextState: 'fluxo_concluido'
      };
    }

    default:
      throw new Error(`Função desconhecida no dispatcher: ${name}`);
  }
}

module.exports = { dispatch };
