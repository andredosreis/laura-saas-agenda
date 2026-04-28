import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  { message: 'ID inválido' }
);

// Roles aceites para colaboradores. superadmin é tratado no controller (só
// superadmin pode criar superadmin).
const roleEnum = z.enum(['superadmin', 'admin', 'gerente', 'recepcionista', 'terapeuta']);

// Schema das permissões granulares — espelha User.permissoes
const permissoesSchema = z
  .object({
    verClientes: z.boolean().optional(),
    criarClientes: z.boolean().optional(),
    editarClientes: z.boolean().optional(),
    deletarClientes: z.boolean().optional(),
    verAgendamentos: z.boolean().optional(),
    criarAgendamentos: z.boolean().optional(),
    editarAgendamentos: z.boolean().optional(),
    deletarAgendamentos: z.boolean().optional(),
    verPacotes: z.boolean().optional(),
    criarPacotes: z.boolean().optional(),
    editarPacotes: z.boolean().optional(),
    deletarPacotes: z.boolean().optional(),
    verFinanceiro: z.boolean().optional(),
    editarConfiguracoes: z.boolean().optional(),
    gerenciarUsuarios: z.boolean().optional(),
  })
  .partial();

const dadosBancariosSchema = z
  .object({
    titular: z.string().trim().max(120).optional(),
    iban: z.string().trim().max(50).optional(),
    banco: z.string().trim().max(120).optional(),
  })
  .partial();

// Sem .strict() — injectTenant adiciona tenantId ao body
export const criarColaboradorSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: roleEnum,
  telefone: z.string().trim().max(30).optional(),
  permissoes: permissoesSchema.optional(),
  comissaoPadrao: z.number().min(0).max(100).optional(),
  dadosBancarios: dadosBancariosSchema.optional(),
});

export const atualizarColaboradorSchema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  role: roleEnum.optional(),
  telefone: z.string().trim().max(30).optional(),
  permissoes: permissoesSchema.optional(),
  comissaoPadrao: z.number().min(0).max(100).optional(),
  dadosBancarios: dadosBancariosSchema.optional(),
  // email não é actualizável aqui — fluxo separado caso necessário no futuro
});

export const idParamSchema = z.object({
  id: objectId,
});
