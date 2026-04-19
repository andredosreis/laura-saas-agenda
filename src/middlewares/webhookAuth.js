export const validateWebhook = (req, res, next) => {
  const token = req.headers['apikey'] || req.body?.apikey;
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;

  if (!token || token !== expected) {
    console.warn(`[Webhook Auth] Token inválido.`);
    return res.status(401).json({ success: false, error: 'Webhook não autorizado' });
  }
  next();
};

