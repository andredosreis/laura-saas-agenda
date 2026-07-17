import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { adminLimiter } from '../../middlewares/rateLimiter.js';
import { requireSuperadmin } from './requireSuperadmin.js';
import { auditMiddleware } from './auditMiddleware.js';
import { listarTenants, obterTenantStats, obterTenant, usoTenant, criarTenant, atualizarPlano, atualizarLimites, suspenderTenant, reactivarTenant, listarAudit, setup2FA, activate2FA, disable2FA, listarUsersTenant, obterWhatsappTenant, criarInstanciaWhatsapp, qrInstanciaWhatsapp, logoutInstanciaWhatsapp } from './adminController.js';
import { validate } from '../../middlewares/validate.js';
import { criarTenantSchema, atualizarPlanoSchema, atualizarLimitesSchema, suspenderTenantSchema, listarAuditSchema, listarTenantsSchema, setup2FASchema, activate2FASchema, listarUsersTenantSchema, criarInstanciaWhatsappSchema } from './adminSchemas.js';
import { adminMutation } from './adminMutation.js';
import { require2FA } from './require2FA.js';

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

// F16 — self-service deliberadamente antes do enforcement: um operador ainda
// não enrolado precisa de alcançar setup mesmo com a flag ligada.
// eslint-disable-next-line no-restricted-syntax
router.post('/2fa/setup', validate(setup2FASchema), adminMutation('superadmin.2fa.setup', setup2FA));
// eslint-disable-next-line no-restricted-syntax
router.post('/2fa/activate', validate(activate2FASchema), adminMutation('superadmin.2fa.activate', activate2FA));
// eslint-disable-next-line no-restricted-syntax
router.post('/2fa/disable', validate(activate2FASchema), adminMutation('superadmin.2fa.disable', disable2FA));

router.use(require2FA);

// Fase 2 — leitura
router.get('/tenants', validate(listarTenantsSchema, 'query'), listarTenants);
router.get('/tenants/stats', obterTenantStats);
router.get('/tenants/:id', obterTenant);
router.get('/tenants/:id/uso', usoTenant); // métricas cross-tenant via getTenantDBAdmin (RO)

// F19 — Tenant Users Listing
router.get('/tenants/:id/users', validate(listarUsersTenantSchema, 'query'), listarUsersTenant);

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

// F21 — Per-Tenant WhatsApp/Evolution Management (ADR-021 Fase 4)
//
// As duas mutações abaixo NÃO passam `adminMutation` directamente à rota: a
// Evolution tem de ser chamada ANTES da transação (o instanceToken só existe
// depois de ela criar a instância) e a criação precisa de compensar a instância
// órfã se a mutação falhar. Os handlers invocam `adminMutation` internamente —
// o audit transacional do Gate 2 mantém-se; muda só onde a factory é composta.
router.get('/tenants/:id/whatsapp', obterWhatsappTenant);
router.get('/tenants/:id/whatsapp/qr', qrInstanciaWhatsapp);
// eslint-disable-next-line no-restricted-syntax -- mutação via adminMutation dentro do handler (ver acima)
router.post('/tenants/:id/whatsapp/instancia', validate(criarInstanciaWhatsappSchema), criarInstanciaWhatsapp);
// eslint-disable-next-line no-restricted-syntax -- mutação via adminMutation dentro do handler (ver acima)
router.post('/tenants/:id/whatsapp/logout', logoutInstanciaWhatsapp);

export default router;
