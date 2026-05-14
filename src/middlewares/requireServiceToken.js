/**
 * requireServiceToken — middleware para autenticar chamadas internas vindas
 * do `ia-service` Python (Phase 2+) e outros microserviços trusted que
 * comuniquem com o Marcai Node via /api/internal/*.
 *
 * Contrato:
 *   - Cliente envia header `X-Service-Token: <env INTERNAL_SERVICE_TOKEN>`.
 *   - Comparação timing-safe (constant time) para evitar oracles de timing.
 *   - Body deve trazer `tenantId` quando aplicável; o handler é que valida
 *     consistência com o resto do payload.
 *
 * Falhas devolvem 401 sem detalhes adicionais (não revela se token estava
 * ausente ou inválido).
 */

import crypto from 'crypto';

const HEADER = 'x-service-token';

const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

export const requireServiceToken = (req, res, next) => {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) {
    // Configuração ausente: nunca permitir a passagem (fail closed).
    console.warn('[requireServiceToken] INTERNAL_SERVICE_TOKEN não está configurado');
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }

  const provided = req.headers[HEADER];
  if (!provided || !safeEqual(String(provided), expected)) {
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }

  // Marca a request como service-call para handlers downstream poderem
  // distinguir entre user-call e service-call (ex: transitionStage).
  req.isServiceCall = true;
  next();
};

export default requireServiceToken;
