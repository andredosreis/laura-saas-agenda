import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ConsentLog — prova imutável de consentimento (ADR-031, F01).
 *
 * Vive na BD do tenant (database-per-tenant, via `registry.js`), porque o
 * consentimento é dado à CLÍNICA (responsável pelo tratamento), não ao Marcai.
 *
 * Imutabilidade garantida ao nível da aplicação, tal como `AuditLog`:
 *   - única escrita é via `ConsentLog.record()`
 *   - não existem rotas de update/delete
 *   - `updatedAt` desactivado (só `createdAt`)
 *
 * Modelo de prova v2 (RECONCILIATION R6/R7): além de "quem/quando", guarda
 * QUEM AGIU (`actor`), o HASH DO TEXTO efectivamente apresentado (`textoHash`)
 * e, nas declarações assistidas por funcionário, a `evidencia` que as suporta.
 * `politica_privacidade` NÃO é um tipo de consentimento — a entrega do aviso
 * é registada em `NoticeReceipt`.
 */
const ConsentLogSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },

    tipo: {
      type: String,
      required: true,
      enum: ['dados_saude', 'marketing', 'whatsapp_optin'],
    },
    accao: { type: String, required: true, enum: ['granted', 'withdrawn'] },
    origem: {
      type: String,
      required: true,
      // 'booking' fica reservado para uma futura superfície controlada pelo
      // titular (R8) — hoje nenhuma via o usa.
      enum: ['formulario', 'booking', 'whatsapp', 'painel'],
    },

    // Acção directa do titular (formulário público) vs declaração assistida
    // por funcionário. SEMPRE derivado no servidor, nunca vindo do body.
    actor: { type: String, required: true, enum: ['titular', 'funcionario'] },

    // Obrigatória quando um funcionário regista uma CONCESSÃO em nome do
    // titular (validado no schema Zod da rota). Retiradas dispensam-na —
    // opor-se tem de ser sem fricção (Art. 7(3)).
    evidencia: { type: String, trim: true, default: null },

    // sha256 do texto de consentimento/aviso efectivamente apresentado.
    textoHash: { type: String, required: true },

    // Liga o consentimento ao evento de recolha (ficha F04), quando aplicável.
    fichaTokenId: { type: Schema.Types.ObjectId, ref: 'FichaToken', default: null },

    // Versão da política em vigor no momento do registo (server-derived, R6).
    versao: { type: String, required: true },

    // Funcionário que registou (do JWT). Null no caminho do titular.
    registadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Histórico por cliente
ConsentLogSchema.index({ tenantId: 1, clienteId: 1, createdAt: -1 });
// Última entrada por tipo (consumido por estadoAtual — F02/F09/F10)
ConsentLogSchema.index({ tenantId: 1, tipo: 1, createdAt: -1 });

/** Tipos de consentimento reduzidos por `estadoAtual`. */
export const TIPOS_CONSENTIMENTO = ['dados_saude', 'whatsapp_optin', 'marketing'];

/**
 * Cria uma entrada de consentimento — único ponto de escrita.
 * Não engole erros: quem chama decide como tratar a falha.
 */
ConsentLogSchema.statics.record = function record({
  tenantId,
  clienteId,
  tipo,
  accao,
  origem,
  actor,
  evidencia = null,
  textoHash,
  fichaTokenId = null,
  versao,
  registadoPor = null,
  ip = null,
}) {
  return this.create({
    tenantId,
    clienteId,
    tipo,
    accao,
    origem,
    actor,
    evidencia,
    textoHash,
    fichaTokenId,
    versao,
    registadoPor,
    ip,
  });
};

/**
 * Estado actual do consentimento de um cliente — a ÚNICA derivação do log
 * append-only para "estado corrente" (RECONCILIATION R3).
 *
 * Consumido por F02 (`/clientes/:id/clinico`), F09 (`/consent-estado`) e
 * F10 (`/estado-privacidade`). Nenhuma feature reimplementa esta redução.
 *
 * @returns {Promise<Record<string, {estado: 'granted'|'withdrawn'|'pendente', data: Date|null, versao: string|null, actor: string|null}>>}
 */
ConsentLogSchema.statics.estadoAtual = async function estadoAtual(tenantId, clienteId) {
  // Uma só query, reduzida em memória: o histórico de um cliente é pequeno e
  // o índice { tenantId, clienteId, createdAt } já o devolve ordenado.
  const entradas = await this.find({ tenantId, clienteId })
    .sort({ createdAt: -1 })
    .lean();

  const estado = {};
  for (const tipo of TIPOS_CONSENTIMENTO) {
    const ultima = entradas.find((e) => e.tipo === tipo);
    estado[tipo] = ultima
      ? {
        estado: ultima.accao,
        data: ultima.createdAt,
        versao: ultima.versao,
        actor: ultima.actor,
      }
      : { estado: 'pendente', data: null, versao: null, actor: null };
  }
  return estado;
};

export { ConsentLogSchema };
export default mongoose.model('ConsentLog', ConsentLogSchema);
