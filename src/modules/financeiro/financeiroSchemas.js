import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  { message: 'ID inválido' }
);

const dinheiro = z.number().nonnegative();
const dinheiroPositivo = z.number().positive('Valor deve ser maior que zero');

// ─── Transações ─────────────────────────────────────────────────────

const tipoTransacao = z.enum(['Receita', 'Despesa', 'Transferencia']);
const statusPagamento = z.enum(['Pago', 'Pendente', 'Parcial', 'Cancelado']);
const formaPagamento = z.string().trim().min(1).max(50);

export const criarTransacaoSchema = z
  .object({
    tipo: tipoTransacao,
    categoria: z.string().trim().min(1).max(100),
    valor: dinheiroPositivo,
    desconto: dinheiro.optional(),
    descricao: z.string().trim().min(1).max(500),
    observacoes: z.string().trim().max(1000).optional(),
    agendamento: objectId.optional().nullable(),
    cliente: objectId.optional().nullable(),
    compraPacote: objectId.optional().nullable(),
    profissional: objectId.optional().nullable(),
    parcelado: z.boolean().optional(),
    numeroParcelas: z.number().int().min(1).max(48).optional(),
    comissao: z
      .object({
        percentual: z.number().min(0).max(100).optional(),
        valor: dinheiro.optional(),
        profissional: objectId.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const atualizarTransacaoSchema = z
  .object({
    categoria: z.string().trim().min(1).max(100).optional(),
    valor: dinheiroPositivo.optional(),
    desconto: dinheiro.optional(),
    descricao: z.string().trim().min(1).max(500).optional(),
    observacoes: z.string().trim().max(1000).optional(),
    statusPagamento: statusPagamento.optional(),
    formaPagamento: formaPagamento.optional(),
  })
  .strict();

export const cancelarTransacaoSchema = z
  .object({
    motivo: z.string().trim().min(1).max(500),
  })
  .strict();

export const registrarPagamentoTransacaoSchema = z
  .object({
    valor: dinheiroPositivo,
    formaPagamento,
    observacoes: z.string().trim().max(1000).optional(),
    dadosMBWay: z.record(z.string(), z.unknown()).optional(),
    dadosMultibanco: z.record(z.string(), z.unknown()).optional(),
    dadosCartao: z.record(z.string(), z.unknown()).optional(),
    dadosTransferencia: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const pagarComissaoSchema = z
  .object({
    dataPagamento: z.coerce.date().optional(),
  })
  .strict();

// ─── Pagamentos ─────────────────────────────────────────────────────

export const atualizarPagamentoSchema = z
  .object({
    observacoes: z.string().trim().max(1000).optional(),
    dadosMBWay: z.record(z.string(), z.unknown()).optional(),
    dadosMultibanco: z.record(z.string(), z.unknown()).optional(),
    dadosCartao: z.record(z.string(), z.unknown()).optional(),
    dadosTransferencia: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const deletarPagamentoSchema = z
  .object({
    motivo: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

// ─── Compra de Pacote ───────────────────────────────────────────────

// ─── Fechamento Mensal ──────────────────────────────────────────────

export const criarFechamentoSchema = z
  .object({
    ano: z.coerce.number().int().min(2020).max(2099),
    mes: z.coerce.number().int().min(1).max(12),
    observacoes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const paramsAnoMesSchema = z
  .object({
    ano: z.coerce.number().int().min(2020).max(2099),
    mes: z.coerce.number().int().min(1).max(12),
  })
  .strict();

export const listarFechamentosSchema = z
  .object({
    ano: z.coerce.number().int().min(2020).max(2099).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .partial();

export const venderPacoteSchema = z
  .object({
    clienteId: objectId,
    pacoteId: objectId,
    valorTotal: dinheiroPositivo.optional(),
    desconto: dinheiro.optional(),
    formaPagamento: formaPagamento.optional().nullable(),
    observacoes: z.string().trim().max(1000).optional(),
    dataCompra: z.coerce.date().optional(),
    motivoRetroactivo: z.string().trim().max(500).optional(),
    diasValidade: z.number().int().positive().optional().nullable(),
    sessoesUsadas: z.number().int().min(0).optional(),
    parcelado: z.boolean().optional(),
    numeroParcelas: z.number().int().min(1).max(48).optional(),
    valorEntrada: dinheiro.optional().nullable(),
    valorPago: dinheiro.optional().nullable(),
    dataProximaParcela: z.coerce.date().optional().nullable(),
  });

export const editarVendaPacoteSchema = z
  .object({
    valorTotal: dinheiroPositivo.optional(),
    desconto: dinheiro.optional(),
    observacoes: z.string().trim().max(1000).optional(),
    formaPagamento: formaPagamento.optional(),
    sessoesUsadas: z.number().int().min(0).optional(),
    sessoesContratadas: z.number().int().positive().optional(),
    diasValidade: z.number().int().positive().optional().nullable(),
  });

export const registrarPagamentoParcelaSchema = z
  .object({
    valor: dinheiroPositivo,
    formaPagamento,
    dataPagamento: z.coerce.date().optional(),
    observacoes: z.string().trim().max(1000).optional(),
    dataProximaParcela: z.coerce.date().optional().nullable(),
  });

// Sem .strict(): as rotas de compra-pacote correm sob injectTenant, que injecta
// req.body.tenantId — um schema strict rejeitá-lo-ia ("Unrecognized key: tenantId").
export const estenderPrazoSchema = z
  .object({
    // Número de dias a acrescentar à validade (alinhado com o frontend e o controller).
    dias: z.number().int().positive('Número de dias deve ser maior que zero'),
    motivo: z.string().trim().max(500).optional(),
  });

// Sem .strict() — ver nota em estenderPrazoSchema (injectTenant adiciona tenantId ao body).
export const cancelarPacoteSchema = z
  .object({
    motivo: z.string().trim().min(1).max(500),
  });

// ─── Caixa ──────────────────────────────────────────────────────────

export const abrirCaixaSchema = z
  .object({
    valorInicial: dinheiro.optional(),
  })
  .strict();

export const sangriaSuprimentoSchema = z
  .object({
    valor: dinheiroPositivo,
    motivo: z.string().trim().min(1).max(500),
    formaPagamento: formaPagamento.optional(),
  })
  .strict();

export const fecharCaixaSchema = z
  .object({
    saldoContado: dinheiro,
    observacoes: z.string().trim().max(1000).optional(),
  })
  .strict();

// ─── Pacotes ────────────────────────────────────────────────────────

export const criarPacoteSchema = z
  .object({
    nome: z.string().trim().min(1).max(200),
    categoria: z.string().trim().min(1, 'Categoria é obrigatória').max(50),
    descricao: z.string().trim().max(1000).optional(),
    // coerce: inputs de formulário (e bundles antigos em cache) podem enviar
    // números como string — aceitar "50"/"10" além de 50/10.
    valor: z.coerce.number().positive('Valor deve ser maior que zero'),
    sessoes: z.coerce.number().int().min(1).max(100),
    validadeDias: z.coerce.number().int().min(1).max(3650).optional(),
    ativo: z.boolean().optional(),
  })
  // .strip() (default do Zod): ignora chaves não-reconhecidas que clientes/PWA
  // em cache reenviam (ex.: tenantId, _id, __v, createdAt) em vez de rejeitar o
  // pedido. O controller lê apenas campos explícitos, logo sem mass-assignment.
  .strip();

export const atualizarPacoteSchema = criarPacoteSchema.partial().strip();

// ─── Params comuns ──────────────────────────────────────────────────

export const idParamSchema = z.object({
  id: objectId,
});

export const clienteIdParamSchema = z.object({
  clienteId: objectId,
});
