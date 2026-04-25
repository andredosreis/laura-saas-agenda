import * as Sentry from '@sentry/node';
import logger from '../utils/logger.js';

// Erros "esperados" que NÃO devem ser reportados ao Sentry (não são bugs).
const isExpectedClientError = (err) => (
  err?.name === 'ValidationError' ||
  err?.name === 'CastError' ||
  err?.code === 11000 ||
  err?.name === 'JsonWebTokenError' ||
  err?.name === 'TokenExpiredError' ||
  err?.message === 'Not allowed by CORS'
);

const errorHandler = (err, req, res, next) => {
  logger.error(
    {
      err,
      url: req.originalUrl,
      method: req.method,
      tenantId: req.tenantId,
      userId: req.user?.userId,
    },
    'Erro não tratado'
  );

  // Report ao Sentry apenas se for erro não esperado (bug real de servidor)
  if (!isExpectedClientError(err)) {
    Sentry.withScope((scope) => {
      if (req.tenantId) scope.setTag('tenantId', String(req.tenantId));
      if (req.user?.userId) scope.setUser({ id: String(req.user.userId) });
      scope.setContext('request', {
        url: req.originalUrl,
        method: req.method,
      });
      Sentry.captureException(err);
    });
  }

  // Erros de validação Mongoose
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ success: false, error: messages.join(', ') });
  }

  // ObjectId inválido (CastError)
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }

  // Duplicate key (índice único violado)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'campo';
    return res.status(409).json({ success: false, error: `${field} já registado` });
  }

  // JWT inválido
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, error: 'Token expirado' });
  }

  // CORS
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, error: 'Origem não permitida' });
  }

  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message,
  });
};

export default errorHandler;