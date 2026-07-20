import express from 'express';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { registarConsentimento, historicoConsentimento } from './gdprController.js';
import { registarConsentimentoSchema, consentQuerySchema } from './gdprSchemas.js';

const router = express.Router();

router.use(authenticate);

// Registar é aberto a qualquer staff autenticado — quem atende ao balcão é
// quem ouve o cliente pedir para deixar de receber mensagens, e opor-se tem de
// ser sem fricção. LER o histórico é que é restrito (assimetria deliberada).
router.post('/consent', validate(registarConsentimentoSchema), registarConsentimento);

router.get(
  '/consent',
  authorize('admin', 'gerente'),
  validate(consentQuerySchema, 'query'),
  historicoConsentimento
);

// Sem rotas de update/delete — o log é append-only por desenho (F01 R1/C2).
// `NoticeReceipt` também não tem superfície HTTP: é escrito pela ficha (F04).

export default router;
