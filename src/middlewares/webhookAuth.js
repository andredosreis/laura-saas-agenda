// Valida token do webhook Z-API enviado no header x-api-token
export const validateWebhook = (req, res, next) => {
  const token = req.headers['x-api-token'];

  if (!token || token !== process.env.ZAPI_WEBHOOK_TOKEN) {
    return res.status(401).json({ success: false, error: 'Webhook não autorizado' });
  }
  next();
};
