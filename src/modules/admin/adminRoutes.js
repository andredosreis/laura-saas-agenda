import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { requireSuperadmin } from './requireSuperadmin.js';
import { auditMiddleware } from './auditMiddleware.js';
import { listarTenants, obterTenant, usoTenant, criarTenant, atualizarPlano, atualizarLimites } from './adminController.js';
import { validate } from '../../middlewares/validate.js';
import { criarTenantSchema, atualizarPlanoSchema, atualizarLimitesSchema } from './adminSchemas.js';
import { adminMutation } from './adminMutation.js';

/**
 * adminRouter — painel super-admin (ADR-024).
 *
 * Gates montados ao nível do router (fail-closed, impossível esquecer numa rota
 * nova):
 *   1. requireSuperadmin — role === 'superadmin', senão 404 (+ audita negação)
 *   2. auditMiddleware    — read-path do AuditLog (1 entrada por request)
 *
 * Toda rota abaixo herda ambos. Mutações (Fase 3) NÃO usam router.post/put/delete
 * cru — passam pela factory adminMutation (audit transacional). Ver o playbook
 * .claude/skills/marcai-superadmin-route.
 */
const router = Router();

router.use(authenticate, requireSuperadmin);
router.use(auditMiddleware);

// Fase 2 — leitura
router.get('/tenants', listarTenants);
router.get('/tenants/:id', obterTenant);
router.get('/tenants/:id/uso', usoTenant); // métricas cross-tenant via getTenantDBAdmin (RO)

// Fase 3 — escrita
// eslint-disable-next-line no-restricted-syntax
router.post('/tenants', validate(criarTenantSchema), adminMutation('tenant.create', criarTenant));

// F07 — Configure Tenant Plan, Limits & Feature Flags
// eslint-disable-next-line no-restricted-syntax
router.put('/tenants/:id/plano', validate(atualizarPlanoSchema), adminMutation('tenant.plano.update', atualizarPlano));
// eslint-disable-next-line no-restricted-syntax
router.put('/tenants/:id/limites', validate(atualizarLimitesSchema), adminMutation('tenant.limites.update', atualizarLimites));

export default router;
