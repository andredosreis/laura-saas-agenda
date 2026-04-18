export const validateWebhook = (req, res, next) => {
  const token = req.headers['apikey'] || req.body?.apikey;

  if (!token || token !== process.env.EVOLUTION_WEBHOOK_SECRET) {
    console.warn(`[Webhook Auth] Token inválido ou ausente. Recebido: ${token}`);
    return res.status(401).json({ success: false, error: 'Webhook não autorizado' });
  }
  next();
};
