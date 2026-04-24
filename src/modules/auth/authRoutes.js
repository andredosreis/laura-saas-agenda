import express from 'express';
import {
    register,
    login,
    refreshToken,
    logout,
    logoutAll,
    me,
    updateProfile,
    updateTenant,
    changePassword,
    forgotPassword,
    resetPassword,
    verifyResetToken,
    verifyEmail
} from './authController.js';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { loginLimiter, registerLimiter, forgotPasswordLimiter } from '../../middlewares/rateLimiter.js';
import {
    registerSchema,
    loginSchema,
    refreshTokenSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    tokenParamSchema,
    logoutSchema,
    updateProfileSchema,
    changePasswordSchema,
    updateTenantSchema,
} from './authSchemas.js';

const router = express.Router();

// Rotas públicas
router.post('/register', registerLimiter, validate(registerSchema), register);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/refresh', validate(refreshTokenSchema), refreshToken);
router.post('/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.get('/verify-reset-token/:token', validate(tokenParamSchema, 'params'), verifyResetToken);
router.get('/verify-email/:token', validate(tokenParamSchema, 'params'), verifyEmail);

// Rotas protegidas
router.post('/logout', authenticate, validate(logoutSchema), logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/me', authenticate, me);
router.put('/profile', authenticate, validate(updateProfileSchema), updateProfile);
router.put('/password', authenticate, validate(changePasswordSchema), changePassword);
router.put('/tenant', authenticate, validate(updateTenantSchema), updateTenant);

export default router;
