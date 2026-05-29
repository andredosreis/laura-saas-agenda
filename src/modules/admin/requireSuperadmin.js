/**
 * Middleware: requireSuperadmin (ADR-024 — painel super-admin)
 *
 * Guarda TODAS as rotas do painel super-admin. O super-admin é a única
 * excepção legítima ao isolamento multi-tenant — por isso esta verificação
 * é a fronteira de segurança mais crítica do sistema. Uma falha aqui expõe
 * TODOS os tenants.
 *
 * Deve ser aplicado SEMPRE depois de `authenticate` (que popula `req.user`).
 *
 *   router.use(authenticate, requireSuperadmin);
 *
 * - Sem `req.user` (não autenticado)  → 401
 * - `req.user.role !== 'superadmin'`  → 403 (sem permissão por role)
 */
import logger from '../../utils/logger.js';

export const requireSuperadmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }

  if (req.user.role !== 'superadmin') {
    logger.warn(
      {
        userId: req.user.userId || req.user._id,
        role: req.user.role,
        path: req.originalUrl,
        ip: req.ip,
      },
      '[admin] Acesso ao painel super-admin negado'
    );
    return res.status(403).json({ success: false, error: 'Acesso restrito a super-administradores' });
  }

  next();
};

export default requireSuperadmin;
