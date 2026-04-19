const mask = (v) => {
  if (!v) return '(vazio)';
  if (v.length <= 8) return `len=${v.length}`;
  return `${v.slice(0, 4)}...${v.slice(-4)} (len=${v.length})`;
};

export const validateWebhook = (req, res, next) => {
  const token = req.headers['apikey'] || req.body?.apikey;
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;

  if (!token || token !== expected) {
    console.warn(`[Webhook Auth] Token inválido. Recebido: ${mask(token)} | Esperado: ${mask(expected)}`);
    return res.status(401).json({ success: false, error: 'Webhook não autorizado' });
  }
  next();
};
