import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { adminLimiter } from '../../middlewares/rateLimiter.js';
import { requireSuperadmin } from './requireSuperadmin.js';
import { auditMiddleware } from './auditMiddleware.js';
import { listarTenants, obterTenant, usoTenant, criarTenant, atualizarPlano, atualizarLimites, suspenderTenant, reactivarTenant, listarAudit } from './adminController.js';
import { validate } from '../../middlewares/validate.js';
import { criarTenantSchema, atualizarPlanoSchema, atualizarLimitesSchema, suspenderTenantSchema, listarAuditSchema } from './adminSchemas.js';
import { adminMutation } from './adminMutation.js';

/**
 * adminRouter — painel super-admin (ADR-024).
 *
 * Gates montados ao nível do router (fail-closed, impossível esquecer numa rota
 * nova):
 *   0. adminLimiter       — 300 pedidos/15min por IP (F13, ADR-024 Guard #4).
 *                            Montado ANTES de authenticate: também limita
 *                            sondagem não autenticada e o ruído de audit que
 *                            ela geraria.
 *   1. requireSuperadmin — role === 'superadmin', senão 404 (+ audita negação)
 *   2. auditMiddleware    — read-path do AuditLog (1 entrada por request)
 *
 * Toda rota abaixo herda os três. Mutações (Fase 3) NÃO usam router.post/put/delete
 * cru — passam pela factory adminMutation (audit transacional). Ver o playbook
 * .claude/skills/marcai-superadmin-route.
 */
const router = Router();

router.use(adminLimiter);
router.use(authenticate, requireSuperadmin);
router.use(auditMiddleware);

// Fase 2 — leitura
router.get('/tenants', listarTenants);
router.get('/tenants/:id', obterTenant);
router.get('/tenants/:id/uso', usoTenant); // métricas cross-tenant via getTenantDBAdmin (RO)

// F09 — Audit Log Viewer
router.get('/audit', validate(listarAuditSchema, 'query'), listarAudit);

// Fase 3 — escrita
// eslint-disable-next-line no-restricted-syntax
router.post('/tenants', validate(criarTenantSchema), adminMutation('tenant.create', criarTenant));

// F07 — Configure Tenant Plan, Limits & Feature Flags
// eslint-disable-next-line no-restricted-syntax
router.put('/tenants/:id/plano', validate(atualizarPlanoSchema), adminMutation('tenant.plano.update', atualizarPlano));
// eslint-disable-next-line no-restricted-syntax
router.put('/tenants/:id/limites', validate(atualizarLimitesSchema), adminMutation('tenant.limites.update', atualizarLimites));

// F08 — Suspend / Reactivate Tenant
// eslint-disable-next-line no-restricted-syntax
router.post('/tenants/:id/suspender', validate(suspenderTenantSchema), adminMutation('tenant.suspend', suspenderTenant));
// eslint-disable-next-line no-restricted-syntax
router.post('/tenants/:id/reactivar', adminMutation('tenant.reactivate', reactivarTenant));

export default router;
