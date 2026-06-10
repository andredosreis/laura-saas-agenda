import crypto from 'crypto';

// Comparação timing-safe — evita que um atacante deduza o token
// byte a byte medindo o tempo de resposta (timing attack).
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

export const validateWebhook = (req, res, next) => {
  const token = req.headers['apikey'] || req.body?.apikey;
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;

  // Sem secret configurado, recusa sempre — nunca aceitar por omissão.
  if (!expected || !token || !safeEqual(String(token), expected)) {
    console.warn(`[Webhook Auth] Token inválido.`);
    return res.status(401).json({ success: false, error: 'Webhook não autorizado' });
  }
  next();
};
