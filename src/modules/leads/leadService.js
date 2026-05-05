/**
 * leadService — lógica pura de negócio do módulo de Leads.
 *
 * Não toca em req/res. Recebe `models` injectados (DB-per-tenant) para evitar
 * acoplamento ao Express e permitir reutilização pelo `ia-service` (Phase 2)
 * via endpoints internos /api/internal/leads/*.
 */

import mongoose from 'mongoose';
import {
  ALLOWED_TRANSITIONS,
  RESTRICTED_DESTINATION_STAGES,
  LEAD_STAGES,
} from './pipelineConstants.js';

/**
 * Erros de domínio. Cada um carrega um statusCode HTTP sugerido para o caller.
 */
export class LeadError extends Error {
  constructor(message, statusCode = 400, code = 'lead_error') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Aplica uma transição de stage com validação de regras.
 *
 * @param {object} params
 * @param {object} params.lead         documento Mongoose carregado (não-lean)
 * @param {string} params.toStage      stage destino (ex: 'qualificado')
 * @param {string} [params.motivo]     obrigatório se toStage === 'perdido'
 * @param {object} params.actor        { role: 'admin'|'gerente'|... }
 * @param {boolean} [params.isInternalCall=false]  chamada vinda do ia-service
 * @returns {Promise<object>}          o lead actualizado (não persistido — chamar .save())
 *
 * Regras:
 *   - `convertido` é bloqueado aqui (só é alcançado via convertToCliente).
 *   - admin/superadmin ignoram ALLOWED_TRANSITIONS (saltos arbitrários permitidos),
 *     excepto continuam impedidos de entrar em `convertido` por aqui.
 *   - chamadas internas (ia-service) seguem ALLOWED_TRANSITIONS estrito —
 *     a IA não tem privilégios de admin.
 *   - `perdido` exige motivo (string não-vazia).
 */
export function transitionStage({ lead, toStage, motivo, actor, isInternalCall = false }) {
  if (!lead) throw new LeadError('Lead inexistente', 404, 'lead_not_found');
  if (!LEAD_STAGES.includes(toStage)) {
    throw new LeadError(`Stage inválido: ${toStage}`, 400, 'invalid_stage');
  }

  if (RESTRICTED_DESTINATION_STAGES.has(toStage)) {
    throw new LeadError(
      'Stage "convertido" só é alcançado via /leads/:id/convert',
      400,
      'restricted_stage',
    );
  }

  if (lead.status === toStage) {
    return lead; // no-op idempotente
  }

  const isAdmin = !isInternalCall && (actor?.role === 'admin' || actor?.role === 'superadmin');
  if (!isAdmin) {
    const allowedFromCurrent = ALLOWED_TRANSITIONS[lead.status] || new Set();
    if (!allowedFromCurrent.has(toStage)) {
      throw new LeadError(
        `Transição inválida: ${lead.status} → ${toStage}`,
        400,
        'invalid_transition',
      );
    }
  }

  if (toStage === 'perdido') {
    if (!motivo || typeof motivo !== 'string' || !motivo.trim()) {
      throw new LeadError('Motivo é obrigatório ao marcar como "perdido"', 400, 'motivo_required');
    }
    lead.perdido = { motivo: motivo.trim(), em: new Date() };
  }

  lead.status = toStage;
  lead.ultimaInteracao = new Date();
  return lead;
}

/**
 * Converte um lead em Cliente (atómico, com sessão Mongoose).
 *
 * - Cria Cliente novo com os dados do lead (passa pelas validações do Cliente schema).
 * - Liga `lead.cliente` ao Cliente criado e move `lead.status` para 'convertido'.
 * - Idempotente: se já está convertido, devolve o cliente existente.
 *
 * @param {object} params
 * @param {object} params.lead        Lead doc Mongoose (não-lean)
 * @param {object} params.models      registry de modelos do tenant (req.models)
 * @param {object} params.tenantId    tenantId (ObjectId | string)
 * @param {object} [params.overrides] dados adicionais/override para o Cliente
 * @returns {Promise<{cliente, lead}>}
 */
export async function convertToCliente({ lead, models, tenantId, overrides = {} }) {
  if (!lead) throw new LeadError('Lead inexistente', 404, 'lead_not_found');
  if (lead.status === 'convertido' && lead.cliente) {
    const existente = await models.Cliente.findById(lead.cliente);
    if (existente) return { cliente: existente, lead };
  }

  if (!lead.nome && !overrides?.nome) {
    throw new LeadError(
      'Lead precisa de "nome" antes de ser convertido em Cliente',
      400,
      'lead_missing_name',
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const cliente = await models.Cliente.create([{
      tenantId,
      nome: overrides.nome || lead.nome,
      telefone: lead.telefone,
      email: overrides.email ?? lead.email ?? undefined,
      observacoes: overrides.observacoes ?? lead.observacoes,
      ativo: true,
    }], { session });

    lead.cliente = cliente[0]._id;
    lead.status = 'convertido';
    lead.ultimaInteracao = new Date();
    await lead.save({ session });

    await session.commitTransaction();
    return { cliente: cliente[0], lead };
  } catch (err) {
    await session.abortTransaction();
    if (err.code === 11000) {
      throw new LeadError(
        'Já existe um cliente com este telefone neste tenant',
        409,
        'cliente_telefone_duplicado',
      );
    }
    throw err;
  } finally {
    session.endSession();
  }
}
