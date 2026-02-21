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
} from '../controllers/authController.js';
import { authenticate } from '../middlewares/auth.js';
import { loginLimiter, registerLimiter, forgotPasswordLimiter } from '../middlewares/rateLimiter.js';

const router = express.Router();

// =============================================
// ROTAS PÚBLICAS (sem autenticação)
// =============================================

/**
 * @route   POST /api/auth/register
 * @desc    Criar nova conta (tenant + usuário)
 * @access  Public
 */
router.post('/register', registerLimiter, register);

/**
 * @route   POST /api/auth/login
 * @desc    Autenticar usuário
 * @access  Public
 */
router.post('/login', loginLimiter, login);

/**
 * @route   POST /api/auth/refresh
 * @desc    Renovar access token usando refresh token
 * @access  Public
 */
router.post('/refresh', refreshToken);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Solicitar recuperação de senha
 * @access  Public
 */
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Redefinir senha usando token
 * @access  Public
 */
router.post('/reset-password', resetPassword);

/**
 * @route   GET /api/auth/verify-reset-token/:token
 * @desc    Verificar se o token de reset é válido
 * @access  Public
 */
router.get('/verify-reset-token/:token', verifyResetToken);

/**
 * @route   GET /api/auth/verify-email/:token
 * @desc    Confirmar email do usuário
 * @access  Public
 */
router.get('/verify-email/:token', verifyEmail);

// =============================================
// ROTAS PROTEGIDAS (requer autenticação)
// =============================================

/**
 * @route   POST /api/auth/logout
 * @desc    Invalidar refresh token atual
 * @access  Private
 */
router.post('/logout', authenticate, logout);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Invalidar todos os refresh tokens (logout de todos dispositivos)
 * @access  Private
 */
router.post('/logout-all', authenticate, logoutAll);

/**
 * @route   GET /api/auth/me
 * @desc    Retorna dados do usuário logado
 * @access  Private
 */
router.get('/me', authenticate, me);

/**
 * @route   PUT /api/auth/profile
 * @desc    Atualizar perfil do usuário
 * @access  Private
 */
router.put('/profile', authenticate, updateProfile);

/**
 * @route   PUT /api/auth/password
 * @desc    Alterar senha
 * @access  Private
 */
router.put('/password', authenticate, changePassword);

/**
 * @route   PUT /api/auth/tenant
 * @desc    Actualizar dados de contato e configurações do tenant
 * @access  Private
 */
router.put('/tenant', authenticate, updateTenant);

export default router;
