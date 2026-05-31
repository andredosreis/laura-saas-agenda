/**
 * manualSilent handler — F12 Route.MANUAL_SILENT.
 *
 * Triggered when `Lead.iaAtiva === false` — the professional explicitly
 * paused the AI on this Lead (via F03 toggle). The handler:
 *
 *   1. Persists the inbound `Mensagem(origem='cliente', direcao='entrada',
 *      geradoPorIA=false)` so F03 can render it in the thread for manual
 *      handling.
 *   2. Updates `Lead.lastInteraction` so the card sorts correctly in F02.
 *   3. Sends NO outbound reply. No LLM invocation. No `Conversa` mutation
 *      beyond `lastInteraction`.
 *
 * This guarantees the professional sees the message but the agent stays
 * silent. Python `lead_orchestrator` keeps its own `iaAtiva=false` early
 * return as defense-in-depth (spec §6.4 invariant).
 *
 * @see docs/F12-ia-legacy-handoff-coordinator/spec.md §6.4
 */

/**
 * @param {object} input
 * @param {object} input.models                tenant DB models from registry
 * @param {string} input.tenantId
 * @param {string} input.telefoneNormalizado
 * @param {string} input.mensagem              original raw text (will be persisted)
 * @param {{ existingLead: object|null }} input.persistedState
 * @returns {Promise<{ delivered: false, persisted: boolean }>}
 */
export async function handle(input) {
  const { models, tenantId, telefoneNormalizado, mensagem, persistedState } = input;

  if (!models || !models.Mensagem) {
    // Fail-safe: without models there is nothing to persist. Logged loudly
    // because reaching MANUAL_SILENT requires a resolved tenant, so this
    // would indicate a contract break.
    console.warn('[manualSilent] missing models — cannot persist inbound');
    return { delivered: false, persisted: false };
  }

  const lead = persistedState?.existingLead;

  try {
    // 1) Resolve or lazily create the Conversa so the message has a thread.
    let conversaId = null;
    if (models.Conversa && lead?._id) {
      // Try to find an existing Conversa for this Lead (via Lead.conversa back-ref)
      const leadDoc = await models.Lead.findById(lead._id).select('conversa').lean();
      if (leadDoc?.conversa) {
        conversaId = leadDoc.conversa;
      } else {
        const conversa = await models.Conversa.create({
          tenantId,
          telefone: telefoneNormalizado,
          estado: 'aguardando_agendamento',
        });
        conversaId = conversa._id;
        await models.Lead.updateOne(
          { _id: lead._id, tenantId },
          { $set: { conversa: conversa._id } },
        );
      }
    } else if (models.Conversa) {
      // Cliente (sem lead) com IA pausada: resolve a Conversa por telefone
      // para o inbound ficar ligado à thread (handoff humano no inbox).
      const conv = await models.Conversa
        .findOne({ tenantId, telefone: telefoneNormalizado })
        .select('_id')
        .lean();
      conversaId = conv?._id
        || (await models.Conversa.create({
          tenantId,
          telefone: telefoneNormalizado,
          estado: 'aguardando_agendamento',
        }))._id;
    }

    // 2) Persist the inbound Mensagem
    await models.Mensagem.create({
      tenantId,
      telefone: telefoneNormalizado,
      mensagem,
      origem: 'cliente',
      direcao: 'entrada',
      conversa: conversaId,
    });

    // 3) Bump Lead.lastInteraction so F02 sorts correctly
    if (lead?._id) {
      await models.Lead.updateOne(
        { _id: lead._id, tenantId },
        { $set: { ultimaInteracao: new Date() } },
      );
    }

    return { delivered: false, persisted: true };
  } catch (err) {
    // Non-fatal: F03 will miss this single inbound on next refresh, but the
    // message remains in Evolution's history and can be recovered by the
    // professional. Sentry catches via global integration.
    console.warn('[manualSilent] failed to persist inbound:', err?.message);
    return { delivered: false, persisted: false };
  }
}
