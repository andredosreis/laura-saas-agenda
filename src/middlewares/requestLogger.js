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
  'auth',
  'p256dh',
]);

const REDACTED = '[REDACTED]';

// Redaction recursiva para o modo de diagnóstico opt-in. Em produção o body
// nunca é registado, mesmo sanitizado, por conter PII/dados clínicos.
export const sanitizeBody = (value, depth = 0) => {
  if (depth > 8) return '[MAX_DEPTH]';
  if (Array.isArray(value)) return value.map((item) => sanitizeBody(item, depth + 1));
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = SENSITIVE_FIELDS.has(key.toLowerCase())
      ? REDACTED
      : sanitizeBody(nested, depth + 1);
  }
  return out;
};

const requestLogger = (req, res, next) => {
  const hasBody = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0;
  const logBodies = process.env.NODE_ENV !== 'production' && process.env.LOG_REQUEST_BODIES === 'true';
  logger.info(
    {
      method: req.method,
      url: req.originalUrl,
      ...(hasBody && logBodies && { body: sanitizeBody(req.body) }),
    },
    'request'
  );
  next();
};

export default requestLogger;
