import Cliente from '../models/Cliente.js';
import Agendamento from '../models/Agendamento.js';

/**
 * Executa a função solicitada pela LLM.
 * @param {string} name – nome da função (de functionsSchema.json)
 * @param {object} args – argumentos fornecidos pela LLM
 * @returns {Promise<object>} – dados para atualização do fluxo de conversa
 */
export const dispatch = async (name, args) => {
  console.log(`DISPATCHER: A executar a ferramenta '${name}'...`);

  switch (name) {
    case 'create_client': {
      const cli = await Cliente.create({
        nome: args.name,
        telefone: args.telephone || args.phone,
        dataNascimento: args.dateOfBirth || args.birthDate ? new Date(args.dateOfBirth || args.birthDate) : undefined,
        // status: 'testing', // Sugestão: usar o campo 'etapaConversa' que já existe
        etapaConversa: 'aguardando_agendamento',
      });
      return {
        clientId: cli._id.toString(),
        updatedDados: { clientId: cli._id.toString() },
        nextState: 'aguardando_agendamento'
      };
    }

    case 'update_client_data': {
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
      if (args.action === 'reschedule') {
        const updated = await Agendamento.findByIdAndUpdate(
          args.appointmentId,
          { dataHora: new Date(args.newDateTime), status: 'Agendado' }, // Mudança para 'Agendado' para consistência
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
        { status: 'Cancelado Pelo Cliente' }, // Usar um status mais descritivo
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
};