import jwt from 'jsonwebtoken';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import { getTenantDB } from '../config/tenantDB.js';
import { getModels } from '../models/registry.js';

// =============================================
// MIDDLEWARE: AUTHENTICATE
// Verifica se o usuário está autenticado via JWT
// =============================================
export const authenticate = async (req, res, next) => {
    try {
        // Obter token do header Authorization
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Token de autenticação não fornecido'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verificar token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-key-change-in-production');
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    error: 'Token expirado',
                    code: 'TOKEN_EXPIRED'
                });
            }
            return res.status(401).json({
                success: false,
                error: 'Token inválido'
            });
        }

        // Adicionar dados do usuário ao request
        req.user = decoded;
        req.tenantId = decoded.tenantId;

        // Injectar DB e models isolados por tenant (database-per-tenant)
        if (decoded.tenantId) {
            req.db = getTenantDB(decoded.tenantId);
            req.models = getModels(req.db);
        }

        next();
    } catch (error) {
        console.error('Erro no middleware de autenticação:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno de autenticação'
        });
    }
};

// =============================================
// MIDDLEWARE: AUTHORIZE
// Verifica se o usuário tem uma das roles permitidas
// =============================================
export const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Não autenticado'
            });
        }

        // Superadmin tem acesso a tudo
        if (req.user.role === 'superadmin') {
            return next();
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Sem permissão para acessar este recurso',
                requiredRoles: allowedRoles,
                yourRole: req.user.role
            });
        }

        next();
    };
};

// =============================================
// MIDDLEWARE: REQUIRE PERMISSION
// Verifica se o usuário tem uma permissão específica
// =============================================
export const requirePermission = (permission) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Não autenticado'
            });
        }

        // Admin e superadmin têm todas as permissões
        if (req.user.role === 'superadmin' || req.user.role === 'admin') {
            return next();
        }

        // Buscar usuário com permissões
        const user = await User.findById(req.user.userId);

        if (!user || !user.hasPermission(permission)) {
            return res.status(403).json({
                success: false,
                error: `Sem permissão: ${permission}`,
                requiredPermission: permission
            });
        }

        next();
    };
};

// =============================================
// MIDDLEWARE: REQUIRE PLAN
// Verifica se o tenant tem um dos planos permitidos
// =============================================
export const requirePlan = (...allowedPlans) => {
    return async (req, res, next) => {
        if (!req.user || !req.tenantId) {
            return res.status(401).json({
                success: false,
                error: 'Não autenticado'
            });
        }

        try {
            const tenant = await Tenant.findById(req.tenantId);

            if (!tenant) {
                return res.status(404).json({
                    success: false,
                    error: 'Empresa não encontrada'
                });
            }

            // Verificar status do plano
            if (tenant.plano.status !== 'ativo' && tenant.plano.status !== 'trial') {
                return res.status(403).json({
                    success: false,
                    error: 'Plano inativo. Por favor, renove sua assinatura.',
                    planoStatus: tenant.plano.status
                });
            }

            // Verificar se trial expirou
            if (tenant.plano.status === 'trial' && tenant.isTrialExpired) {
                return res.status(403).json({
                    success: false,
                    error: 'Período de teste expirado. Por favor, escolha um plano.',
                    code: 'TRIAL_EXPIRED'
                });
            }

            // Verificar plano
            if (!allowedPlans.includes(tenant.plano.tipo)) {
                return res.status(403).json({
                    success: false,
                    error: 'Funcionalidade não disponível no seu plano',
                    planoAtual: tenant.plano.tipo,
                    planosNecessarios: allowedPlans,
                    upgradeUrl: '/configuracoes/plano'
                });
            }

            // Adicionar tenant ao request para uso posterior
            req.tenant = tenant;
            next();

        } catch (error) {
            console.error('Erro ao verificar plano:', error);
            res.status(500).json({
                success: false,
                error: 'Erro ao verificar plano'
            });
        }
    };
};

// =============================================
// MIDDLEWARE: CHECK LIMIT
// Verifica limites do plano (clientes, usuários, etc)
// =============================================
export const checkLimit = (limitType) => {
    return async (req, res, next) => {
        if (!req.tenantId) {
            return res.status(401).json({
                success: false,
                error: 'Não autenticado'
            });
        }

        try {
            const tenant = await Tenant.findById(req.tenantId);

            if (!tenant) {
                return res.status(404).json({
                    success: false,
                    error: 'Empresa não encontrada'
                });
            }

            const limite = tenant.limites[limitType];

            // -1 significa ilimitado
            if (limite === -1) {
                return next();
            }

            // Contar items atuais baseado no tipo
            let count = 0;

            switch (limitType) {
                case 'maxClientes': {
                    const { Cliente } = req.models;
                    count = await Cliente.countDocuments({ tenantId: req.tenantId, ativo: true });
                    break;
                }

                case 'maxUsuarios':
                    count = await User.countDocuments({ tenantId: req.tenantId, ativo: true });
                    break;

                case 'maxAgendamentosMes': {
                    const { Agendamento } = req.models;
                    const inicioMes = new Date();
                    inicioMes.setDate(1);
                    inicioMes.setHours(0, 0, 0, 0);
                    count = await Agendamento.countDocuments({
                        tenantId: req.tenantId,
                        createdAt: { $gte: inicioMes }
                    });
                    break;
                }

                default:
                    return next();
            }

            if (count >= limite) {
                return res.status(403).json({
                    success: false,
                    error: `Limite atingido: ${limitType}`,
                    limite,
                    atual: count,
                    upgradeUrl: '/configuracoes/plano'
                });
            }

            next();

        } catch (error) {
            console.error('Erro ao verificar limite:', error);
            res.status(500).json({
                success: false,
                error: 'Erro ao verificar limite'
            });
        }
    };
};

// =============================================
// MIDDLEWARE: INJECT TENANT
// Adiciona tenantId a req.body para criação/atualização
// =============================================
export const injectTenant = (req, res, next) => {
    if (req.tenantId) {
        // Para queries (GET)
        req.tenantFilter = { tenantId: req.tenantId };

        // Para criação (POST)
        if (req.body && typeof req.body === 'object') {
            req.body.tenantId = req.tenantId;
        }
    }
    next();
};

// =============================================
// MIDDLEWARE: OPTIONAL AUTH
// Autenticação opcional (não retorna erro se não autenticado)
// =============================================
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(); // Continua sem autenticação
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-key-change-in-production');
            req.user = decoded;
            req.tenantId = decoded.tenantId;
        } catch (error) {
            // Token inválido, mas continua (opcional)
        }

        next();
    } catch (error) {
        next();
    }
};

export default {
    authenticate,
    authorize,
    requirePermission,
    requirePlan,
    checkLimit,
    injectTenant,
    optionalAuth
};
