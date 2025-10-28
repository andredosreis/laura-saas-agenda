import express from 'express';
import {
  subscribeUser,
  unsubscribeUser,
  getSubscriptionStatus,
} from '../controllers/notificationController.js';

const router = express.Router();

// POST /api/notifications/subscribe
router.post('/subscribe', subscribeUser);

// POST /api/notifications/unsubscribe
router.post('/unsubscribe', unsubscribeUser);

// GET /api/notifications/status
router.get('/status', getSubscriptionStatus);

export default router;