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
  subscriptionStatusQuerySchema,
} from './notificationSchemas.js';

const router = express.Router();

router.post('/subscribe', validate(subscribeSchema), subscribeUser);
router.post('/unsubscribe', validate(unsubscribeSchema), unsubscribeUser);
router.get('/status', validate(subscriptionStatusQuerySchema, 'query'), getSubscriptionStatus);

export default router;