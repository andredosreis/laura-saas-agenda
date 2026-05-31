/**
 * webhookState — parallel state fetch helper for the routing decision.
 *
 * Given an inbound `(instanceName, telefoneNormalizado)`, runs the indexed
 * point queries that `messageRouter.decide` needs and returns a snapshot
 * ready to be passed in.
 *
 * Reads:
 *   1. Tenant by `whatsapp.instanceName`  (1 query, indexed, must happen first
 *      because it resolves the tenant DB)
 *   2. existingClient by phone variants    ┐
 *   3. existingLead by phone variants      ├─ 3 reads in parallel via Promise.all
 *   4. Pending Agendamento by lead.phone   ┘  (lead-side; Cliente-side fallback after)
 *   5. (Conditional) Pending Agendamento by cliente._id (only if 4 missed AND
 *      existingClient present)
 *
 * Best case: 2 round-trips (tenant → parallel 3). Worst case: 3 round-trips
 * when the appointment is on the Cliente side. Target <50ms p95 against
 * memory-resident working sets.
 *
 * Pure-ish: side effect is the read-only DB queries. Output is a frozen
 * snapshot so the router cannot accidentally mutate it.
 *
 * @see docs/F12-ia-legacy-handoff-coordinator/spec.md §3.1, §5
 */

import { DateTime } from 'luxon';
import Tenant from '../../models/Tenant.js';
import { getTenantDB } from '../../config/tenantDB.js';
import { getModels } from '../../models/registry.js';

/**
 * Resolve the tenant whose Evolution instance matches `instanceName`.
 * Exported for direct reuse in handlers that already have the tenant context
 * (e.g. outbound instance resolution).
 *
 * @param {string|null} instanceName
 * @returns {Promise<{ tenant, models, tenantId } | null>}
 */
export async function resolveTenantByInstance(instanceName) {
  if (!instanceName || typeof instanceName !== 'string') return null;
  const tenant = await Tenant.findOne({
    'whatsapp.instanceName': instanceName.trim().toLowerCase(),
    'plano.status': { $in: ['ativo', 'trial'] },
  }).lean();
  if (!tenant) return null;
  const db = getTenantDB(tenant._id.toString());
  const models = getModels(db);
  return { tenant, models, tenantId: tenant._id.toString() };
}

/**
 * Phone variants used across queries: stripped, +351-prefixed, +351-stripped.
 * Matches the convention used in the legacy webhookController.
 */
function phoneVariants(telefoneNormalizado) {
  return [
    telefoneNormalizado,
    `351${telefoneNormalizado}`,
    telefoneNormalizado.replace(/^351/, ''),
  ];
}

/**
 * Fetch the routing state snapshot.
 *
 * @param {object} args
 * @param {string|null} args.instanceName
 * @param {string} args.telefoneNormalizado
 * @returns {Promise<{
 *   tenant: object|null,
 *   models: object|null,
 *   tenantId: string|null,
 *   persistedState: {
 *     hasPendingAppointment: boolean,
 *     pendingAppointmentId: string|null,
 *     existingClient: { _id: any, etapaConversa?: string|null } | null,
 *     existingLead:   { _id: any, iaAtiva: boolean, status: string, cliente?: any } | null,
 *   }
 * }>}
 */
export async function fetchRoutingState({ instanceName, telefoneNormalizado }) {
  // ── Step 1: resolve tenant ──────────────────────────────────────────
  const ctx = await resolveTenantByInstance(instanceName);
  if (!ctx) {
    return {
      tenant: null,
      models: null,
      tenantId: null,
      persistedState: Object.freeze({
        hasPendingAppointment: false,
        pendingAppointmentId: null,
        existingClient: null,
        existingLead: null,
      }),
    };
  }

  const { tenant, models, tenantId } = ctx;
  const variants = phoneVariants(telefoneNormalizado);

  // ── Step 2-4: parallel reads ───────────────────────────────────────
  const agora = DateTime.now().setZone('Europe/Lisbon');
  const duasHorasAtras = agora.minus({ hours: 2 }).toJSDate();
  const doisDias = agora.plus({ days: 2 }).toJSDate();
  const janelaQuery = { $gte: duasHorasAtras, $lte: doisDias };
  const trintaMinAtras = agora.minus({ minutes: 30 }).toJSDate();

  const [existingClient, existingLeadRaw, pendingApptLeadSide, lastMessage] = await Promise.all([
    models.Cliente
      ? models.Cliente.findOne({ telefone: { $in: variants } })
          .select('_id nome telefone etapaConversa iaAtiva')
          .lean()
      : null,
    models.Lead
      ? models.Lead.findOne({ tenantId, telefone: { $in: variants } })
          .select('_id iaAtiva status cliente')
          .lean()
      : null,
    models.Agendamento.findOne({
      tenantId,
      'lead.telefone': { $in: variants },
      'confirmacao.tipo': 'pendente',
      dataHora: janelaQuery,
    })
      .select('_id')
      .lean(),
    models.Mensagem
      ? models.Mensagem.findOne({ tenantId, telefone: { $in: variants } })
          .sort({ data: -1, createdAt: -1 })
          .select('direcao data createdAt')
          .lean()
      : null,
  ]);

  // Conversa IA activa: a última mensagem registada foi um outbound do bot
  // (a IA a perguntar/responder) nos últimos 30 min. Os lembretes NÃO são
  // persistidos como Mensagem, por isso um outbound recente = agente IA.
  // Usado para não rotear um "sim" de cliente (resposta à IA) para o
  // confirmador legacy de lembretes.
  const lastMsgDate = lastMessage?.data || lastMessage?.createdAt || null;
  const iaConversationActive = Boolean(
    lastMessage &&
      lastMessage.direcao === 'saida' &&
      lastMsgDate &&
      new Date(lastMsgDate) >= trintaMinAtras
  );

  // ── Step 5: Cliente-side appointment fallback (conditional) ────────
  let pendingAppointmentId = pendingApptLeadSide?._id || null;
  if (!pendingAppointmentId && existingClient) {
    const apptByClient = await models.Agendamento.findOne({
      tenantId,
      cliente: existingClient._id,
      'confirmacao.tipo': 'pendente',
      dataHora: janelaQuery,
    })
      .select('_id')
      .lean();
    if (apptByClient) pendingAppointmentId = apptByClient._id;
  }

  // Coerce iaAtiva to strict boolean — Mongoose default is true, but lean()
  // can return undefined for older Lead docs predating the field.
  const existingLead = existingLeadRaw
    ? { ...existingLeadRaw, iaAtiva: existingLeadRaw.iaAtiva !== false }
    : null;

  // Coerce Cliente.iaAtiva to strict boolean (default true for older docs
  // predating the field). false → o agente está pausado para este cliente.
  const existingClientCoerced = existingClient
    ? { ...existingClient, iaAtiva: existingClient.iaAtiva !== false }
    : null;

  return {
    tenant,
    models,
    tenantId,
    persistedState: Object.freeze({
      hasPendingAppointment: Boolean(pendingAppointmentId),
      pendingAppointmentId: pendingAppointmentId ? String(pendingAppointmentId) : null,
      existingClient: existingClientCoerced,
      existingLead,
      iaConversationActive,
    }),
  };
}
