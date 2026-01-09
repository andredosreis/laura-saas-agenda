import express from 'express';
import { runMigration } from '../controllers/migrationController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = express.Router();

// Apenas admins podem rodar migração
// POST /api/migration/run
router.post('/run', authenticate, authorize('admin', 'superadmin'), runMigration);

export default router;
