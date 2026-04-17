export const validateWebhook = (req, res, next) => {
  const token = req.headers['apikey'];

  if (!token || token !== process.env.EVOLUTION_WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, error: 'Webhook não autorizado' });
  }
  next();
};
