import logger from '../utils/logger.js';

// Campos cujo valor nunca pode aparecer nos logs (passwords, tokens, secrets).
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'token',
  'refreshtoken',
  'accesstoken',
  'resetpasswordtoken',
  'emailverificationtoken',
  'apikey',
  'authorization',
  'secret',
  'creditcard',
]);

const REDACTED = '[REDACTED]';

// Devolve uma cópia rasa do body com chaves sensíveis substituídas por [REDACTED].
const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = SENSITIVE_FIELDS.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
};

const requestLogger = (req, res, next) => {
  const hasBody = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0;
  logger.info(
    {
      method: req.method,
      url: req.originalUrl,
      ...(hasBody && { body: sanitizeBody(req.body) }),
    },
    'request'
  );
  next();
};

export default requestLogger;
