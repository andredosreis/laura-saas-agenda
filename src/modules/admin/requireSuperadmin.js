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
 * - Sem `req.user` (não autenticado)  → 401 (comportamento global do
 *   `authenticate`; não revela nada específico do painel)
 * - `req.user.role !== 'superadmin'`  → 404 + entrada de auditoria
 *   `status: 'denied'`. 404 e não 403 para não revelar a existência da
 *   superfície mais perigosa do sistema — "403 entregaria um mapa ao atacante".
 *   A negação é auditada AQUI porque este é o único componente que a vê: o
 *   `auditMiddleware` corre depois e nunca chega a executar (short-circuit).
 */
import logger from '../../utils/logger.js';
import AuditLog from '../../models/AuditLog.js';

export const requireSuperadmin = async (req, res, next) => {
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

    // Negação auditada (best-effort): responde 404 mesmo que o audit falhe.
    await AuditLog.record({
      actorUserId: req.user.userId || req.user._id,
      actorEmail: req.user.email,
      action: 'admin.access.denied',
      status: 'denied',
      ip: req.ip,
      metadata: { path: req.originalUrl, method: req.method, role: req.user.role },
    }).catch(() => {});

    return res.status(404).json({ success: false, error: 'Recurso não encontrado' });
  }

  next();
};

export default requireSuperadmin;
