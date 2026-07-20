import Tenant from '../../models/Tenant.js';
import { sendWhatsAppMessage } from '../../utils/evolutionClient.js';

/**
 * Resolve a instância Evolution do tenant autenticado.
 *
 * Sem isto, `sendWhatsAppMessage` cai para a EVOLUTION_INSTANCE global e a
 * mensagem sai pelo WhatsApp da clínica errada. Fail-closed: sem instância
 * configurada não se envia nada (mesmo racional de leadController.manualReply).
 *
 * @returns {Promise<string|null>} instanceName do tenant, ou null se não configurada
 */
const resolverInstanciaTenant = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId).select('whatsapp.instanceName').lean();
  return tenant?.whatsapp?.instanceName || null;
};

const SEM_LIGACAO = {
  success: false,
  error: 'Sem ligação WhatsApp activa. Ligue o WhatsApp da clínica primeiro.',
};

export const notificarCliente = async (req, res) => {
  const { telefone, mensagem } = req.body;
  if (!telefone || !mensagem) {
    return res.status(400).json({ ok: false, error: 'Telefone e mensagem são obrigatórios.' });
  }

  const instanceName = await resolverInstanciaTenant(req.tenantId);
  if (!instanceName) {
    return res.status(409).json({ ok: false, ...SEM_LIGACAO });
  }

  const result = await sendWhatsAppMessage(telefone, mensagem, instanceName);
  if (result.success) {
    return res.status(200).json({ ok: true, result: result.result });
  } else {
    return res.status(500).json({ ok: false, error: result.error });
  }
};

export const enviarMensagemDireta = async (req, res) => {
  const { to, body } = req.body;

  const instanceName = await resolverInstanciaTenant(req.tenantId);
  if (!instanceName) {
    return res.status(409).json({ ok: false, ...SEM_LIGACAO });
  }

  const result = await sendWhatsAppMessage(to, body, instanceName);
  if (result.success) {
    return res.status(200).json({ ok: true, result: result.result });
  } else {
    return res.status(500).json({ ok: false, error: result.error });
  }
};
