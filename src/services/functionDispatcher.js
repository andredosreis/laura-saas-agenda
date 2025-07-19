// src/services/functionDispatcher.js
const Cliente     = require('../models/Cliente');
const Agendamento = require('../models/Agendamento');
const Pacote      = require('../models/Pacote');

/**
 * Executa a função solicitada pela LLM.
 * @param {string} name – nome da função (de functionsSchema.json)
 * @param {object} args – argumentos fornecidos pela LLM
 */
async function dispatch(name, args) {
  switch (name) {
    case 'create_client':
      // aqui chamas o teu método de criar cliente no BD
      return Cliente.create({
        nome: args.name,
        telefone: args.phone,
        dataNascimento: new Date(args.birthDate),
      });

    case 'create_appointment':
      // mapeia para o teu agendamento
      return Agendamento.create({
        cliente:     args.client_id,
        pacote:      args.package_id,
        dataHora:    new Date(args.slot_id),   // ou outra lógica de slot
        status: 'Agendado',
      });

    case 'update_appointment':
      // reschedule ou cancel
      if (args.action === 'reschedule') {
        return Agendamento.findByIdAndUpdate(
          args.appointment_id,
          { dataHora: new Date(args.new_slot_id), status: 'Reagendado' },
          { new: true }
        );
      } else { // cancel
        return Agendamento.findByIdAndUpdate(
          args.appointment_id,
          { status: 'Cancelado' },
          { new: true }
        );
      }

    case 'find_packages':
      return Pacote.find({ ativo: true }).lean();

    // adiciona outros casos conforme o teu schema…

    default:
      throw new Error(`Função desconhecida no dispatcher: ${name}`);
  }
}

module.exports = { dispatch };
