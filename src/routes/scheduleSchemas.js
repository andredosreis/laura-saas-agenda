import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  { message: 'ID inválido' }
);

// "YYYY-MM-DD" válido (formato + data real, ex.: rejeita 2026-02-30)
const dataYMD = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, { message: 'Data inválida' });

// "HH:mm" (00:00–23:59)
const horaHM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora deve estar no formato HH:mm');

const observacao = z.string().max(280, 'Máximo 280 caracteres').optional();

const tipo = z.enum(['fechado', 'horas-extra', 'horario-especial'], {
  message: 'Tipo inválido (fechado | horas-extra | horario-especial)',
});

// Regra partilhada: para horas-extra/horario-especial, inicio/fim obrigatórios e inicio < fim.
// Para fechado, inicio/fim são ignorados/forçados a null no controller.
const janelaRule = (obj, ctx) => {
  if (obj.tipo === 'fechado') return;
  if (!obj.inicio) {
    ctx.addIssue({ code: 'custom', path: ['inicio'], message: 'Início é obrigatório para este tipo' });
  }
  if (!obj.fim) {
    ctx.addIssue({ code: 'custom', path: ['fim'], message: 'Fim é obrigatório para este tipo' });
  }
  if (obj.inicio && obj.fim && obj.inicio >= obj.fim) {
    ctx.addIssue({ code: 'custom', path: ['fim'], message: 'Fim deve ser posterior ao início' });
  }
};

export const criarExcecaoSchema = z
  .object({
    data: dataYMD,
    tipo,
    inicio: horaHM.optional().nullable(),
    fim: horaHM.optional().nullable(),
    observacao,
  })
  .strict()
  .superRefine(janelaRule);

export const actualizarExcecaoSchema = z
  .object({
    data: dataYMD.optional(),
    tipo,
    inicio: horaHM.optional().nullable(),
    fim: horaHM.optional().nullable(),
    observacao,
  })
  .strict()
  .superRefine(janelaRule);

export const listarExcecoesQuerySchema = z
  .object({
    from: dataYMD.optional(),
    to: dataYMD.optional(),
  })
  .strict();

export const excecaoIdParamSchema = z.object({
  id: objectId,
});

export const dayOfWeekParamSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
});

// Base weekday update — agora aceita `observacao` além dos campos de horário.
// NÃO usa `.strict()` de propósito: um PWA com bundle antigo em cache pode
// reenviar o documento Mongo inteiro (label, dayOfWeek, _id...); Zod descarta
// silenciosamente as chaves desconhecidas em vez de rejeitar com 400.
export const updateScheduleBodySchema = z.object({
  isActive: z.boolean().optional(),
  startTime: horaHM.optional(),
  endTime: horaHM.optional(),
  breakStartTime: z.union([horaHM, z.literal('')]).optional().nullable(),
  breakEndTime: z.union([horaHM, z.literal('')]).optional().nullable(),
  observacao,
});
