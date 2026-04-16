import logger from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
  logger.error({ err, url: req.originalUrl, method: req.method }, 'Erro não tratado');

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