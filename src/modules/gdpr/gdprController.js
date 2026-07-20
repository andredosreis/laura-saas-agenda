import { POLICY_VERSION, noticeHash } from './policyVersion.js';

/**
 * POST /gdpr/consent — regista um consentimento ou uma retirada.
 *
 * Esta rota é autenticada, logo é por definição uma acção de FUNCIONÁRIO:
 * `actor: 'funcionario'`. O caminho do titular (`actor: 'titular'`, com
 * `fichaTokenId`) existe só na submissão pública da ficha (F04), que chama
 * `ConsentLog.record()` directamente.
 */
export const registarConsentimento = async (req, res) => {
  try {
    const { ConsentLog, Cliente } = req.models;
    const { clienteId, tipo, accao, origem, evidencia } = req.body;

    // O cliente tem de existir NESTE tenant. Cliente de outro tenant → 404,
    // nunca 403 (não revelar que o recurso existe).
    const cliente = await Cliente.findOne({ _id: clienteId, tenantId: req.tenantId })
      .select('_id')
      .lean();
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    const entrada = await ConsentLog.record({
      tenantId: req.tenantId,
      clienteId,
      tipo,
      accao,
      origem,
      // Server-derived — nunca do body (R6/R7):
      actor: 'funcionario',
      evidencia: evidencia ?? null,
      textoHash: noticeHash(),
      versao: POLICY_VERSION,
      registadoPor: req.user?.userId ?? null,
      ip: req.ip ?? null,
    });

    return res.status(201).json({ success: true, data: entrada });
  } catch (error) {
    console.error('Erro ao registar consentimento:', error.message);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

/**
 * GET /gdpr/consent?clienteId=&page=&limit= — histórico de consentimentos.
 * Só leitura, tenant-scoped, paginado (≤100) e ordenado do mais recente.
 */
export const historicoConsentimento = async (req, res) => {
  try {
    const { ConsentLog } = req.models;
    const { clienteId, page, limit } = req.query;
    const skip = (page - 1) * limit;

    const filtro = { tenantId: req.tenantId, clienteId };

    const [entradas, total] = await Promise.all([
      ConsentLog.find(filtro).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ConsentLog.countDocuments(filtro),
    ]);

    return res.status(200).json({
      success: true,
      data: entradas,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error('Erro ao listar consentimentos:', error.message);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};
