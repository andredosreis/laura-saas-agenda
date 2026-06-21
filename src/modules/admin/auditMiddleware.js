/**
 * auditMiddleware — read-path do AuditLog (Gate 2, ADR-024).
 *
 * Inicializa `req.audit` (a superfície de enriquecimento que os handlers e o
 * caminho de mutação usam) e, no fim do request, grava UMA entrada best-effort
 * para leituras. É a "cola" entre os dois escritores do Gate 2:
 *
 *   - `req.audit.committed` é a única coordenação: o caminho de mutação (Fase 3)
 *     põe-no a `true` por já ter auditado na transação → o `finish` salta, sem
 *     escrita dupla.
 *   - As negações nunca chegam aqui (short-circuit no `requireSuperadmin`, que
 *     audita ele próprio).
 *
 * Montar SEMPRE depois de `requireSuperadmin` no `adminRouter`.
 */
import AuditLog from '../../models/AuditLog.js';

export const auditMiddleware = (req, res, next) => {
  req.audit = {
    committed: false,
    data: {},
    set(fields) {
      Object.assign(this.data, fields);
    },
  };

  res.on('finish', () => {
    if (req.audit.committed) return; // mutação já auditou na transação (A3) — não duplicar

    AuditLog.record({
      actorUserId: req.user?.userId || req.user?._id,
      actorEmail: req.user?.email,
      // 1 entrada por request: semântica se o handler a declarou, senão derivada
      action: req.audit.data.action ?? `${req.method} ${req.originalUrl}`,
      targetTenantId: req.audit.data.targetTenantId ?? null,
      metadata: req.audit.data.metadata ?? {},
      status: res.statusCode < 400 ? 'ok' : 'error',
      ip: req.ip,
    }).catch(() => {}); // best-effort: a leitura não falha por causa do audit
  });

  next();
};

export default auditMiddleware;
