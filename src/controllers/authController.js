import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

// =============================================
// CONFIGURAÇÕES JWT
// =============================================
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production';
const ACCESS_TOKEN_EXPIRES = '1h'; // Aumentado de 15m para 1h para evitar expiração durante preenchimento de formulários
const REFRESH_TOKEN_EXPIRES = '7d';

// =============================================
// HELPERS
// =============================================

/**
 * Gera access token JWT
 */
const generateAccessToken = (user, tenant) => {
    return jwt.sign(
        {
            userId: user._id,
            tenantId: tenant._id,
            email: user.email,
            nome: user.nome,
            role: user.role,
            plano: tenant.plano.tipo
        },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES }
    );
};

/**
 * Gera refresh token JWT
 */
const generateRefreshToken = (user) => {
    const token = jwt.sign(
        {
            userId: user._id,
            tokenId: crypto.randomBytes(16).toString('hex')
        },
        JWT_REFRESH_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES }
    );
    return token;
};

// =============================================
// CONTROLLERS
// =============================================

/**
 * POST /api/auth/register
 * Criar nova conta (tenant + usuário admin)
 */
export const register = async (req, res) => {
    try {
        const {
            // Dados do Tenant
            nomeEmpresa,
            // Dados do Usuário
            nome,
            email,
            password,
            telefone
        } = req.body;

        // Validações básicas
        if (!nomeEmpresa || !nome || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Campos obrigatórios: nomeEmpresa, nome, email, password'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Senha deve ter pelo menos 6 caracteres'
            });
        }

        // Gerar slug único para o tenant
        let baseSlug = nomeEmpresa
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        let slug = baseSlug;
        let counter = 1;

        // Verificar se slug já existe
        while (await Tenant.findOne({ slug })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        // Criar Tenant
        const tenant = await Tenant.create({
            nome: nomeEmpresa,
            slug,
            plano: {
                tipo: 'basico',
                status: 'trial',
                dataInicio: new Date()
            }
        });

        // Criar User Admin
        const user = await User.createWithPassword({
            tenantId: tenant._id,
            email,
            password,
            nome,
            telefone,
            role: 'admin',
            emailVerificado: false, // TODO: Implementar verificação de email
            permissoes: User.getDefaultPermissions('admin')
        });

        // Atualizar tenant com o criador
        tenant.criadoPor = user._id;
        await tenant.save();

        // Gerar tokens
        const accessToken = generateAccessToken(user, tenant);
        const refreshToken = generateRefreshToken(user);

        // Salvar refresh token
        await User.findByIdAndUpdate(user._id, {
            $push: {
                refreshTokens: {
                    token: refreshToken,
                    device: req.headers['user-agent'] || 'unknown',
                    ip: req.ip,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dias
                }
            }
        });

        res.status(201).json({
            success: true,
            message: 'Conta criada com sucesso!',
            data: {
                user: user.toSafeObject(),
                tenant: {
                    id: tenant._id,
                    nome: tenant.nome,
                    slug: tenant.slug,
                    plano: tenant.plano,
                    branding: tenant.branding,
                    diasRestantesTrial: tenant.diasRestantesTrial
                },
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: 900 // 15 minutos em segundos
                }
            }
        });

    } catch (error) {
        console.error('Erro no registro:', error);

        // Erro de email duplicado
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                error: 'Este email já está registrado'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Erro interno ao criar conta'
        });
    }
};

/**
 * POST /api/auth/login
 * Autenticar usuário
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email e senha são obrigatórios'
            });
        }

        // Buscar usuário em todos os tenants (por email)
        const user = await User.findOne({
            email: email.toLowerCase()
        }).select('+passwordHash');

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Credenciais inválidas'
            });
        }

        // Verificar se está bloqueado
        if (user.isLocked) {
            const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / 60000);
            return res.status(423).json({
                success: false,
                error: `Conta bloqueada. Tente novamente em ${lockTimeRemaining} minutos.`
            });
        }

        // Verificar senha
        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
            await user.incLoginAttempts();
            return res.status(401).json({
                success: false,
                error: 'Credenciais inválidas'
            });
        }

        // Verificar se usuário está ativo
        if (!user.ativo) {
            return res.status(403).json({
                success: false,
                error: 'Conta desativada. Contacte o administrador.'
            });
        }

        // Buscar tenant
        const tenant = await Tenant.findById(user.tenantId);

        if (!tenant || !tenant.ativo) {
            return res.status(403).json({
                success: false,
                error: 'Empresa não encontrada ou desativada'
            });
        }

        // Verificar status do plano
        if (tenant.plano.status === 'cancelado' || tenant.plano.status === 'expirado') {
            return res.status(403).json({
                success: false,
                error: 'Plano expirado. Por favor, renove sua assinatura.',
                planoStatus: tenant.plano.status
            });
        }

        // Resetar tentativas de login e atualizar último login
        await user.resetLoginAttempts();

        // Gerar tokens
        const accessToken = generateAccessToken(user, tenant);
        const refreshToken = generateRefreshToken(user);

        // Salvar refresh token (limitar a 5 dispositivos)
        const refreshTokenData = {
            token: refreshToken,
            device: req.headers['user-agent'] || 'unknown',
            ip: req.ip,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        };

        await User.findByIdAndUpdate(user._id, {
            $push: {
                refreshTokens: {
                    $each: [refreshTokenData],
                    $slice: -5 // Manter apenas os últimos 5 tokens
                }
            }
        });

        res.json({
            success: true,
            message: 'Login realizado com sucesso!',
            data: {
                user: user.toSafeObject(),
                tenant: {
                    id: tenant._id,
                    nome: tenant.nome,
                    slug: tenant.slug,
                    plano: tenant.plano,
                    branding: tenant.branding,
                    limites: tenant.limites,
                    diasRestantesTrial: tenant.diasRestantesTrial
                },
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: 900
                }
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao fazer login'
        });
    }
};

/**
 * POST /api/auth/refresh
 * Renovar access token usando refresh token
 */
export const refreshToken = async (req, res) => {
    try {
        const { refreshToken: token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token é obrigatório'
            });
        }

        // Verificar token
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_REFRESH_SECRET);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token inválido ou expirado'
            });
        }

        // Buscar usuário
        const user = await User.findById(decoded.userId);

        if (!user || !user.ativo) {
            return res.status(401).json({
                success: false,
                error: 'Usuário não encontrado ou inativo'
            });
        }

        // Verificar se o refresh token existe no banco
        const tokenExists = user.refreshTokens?.some(rt => rt.token === token);
        if (!tokenExists) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token não reconhecido'
            });
        }

        // Buscar tenant
        const tenant = await Tenant.findById(user.tenantId);

        if (!tenant || !tenant.ativo) {
            return res.status(403).json({
                success: false,
                error: 'Empresa não encontrada ou desativada'
            });
        }

        // Gerar novos tokens
        const newAccessToken = generateAccessToken(user, tenant);
        const newRefreshToken = generateRefreshToken(user);

        // Atualizar refresh token no banco (rotação de token)
        await User.findByIdAndUpdate(user._id, {
            $pull: { refreshTokens: { token } },
            $push: {
                refreshTokens: {
                    token: newRefreshToken,
                    device: req.headers['user-agent'] || 'unknown',
                    ip: req.ip,
                    createdAt: new Date(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                }
            }
        });

        res.json({
            success: true,
            data: {
                tokens: {
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                    expiresIn: 900
                }
            }
        });

    } catch (error) {
        console.error('Erro ao renovar token:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao renovar token'
        });
    }
};

/**
 * POST /api/auth/logout
 * Invalidar refresh token
 */
export const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (refreshToken && req.user) {
            // Remover refresh token específico
            await User.findByIdAndUpdate(req.user.userId, {
                $pull: { refreshTokens: { token: refreshToken } }
            });
        }

        res.json({
            success: true,
            message: 'Logout realizado com sucesso'
        });

    } catch (error) {
        console.error('Erro no logout:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao fazer logout'
        });
    }
};

/**
 * POST /api/auth/logout-all
 * Invalidar todos os refresh tokens (logout de todos os dispositivos)
 */
export const logoutAll = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.userId, {
            $set: { refreshTokens: [] }
        });

        res.json({
            success: true,
            message: 'Logout realizado em todos os dispositivos'
        });

    } catch (error) {
        console.error('Erro no logout-all:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao fazer logout'
        });
    }
};

/**
 * GET /api/auth/me
 * Retorna dados do usuário logado
 */
export const me = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        const tenant = await Tenant.findById(req.user.tenantId);

        if (!user || !tenant) {
            return res.status(404).json({
                success: false,
                error: 'Usuário ou empresa não encontrados'
            });
        }

        res.json({
            success: true,
            data: {
                user: user.toSafeObject(),
                tenant: {
                    id: tenant._id,
                    nome: tenant.nome,
                    slug: tenant.slug,
                    plano: tenant.plano,
                    branding: tenant.branding,
                    limites: tenant.limites,
                    configuracoes: tenant.configuracoes,
                    diasRestantesTrial: tenant.diasRestantesTrial
                }
            }
        });

    } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao buscar dados'
        });
    }
};

/**
 * PUT /api/auth/profile
 * Atualizar perfil do usuário
 */
export const updateProfile = async (req, res) => {
    try {
        const { nome, telefone, avatar, preferencias } = req.body;

        const updates = {};
        if (nome) updates.nome = nome;
        if (telefone) updates.telefone = telefone;
        if (avatar) updates.avatar = avatar;
        if (preferencias) updates.preferencias = preferencias;

        const user = await User.findByIdAndUpdate(
            req.user.userId,
            { $set: updates },
            { new: true }
        );

        res.json({
            success: true,
            message: 'Perfil atualizado com sucesso',
            data: { user: user.toSafeObject() }
        });

    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao atualizar perfil'
        });
    }
};

/**
 * PUT /api/auth/password
 * Alterar senha
 */
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Senha atual e nova senha são obrigatórias'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Nova senha deve ter pelo menos 6 caracteres'
            });
        }

        const user = await User.findById(req.user.userId).select('+passwordHash');

        // Verificar senha atual
        const isPasswordValid = await user.comparePassword(currentPassword);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                error: 'Senha atual incorreta'
            });
        }

        // Atualizar senha
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        await User.findByIdAndUpdate(req.user.userId, {
            $set: { passwordHash },
            $unset: { refreshTokens: 1 } // Invalidar todos os tokens
        });

        res.json({
            success: true,
            message: 'Senha alterada com sucesso. Por favor, faça login novamente.'
        });

    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao alterar senha'
        });
    }
};

/**
 * POST /api/auth/forgot-password
 * Solicitar recuperação de senha
 */
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email é obrigatório'
            });
        }

        // Buscar usuário pelo email
        const user = await User.findOne({ email: email.toLowerCase() });

        // Sempre retornar sucesso para não revelar se o email existe
        if (!user) {
            return res.json({
                success: true,
                message: 'Se o email estiver cadastrado, você receberá instruções para redefinir sua senha.'
            });
        }

        // Gerar token de recuperação
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        // Salvar token hasheado e data de expiração (1 hora)
        await User.findByIdAndUpdate(user._id, {
            resetPasswordToken: resetTokenHash,
            resetPasswordExpires: Date.now() + 60 * 60 * 1000 // 1 hora
        });

        // Enviar email
        try {
            await sendPasswordResetEmail(user.email, resetToken, user.nome);
        } catch (emailError) {
            console.error('Erro ao enviar email:', emailError);
            // Limpar token se o email falhou
            await User.findByIdAndUpdate(user._id, {
                $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 }
            });
            return res.status(500).json({
                success: false,
                error: 'Erro ao enviar email. Tente novamente mais tarde.'
            });
        }

        res.json({
            success: true,
            message: 'Se o email estiver cadastrado, você receberá instruções para redefinir sua senha.'
        });

    } catch (error) {
        console.error('Erro no forgot-password:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao processar solicitação'
        });
    }
};

/**
 * POST /api/auth/reset-password
 * Redefinir senha usando token
 */
export const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                error: 'Token e nova senha são obrigatórios'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'A senha deve ter pelo menos 6 caracteres'
            });
        }

        // Hash do token recebido para comparar com o banco
        const resetTokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Buscar usuário com token válido e não expirado
        const user = await User.findOne({
            resetPasswordToken: resetTokenHash,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                error: 'Token inválido ou expirado. Solicite uma nova recuperação de senha.'
            });
        }

        // Hash da nova senha
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(password, salt);

        // Atualizar senha e limpar tokens
        await User.findByIdAndUpdate(user._id, {
            $set: { passwordHash },
            $unset: {
                resetPasswordToken: 1,
                resetPasswordExpires: 1,
                refreshTokens: 1 // Invalidar todas as sessões
            }
        });

        res.json({
            success: true,
            message: 'Senha alterada com sucesso! Você já pode fazer login com sua nova senha.'
        });

    } catch (error) {
        console.error('Erro no reset-password:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao redefinir senha'
        });
    }
};

/**
 * GET /api/auth/verify-reset-token/:token
 * Verificar se o token de reset é válido
 */
export const verifyResetToken = async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Token é obrigatório'
            });
        }

        // Hash do token recebido
        const resetTokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Verificar se existe usuário com token válido
        const user = await User.findOne({
            resetPasswordToken: resetTokenHash,
            resetPasswordExpires: { $gt: Date.now() }
        }).select('email nome');

        if (!user) {
            return res.status(400).json({
                success: false,
                error: 'Token inválido ou expirado'
            });
        }

        res.json({
            success: true,
            data: {
                email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'), // Mascarar email
                nome: user.nome
            }
        });

    } catch (error) {
        console.error('Erro ao verificar token:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao verificar token'
        });
    }
};

export default {
    register,
    login,
    refreshToken,
    logout,
    logoutAll,
    me,
    updateProfile,
    changePassword,
    forgotPassword,
    resetPassword,
    verifyResetToken
};
