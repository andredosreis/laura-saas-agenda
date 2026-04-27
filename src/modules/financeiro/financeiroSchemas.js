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

export const venderPacoteSchema = z
  .object({
    clienteId: objectId,
    pacoteId: objectId,
    valorTotal: dinheiroPositivo.optional(),
    desconto: dinheiro.optional(),
    formaPagamento: formaPagamento.optional().nullable(),
    observacoes: z.string().trim().max(1000).optional(),
    dataCompra: z.coerce.date().optional(),
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

export const estenderPrazoSchema = z
  .object({
    novoPrazo: z.coerce.date(),
    motivo: z.string().trim().max(500).optional(),
  })
  .strict();

export const cancelarPacoteSchema = z
  .object({
    motivo: z.string().trim().min(1).max(500),
  })
  .strict();

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
    valor: dinheiroPositivo,
    sessoes: z.number().int().min(1).max(100),
    validadeDias: z.number().int().min(1).max(3650).optional(),
    ativo: z.boolean().optional(),
  })
  .strict();

export const atualizarPacoteSchema = criarPacoteSchema.partial().strict();

// ─── Params comuns ──────────────────────────────────────────────────

export const idParamSchema = z.object({
  id: objectId,
});

export const clienteIdParamSchema = z.object({
  clienteId: objectId,
});
