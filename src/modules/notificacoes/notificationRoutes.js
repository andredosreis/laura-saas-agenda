import express from 'express';
import {
  subscribeUser,
  unsubscribeUser,
  getSubscriptionStatus,
} from './notificationController.js';
import { validate } from '../../middlewares/validate.js';
import {
  subscribeSchema,
  unsubscribeSchema,
} from './notificationSchemas.js';
import { authenticate } from '../../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);
router.post('/subscribe', validate(subscribeSchema), subscribeUser);
router.post('/unsubscribe', validate(unsubscribeSchema), unsubscribeUser);
router.get('/status', getSubscriptionStatus);

export default router;
