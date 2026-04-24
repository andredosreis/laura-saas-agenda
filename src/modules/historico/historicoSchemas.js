import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  { message: 'ID inválido' }
);

const trimmedString = (max) => z.string().trim().max(max);
const stringArray = (maxItem) => z.array(z.string().trim().max(maxItem));

// Campos editáveis de HistoricoAtendimento — tenantId/profissional são
// sempre injectados pelo servidor, nunca vêm do body.
const historicoBody = z
  .object({
    cliente: objectId,
    agendamento: objectId.optional().nullable(),
    dataAtendimento: z.coerce.date().optional(),
    servico: trimmedString(200).min(1, 'Serviço é obrigatório'),
    duracaoReal: z.number().int().min(0).max(600).optional().nullable(),
    queixaPrincipal: trimmedString(1000).optional(),
    expectativas: trimmedString(1000).optional(),
    sintomasRelatados: stringArray(200).optional(),
    restricoes: trimmedString(1000).optional(),
    tecnicasUtilizadas: stringArray(200).optional(),
    produtosAplicados: stringArray(200).optional(),
    equipamentosUsados: stringArray(200).optional(),
    areasTrabalhas: stringArray(100).optional(),
    intensidade: z.enum(['', 'Leve', 'Moderada', 'Intensa']).optional(),
    resultadosImediatos: trimmedString(2000).optional(),
    reacoesCliente: trimmedString(1000).optional(),
    orientacoesPassadas: trimmedString(2000).optional(),
    proximosPassos: trimmedString(1000).optional(),
    satisfacaoCliente: z.number().int().min(1).max(5).optional().nullable(),
    observacoesProfissional: trimmedString(2000).optional(),
    fotosAntes: stringArray(500).optional(),
    fotosDepois: stringArray(500).optional(),
    status: z.enum(['Rascunho', 'Finalizado']).optional(),
  })
  .strict();

export const createHistoricoSchema = historicoBody;

export const updateHistoricoSchema = historicoBody.partial().strict();

export const historicoIdParamSchema = z.object({
  id: objectId,
});

export const clienteIdParamSchema = z.object({
  clienteId: objectId,
});
