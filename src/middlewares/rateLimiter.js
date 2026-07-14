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

// Refresh token — 30 pedidos por 15 minutos por IP
// Mais permissivo que login (uso legítimo frequente), mas impede brute force de refresh tokens
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: isTestEnv,
  message: { success: false, error: 'Demasiadas tentativas. Tente novamente em 15 minutos.' },
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

// Painel super-admin (F13, ADR-024 Guard #4) — 300 pedidos por 15 minutos por IP.
// Chave por IP (não por utilizador): generoso para navegação legítima da consola
// (listar + detalhe + uso + audit ≈ dezenas de pedidos), mas limita scraping/brute-force
// contra a superfície cross-tenant. Montado ANTES de authenticate em adminRoutes.js —
// também limita sondagem não autenticada. In-memory store: aceitável enquanto a produção
// correr um único container backend (ADR-023); se escalar horizontalmente, adicionar
// rate-limit-redis sobre o Redis já existente.
// Mensagem do 429 do painel — exportada para o teste referenciar a MESMA fonte
// (evita duplicação/drift: o corpo asserido nos testes é literalmente o de produção).
export const ADMIN_RATE_LIMIT_MESSAGE = {
  success: false,
  error: 'Demasiados pedidos ao painel. Tente novamente em 15 minutos.'
};

export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  skip: isTestEnv,
  message: ADMIN_RATE_LIMIT_MESSAGE,
  standardHeaders: true,
  legacyHeaders: false
});
