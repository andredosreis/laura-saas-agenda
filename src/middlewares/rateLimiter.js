import rateLimit from 'express-rate-limit';

const isTestEnv = () => process.env.NODE_ENV === 'test';

// Login — 5 tentativas por 15 minutos por IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: isTestEnv,
  message: { success: false, error: 'Demasiadas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Register — 3 contas por hora por IP
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  skip: isTestEnv,
  message: { success: false, error: 'Limite de registos atingido. Tente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Forgot password — 3 pedidos por hora por IP
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  skip: isTestEnv,
  message: { success: false, error: 'Limite atingido. Tente novamente em 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false
});
