import mongoose from 'mongoose';

const agendamentoSchema = new mongoose.Schema({
  // 🆕 MULTI-TENANT: Identificador do tenant
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'TenantId é obrigatório'],
    index: true
  },
  tipo: {
    type: String,
    enum: ['Avaliacao', 'Sessao', 'Retorno'],
    default: 'Sessao'
  },
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: false
  },
  // Lead data para agendamentos de avaliação (cliente ainda não cadastrado)
  lead: {
    nome:     { type: String, trim: true, default: null },
    telefone: { type: String, trim: true, default: null },
    email:    { type: String, trim: true, lowercase: true, default: null }
  },
  // Quando lead vira cliente após fechar pacote
  clienteConvertido: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    default: null
  },
  pacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pacote',
    required: false
  },
  // Referência à compra do pacote (usado quando cliente comprou pacote)
  compraPacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompraPacote',
    required: false
  },
  dataHora: {
    type: Date,
    required: [true, "A data e hora são obrigatórias."]
  },
  status: {
    type: String,
    enum: ['Agendado', 'Confirmado', 'Compareceu', 'Realizado', 'Fechado', 'Avaliacao', 'Cancelado Pelo Cliente', 'Cancelado Pelo Salão', 'Não Compareceu'],
    default: 'Agendado'
  },
  compareceu: {
    type: Boolean,
    default: null
  },
  fechouPacote: {
    type: Boolean,
    default: null
  },
  observacoes: {
    type: String,
    trim: true,
    default: ''
  },
  servicoAvulsoNome: {
    type: String,
    trim: true,
    default: null
  },
  servicoAvulsoValor: {
    type: Number,
    default: null
  },
  servicoTipo: {
    type: String,
    enum: ['pacote', 'avulso', 'oferta'],
    default: 'pacote',
    index: true
  },
  // F05 (ADR-028 Fase 4) — auditoria de encaixe forçado: preenchido APENAS
  // quando um admin cria um agendamento fora da disponibilidade resolvida com
  // `forcarEncaixe: true`. `autorizadoPor`/`autorizadoEm` são derivados no
  // servidor (req.user / Europe/Lisbon), nunca do body. Sem índice (audit-only).
  encaixe: {
    forcado:       { type: Boolean, default: false },
    motivo:        { type: String, default: null, maxlength: 280 },
    autorizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    autorizadoEm:  { type: Date, default: null },
  },
  confirmacao: {
    tipo: {
      type: String,
      enum: ['pendente', 'confirmado', 'rejeitado'],
      default: 'pendente'
    },
    respondidoEm: {
      type: Date,
      default: null
    },
    respondidoPor: {
      type: String,
      enum: ['cliente', 'laura'],
      default: null
    }
  },

  // 💰 FASE 3: Controle Financeiro
  valorCobrado: {
    type: Number,
    default: null,
    min: [0, 'O valor não pode ser negativo']
  },

  numeroDaSessao: {
    type: Number,
    default: null,
    min: [1, 'Número da sessão deve ser pelo menos 1']
  },

  // Controle financeiro
  transacao: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transacao',
    default: null
  },
  statusPagamento: {
    type: String,
    enum: ['Pendente', 'Pago', 'Cancelado', 'Isento'],
    default: 'Pendente'
  },

  // Profissional que realizou o serviço
  profissional: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // 🤖 IA: marca quando este agendamento foi criado automaticamente
  // pelo agent (Phase 4). Permite à UI mostrar badge "X marcações novas
  // pela IA" e a Laura saber que precisa de confirmar.
  criadoPorIA: {
    type: Boolean,
    default: false,
    index: true
  },
  // Quando a equipa "viu" — clica num botão de acknowledgment.
  // Antes disso, conta para o badge.
  iaAckEm: {
    type: Date,
    default: null
  },

  // GAP-01 fix: campo derivado de `status`. true quando o agendamento ocupa
  // efectivamente um slot (não está cancelado). Usado pelo índice composto
  // único parcial abaixo para tornar a detecção de conflito de slot atómica
  // ao nível da base de dados (em vez de check-then-create com TOCTOU race).
  // MongoDB partial filters não suportam $nin/$in/$ne, daí o campo derivado
  // em vez de filtrar directamente por status.
  ocupaSlot: {
    type: Boolean,
    default: true,
  },

  // Comissão
  comissao: {
    profissional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    percentual: {
      type: Number,
      min: [0, 'Percentual não pode ser negativo'],
      max: [100, 'Percentual não pode ser maior que 100'],
      default: 0
    },
    valor: {
      type: Number,
      min: [0, 'Valor não pode ser negativo'],
      default: 0
    },
    pago: {
      type: Boolean,
      default: false
    },
    dataPagamento: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true
});

agendamentoSchema.index({ dataHora: 1 });
agendamentoSchema.index({ cliente: 1 });
agendamentoSchema.index({ status: 1 });

// 🆕 Phase 2B: Composite indexes for analytics queries
agendamentoSchema.index({ tenantId: 1, status: 1, dataHora: 1 });
agendamentoSchema.index({ tenantId: 1, dataHora: 1 });
agendamentoSchema.index({ tenantId: 1, cliente: 1, status: 1 });

agendamentoSchema.index({ tenantId: 1, tipo: 1 });
agendamentoSchema.index({ tenantId: 1, compareceu: 1, fechouPacote: 1 });

// 💰 Phase 3: Financial indexes
agendamentoSchema.index({ tenantId: 1, compraPacote: 1 });
agendamentoSchema.index({ tenantId: 1, statusPagamento: 1 });
agendamentoSchema.index({ tenantId: 1, profissional: 1, status: 1 });

// GAP-01 fix: índice composto único parcial. Dois agendamentos do mesmo
// tenant não podem coexistir com a mesma `dataHora` exacta enquanto ambos
// ocuparem slot (ou seja, enquanto não estiverem cancelados). Substitui o
// padrão check-then-create (TOCTOU race) por uma garantia atómica da DB:
// `Agendamento.create()` falha com E11000 se houver colisão.
//
// A janela de 60min permanece como detecção best-effort no handler
// (returns 409 cedo quando possível) — o índice cobre a corrida real
// (dois pedidos simultâneos para a mesma dataHora exacta).
agendamentoSchema.index(
  { tenantId: 1, dataHora: 1 },
  {
    unique: true,
    partialFilterExpression: { ocupaSlot: true },
    name: 'tenant_datahora_ocupaslot_unique',
  },
);

const STATUSES_QUE_NAO_OCUPAM_SLOT = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];
const CONFIRMACOES_QUE_NAO_OCUPAM_SLOT = ['rejeitado'];

function calculaOcupaSlot(status, confirmacao) {
  return !STATUSES_QUE_NAO_OCUPAM_SLOT.includes(status) &&
    !CONFIRMACOES_QUE_NAO_OCUPAM_SLOT.includes(confirmacao?.tipo);
}

agendamentoSchema.pre('save', function () {
  if (this.isNew && this.dataHora < new Date()) {
    throw new Error('Não é possível criar agendamentos com data no passado.');
  }
  // GAP-01: deriva ocupaSlot de status antes de persistir.
  this.ocupaSlot = calculaOcupaSlot(this.status, this.confirmacao);
});

// GAP-01: hooks de update para garantir que ocupaSlot acompanha mudanças
// de status feitas via findOneAndUpdate / updateOne (pre('save') não dispara).
// Quando o caller actualiza `status`, recalculamos `ocupaSlot` no mesmo update.
function syncOcupaSlotInUpdate() {
  const update = this.getUpdate() || {};
  const $set = update.$set || update;
  if ($set && (
    Object.prototype.hasOwnProperty.call($set, 'status') ||
    Object.prototype.hasOwnProperty.call($set, 'confirmacao') ||
    Object.prototype.hasOwnProperty.call($set, 'confirmacao.tipo')
  )) {
    const novoStatus = $set.status;
    const novaConfirmacao = $set.confirmacao || { tipo: $set['confirmacao.tipo'] };
    const novoOcupa = calculaOcupaSlot(novoStatus, novaConfirmacao);
    if (update.$set) update.$set.ocupaSlot = novoOcupa;
    else update.ocupaSlot = novoOcupa;
  }
}

agendamentoSchema.pre('findOneAndUpdate', syncOcupaSlotInUpdate);
agendamentoSchema.pre('updateOne', syncOcupaSlotInUpdate);
agendamentoSchema.pre('updateMany', syncOcupaSlotInUpdate);

// Exporta schema para uso no registry (database-per-tenant)
export { agendamentoSchema as AgendamentoSchema };

export default mongoose.model('Agendamento', agendamentoSchema);
