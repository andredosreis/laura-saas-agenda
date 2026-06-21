import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { requireSuperadmin } from './requireSuperadmin.js';
import { auditMiddleware } from './auditMiddleware.js';
import { listarTenants, obterTenant } from './adminController.js';

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

export default router;
