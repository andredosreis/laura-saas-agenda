import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  { message: 'ID inválido' }
);

const telefone = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 9 && v.length <= 15, {
    message: 'Telefone deve ter entre 9 e 15 dígitos',
  });

const leadSchema = z
  .object({
    nome: z.string().trim().min(1, 'Nome do lead é obrigatório').max(100),
    telefone,
    email: z.string().trim().toLowerCase().email().optional(),
  })
  .strict();

const tipoEnum = z.enum(['Sessao', 'Retorno', 'Avaliacao']);

// Alinhado com enum em src/models/Agendamento.js
const statusEnum = z.enum([
  'Agendado',
  'Confirmado',
  'Compareceu',
  'Realizado',
  'Fechado',
  'Avaliacao',
  'Cancelado Pelo Cliente',
  'Cancelado Pelo Salão',
  'Não Compareceu',
]);

export const createAgendamentoSchema = z
  .object({
    tipo: tipoEnum.optional(),
    cliente: objectId.optional(),
    lead: leadSchema.optional(),
    dataHora: z.string().min(1, 'dataHora é obrigatória'),
    pacote: objectId.optional().nullable(),
    compraPacote: objectId.optional().nullable(),
    servicoAvulsoNome: z.string().trim().max(200).optional(),
    servicoAvulsoValor: z.number().nonnegative().optional().nullable(),
    profissional: objectId.optional().nullable(),
    observacoes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const updateAgendamentoSchema = z
  .object({
    dataHora: z.string().optional(),
    status: statusEnum.optional(),
    observacoes: z.string().trim().max(1000).optional(),
    profissional: objectId.optional().nullable(),
    servicoAvulsoNome: z.string().trim().max(200).optional(),
    servicoAvulsoValor: z.number().nonnegative().optional().nullable(),
    cliente: objectId.optional().nullable(),
    pacote: objectId.optional().nullable(),
    compraPacote: objectId.optional().nullable(),
    lead: leadSchema.optional(),
    // Campos de pagamento (update após registar transação/pagamento)
    statusPagamento: z.enum(['Pendente', 'Pago', 'Cancelado']).optional(),
    transacao: objectId.optional().nullable(),
    valorCobrado: z.number().nonnegative().optional(),
  })
  .strict();

export const updateStatusSchema = z
  .object({
    status: statusEnum,
  })
  .strict();

export const confirmarAgendamentoSchema = z
  .object({
    confirmacao: z.enum(['confirmado', 'rejeitado']),
    respondidoPor: z.enum(['laura', 'cliente']),
  })
  .strict();

export const comparecimentoSchema = z
  .object({
    compareceu: z.boolean(),
  })
  .strict();

export const fecharPacoteSchema = z
  .object({
    fechou: z.boolean(),
  })
  .strict();

export const registrarPagamentoSchema = z
  .object({
    valor: z.number().positive('Valor deve ser maior que zero'),
    formaPagamento: z.string().trim().min(1, 'Forma de pagamento é obrigatória').max(50),
    dadosMBWay: z.record(z.string(), z.unknown()).optional(),
    dadosMultibanco: z.record(z.string(), z.unknown()).optional(),
    dadosCartao: z.record(z.string(), z.unknown()).optional(),
    dadosTransferencia: z.record(z.string(), z.unknown()).optional(),
    observacoes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const enviarLembreteSchema = z
  .object({
    mensagem: z.string().trim().max(4000).optional(),
  })
  .strict();

export const agendamentoIdParamSchema = z.object({
  id: objectId,
});
