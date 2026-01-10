import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema } = mongoose;

/**
 * User Schema
 * Representa um usuário do sistema (pode pertencer a um tenant)
 */
const UserSchema = new Schema({
    // =============================================
    // RELAÇÃO COM TENANT
    // =============================================
    tenantId: {
        type: Schema.Types.ObjectId,
        ref: 'Tenant',
        required: [true, 'Tenant é obrigatório'],
        index: true
    },

    // =============================================
    // DADOS DE LOGIN
    // =============================================
    email: {
        type: String,
        required: [true, 'Email é obrigatório'],
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Email inválido']
    },
    passwordHash: {
        type: String,
        required: [true, 'Senha é obrigatória'],
        select: false  // Não retorna o hash por padrão
    },

    // =============================================
    // PERFIL
    // =============================================
    nome: {
        type: String,
        required: [true, 'Nome é obrigatório'],
        trim: true,
        maxlength: [100, 'Nome não pode ter mais de 100 caracteres']
    },
    avatar: {
        type: String,
        default: null
    },
    telefone: {
        type: String,
        trim: true
    },

    // =============================================
    // ROLE E PERMISSÕES
    // =============================================
    role: {
        type: String,
        enum: ['superadmin', 'admin', 'gerente', 'recepcionista', 'terapeuta'],
        default: 'admin'
    },
    permissoes: {
        // Clientes
        verClientes: { type: Boolean, default: true },
        criarClientes: { type: Boolean, default: true },
        editarClientes: { type: Boolean, default: true },
        deletarClientes: { type: Boolean, default: false },

        // Agendamentos
        verAgendamentos: { type: Boolean, default: true },
        criarAgendamentos: { type: Boolean, default: true },
        editarAgendamentos: { type: Boolean, default: true },
        deletarAgendamentos: { type: Boolean, default: false },

        // Pacotes
        verPacotes: { type: Boolean, default: true },
        criarPacotes: { type: Boolean, default: false },
        editarPacotes: { type: Boolean, default: false },
        deletarPacotes: { type: Boolean, default: false },

        // Financeiro
        verFinanceiro: { type: Boolean, default: false },

        // Configurações
        editarConfiguracoes: { type: Boolean, default: false },

        // Usuários
        gerenciarUsuarios: { type: Boolean, default: false }
    },

    // =============================================
    // STATUS
    // =============================================
    ativo: { type: Boolean, default: true },
    emailVerificado: { type: Boolean, default: false },
    ultimoLogin: Date,
    loginCount: { type: Number, default: 0 },

    // =============================================
    // NOTIFICAÇÕES
    // =============================================
    notificacoes: {
        // Web Push Subscription
        webPushSubscription: {
            endpoint: String,
            keys: {
                auth: String,
                p256dh: String
            }
        },
        // Preferências
        emailNotificacoes: { type: Boolean, default: true },
        pushNotificacoes: { type: Boolean, default: true },
        pushNovoAgendamento: { type: Boolean, default: true },
        pushCancelamento: { type: Boolean, default: true },
        pushLembrete: { type: Boolean, default: true },
        emailResumoSemanal: { type: Boolean, default: true }
    },

    // =============================================
    // PREFERÊNCIAS DE INTERFACE
    // =============================================
    preferencias: {
        darkMode: { type: Boolean, default: true },
        idioma: { type: String, default: 'pt-PT' },
        timezone: { type: String, default: 'Europe/Lisbon' },
        dashboardLayout: { type: String, default: 'default' }
    },

    // =============================================
    // 💼 FASE 3: DADOS PROFISSIONAIS (para funcionários)
    // =============================================
    tipo: {
        type: String,
        enum: ['Admin', 'Profissional'],
        default: 'Admin'
    },

    // Comissão padrão
    comissaoPadrao: {
        type: Number,
        min: [0, 'Comissão não pode ser negativa'],
        max: [100, 'Comissão não pode ser maior que 100%'],
        default: 0
    },

    // Dados bancários (para pagamento de comissões)
    dadosBancarios: {
        titular: {
            type: String,
            trim: true
        },
        iban: {
            type: String,
            uppercase: true,
            trim: true,
            match: [/^PT50[0-9]{21}$/, 'IBAN português inválido']
        },
        banco: {
            type: String,
            trim: true
        }
    },

    // =============================================
    // SEGURANÇA
    // =============================================
    refreshTokens: [{
        token: String,
        device: String,
        ip: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date
    }],

    // Reset de senha
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    // Verificação de email
    emailVerificationToken: String,
    emailVerificationExpires: Date,

    // Bloqueio por tentativas de login
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,

}, {
    timestamps: true,  // createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// =============================================
// ÍNDICES
// =============================================
// Email único por tenant (um email pode existir em tenants diferentes)
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
UserSchema.index({ tenantId: 1, role: 1 });
UserSchema.index({ tenantId: 1, ativo: 1 });
UserSchema.index({ resetPasswordToken: 1 }, { sparse: true });
UserSchema.index({ emailVerificationToken: 1 }, { sparse: true });

// =============================================
// VIRTUALS
// =============================================
UserSchema.virtual('isLocked').get(function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

UserSchema.virtual('initials').get(function () {
    if (!this.nome) return '??';
    const parts = this.nome.split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
});

// =============================================
// MÉTODOS DE INSTÂNCIA
// =============================================

/**
 * Verifica se a senha fornecida corresponde ao hash
 */
UserSchema.methods.comparePassword = async function (candidatePassword) {
    // Buscar o hash se não estiver carregado
    if (!this.passwordHash) {
        const user = await this.constructor.findById(this._id).select('+passwordHash');
        return bcrypt.compare(candidatePassword, user.passwordHash);
    }
    return bcrypt.compare(candidatePassword, this.passwordHash);
};

/**
 * Incrementa tentativas de login e bloqueia se necessário
 */
UserSchema.methods.incLoginAttempts = async function () {
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 horas

    // Se já expirou o bloqueio, resetar
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1 }
        });
    }

    // Incrementar tentativas
    const updates = { $inc: { loginAttempts: 1 } };

    // Bloquear se atingiu o limite
    if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
        updates.$set = { lockUntil: Date.now() + LOCK_TIME };
    }

    return this.updateOne(updates);
};

/**
 * Reseta tentativas de login após sucesso
 */
UserSchema.methods.resetLoginAttempts = function () {
    return this.updateOne({
        $set: { loginAttempts: 0, ultimoLogin: new Date() },
        $inc: { loginCount: 1 },
        $unset: { lockUntil: 1 }
    });
};

/**
 * Verifica se o usuário tem uma permissão específica
 */
UserSchema.methods.hasPermission = function (permission) {
    // Superadmin e admin têm todas as permissões
    if (this.role === 'superadmin' || this.role === 'admin') {
        return true;
    }

    // Verificar permissão específica
    return this.permissoes[permission] === true;
};

/**
 * Retorna dados seguros do usuário (sem campos sensíveis)
 */
UserSchema.methods.toSafeObject = function () {
    const obj = this.toObject();
    delete obj.passwordHash;
    delete obj.refreshTokens;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordExpires;
    delete obj.emailVerificationToken;
    delete obj.emailVerificationExpires;
    delete obj.loginAttempts;
    delete obj.lockUntil;
    return obj;
};

// =============================================
// MÉTODOS ESTÁTICOS
// =============================================

/**
 * Buscar usuário por email dentro de um tenant
 */
UserSchema.statics.findByEmail = function (tenantId, email) {
    return this.findOne({
        tenantId,
        email: email.toLowerCase()
    }).select('+passwordHash');
};

/**
 * Criar usuário com senha hasheada
 */
UserSchema.statics.createWithPassword = async function (userData) {
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(userData.password, salt);

    delete userData.password;
    userData.passwordHash = passwordHash;

    return this.create(userData);
};

/**
 * Definir permissões padrão baseadas no role
 */
UserSchema.statics.getDefaultPermissions = function (role) {
    const permissions = {
        superadmin: {
            verClientes: true,
            criarClientes: true,
            editarClientes: true,
            deletarClientes: true,
            verAgendamentos: true,
            criarAgendamentos: true,
            editarAgendamentos: true,
            deletarAgendamentos: true,
            verPacotes: true,
            criarPacotes: true,
            editarPacotes: true,
            deletarPacotes: true,
            verFinanceiro: true,
            editarConfiguracoes: true,
            gerenciarUsuarios: true
        },
        admin: {
            verClientes: true,
            criarClientes: true,
            editarClientes: true,
            deletarClientes: true,
            verAgendamentos: true,
            criarAgendamentos: true,
            editarAgendamentos: true,
            deletarAgendamentos: true,
            verPacotes: true,
            criarPacotes: true,
            editarPacotes: true,
            deletarPacotes: true,
            verFinanceiro: true,
            editarConfiguracoes: true,
            gerenciarUsuarios: true
        },
        gerente: {
            verClientes: true,
            criarClientes: true,
            editarClientes: true,
            deletarClientes: false,
            verAgendamentos: true,
            criarAgendamentos: true,
            editarAgendamentos: true,
            deletarAgendamentos: true,
            verPacotes: true,
            criarPacotes: true,
            editarPacotes: true,
            deletarPacotes: false,
            verFinanceiro: true,
            editarConfiguracoes: false,
            gerenciarUsuarios: false
        },
        recepcionista: {
            verClientes: true,
            criarClientes: true,
            editarClientes: true,
            deletarClientes: false,
            verAgendamentos: true,
            criarAgendamentos: true,
            editarAgendamentos: true,
            deletarAgendamentos: false,
            verPacotes: true,
            criarPacotes: false,
            editarPacotes: false,
            deletarPacotes: false,
            verFinanceiro: false,
            editarConfiguracoes: false,
            gerenciarUsuarios: false
        },
        terapeuta: {
            verClientes: true,
            criarClientes: false,
            editarClientes: false,
            deletarClientes: false,
            verAgendamentos: true,
            criarAgendamentos: false,
            editarAgendamentos: false,
            deletarAgendamentos: false,
            verPacotes: true,
            criarPacotes: false,
            editarPacotes: false,
            deletarPacotes: false,
            verFinanceiro: false,
            editarConfiguracoes: false,
            gerenciarUsuarios: false
        }
    };

    return permissions[role] || permissions.terapeuta;
};

// =============================================
// MIDDLEWARE (HOOKS)
// =============================================

// Antes de salvar, hash da senha se modificada (caso não use createWithPassword)
UserSchema.pre('save', async function (next) {
    // Se a senha não foi modificada, continuar
    if (!this.isModified('passwordHash') && this.passwordHash) {
        return next();
    }

    // Se há uma senha em texto plano (campo temporário), fazer hash
    if (this._password) {
        const salt = await bcrypt.genSalt(12);
        this.passwordHash = await bcrypt.hash(this._password, salt);
        delete this._password;
    }

    next();
});

// Definir permissões padrão baseadas no role ao criar
UserSchema.pre('save', function (next) {
    if (this.isNew && !this.permissoes) {
        this.permissoes = this.constructor.getDefaultPermissions(this.role);
    }
    next();
});

// =============================================
// EXPORT
// =============================================
const User = mongoose.model('User', UserSchema);

export default User;
