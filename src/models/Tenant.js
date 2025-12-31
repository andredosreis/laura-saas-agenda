import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Tenant Schema
 * Representa uma empresa/clínica/salão que usa o sistema
 */
const TenantSchema = new Schema({
    // =============================================
    // IDENTIFICAÇÃO
    // =============================================
    nome: {
        type: String,
        required: [true, 'Nome do estabelecimento é obrigatório'],
        trim: true,
        maxlength: [100, 'Nome não pode ter mais de 100 caracteres']
    },
    slug: {
        type: String,
        required: [true, 'Slug é obrigatório'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens']
    },

    // =============================================
    // BRANDING PERSONALIZADO
    // =============================================
    branding: {
        logo: { type: String, default: null },  // URL do logo
        favicon: { type: String, default: null },
        corPrimaria: { type: String, default: '#6366f1' },     // Indigo
        corSecundaria: { type: String, default: '#f59e0b' },   // Amber
        corFundo: { type: String, default: '#0f172a' },        // Slate 900
        corTexto: { type: String, default: '#f8fafc' },        // Slate 50
        fonte: { type: String, default: 'Inter' },
        darkMode: { type: Boolean, default: true }
    },

    // =============================================
    // PLANO E BILLING
    // =============================================
    plano: {
        tipo: {
            type: String,
            enum: ['basico', 'pro', 'elite', 'custom'],
            default: 'basico'
        },
        preco: { type: Number, default: 49 },
        moeda: { type: String, default: 'EUR' },
        ciclo: { type: String, enum: ['mensal', 'anual'], default: 'mensal' },
        dataInicio: { type: Date, default: Date.now },
        dataExpiracao: Date,
        status: {
            type: String,
            enum: ['trial', 'ativo', 'suspenso', 'cancelado', 'expirado'],
            default: 'trial'
        },
        trialDias: { type: Number, default: 14 },
        stripeCustomerId: String,
        stripeSubscriptionId: String
    },

    // =============================================
    // LIMITES DO PLANO
    // =============================================
    limites: {
        maxUsuarios: { type: Number, default: 1 },
        maxClientes: { type: Number, default: 50 },
        maxAgendamentosMes: { type: Number, default: 100 },
        iaAtiva: { type: Boolean, default: false },
        whatsappAutomacao: { type: Boolean, default: false },
        lembretesWhatsapp: { type: Boolean, default: true },
        analytics: { type: Boolean, default: false },
        relatorios: { type: Boolean, default: false },
        exportPdf: { type: Boolean, default: false },
        brandingPersonalizado: { type: Boolean, default: false }
    },

    // =============================================
    // CONFIGURAÇÕES GERAIS
    // =============================================
    configuracoes: {
        timezone: { type: String, default: 'Europe/Lisbon' },
        idioma: { type: String, default: 'pt-PT' },
        moedaDisplay: { type: String, default: '€' },
        formatoData: { type: String, default: 'DD/MM/YYYY' },
        formatoHora: { type: String, default: 'HH:mm' },
        duracaoSessaoPadrao: { type: Number, default: 60 }, // minutos
        antecedenciaMinAgendamento: { type: Number, default: 2 }, // horas
        antecedenciaMaxAgendamento: { type: Number, default: 30 }, // dias
        permitirAgendamentoOnline: { type: Boolean, default: false }
    },

    // =============================================
    // INTEGRAÇÃO WHATSAPP (Z-API)
    // =============================================
    whatsapp: {
        provider: { type: String, enum: ['zapi', 'evolution', 'baileys'], default: 'zapi' },
        zapiInstanceId: String,
        zapiToken: String,
        zapiClientToken: String,
        numeroWhatsapp: String,
        webhookConfigured: { type: Boolean, default: false },
        webhookUrl: String,
        // Configurações de mensagens
        mensagens: {
            boasVindas: { type: String, default: 'Olá! Bem-vindo(a) ao nosso espaço. Como posso ajudar?' },
            confirmacaoAgendamento: { type: String, default: 'Seu agendamento foi confirmado para {data} às {hora}. Até breve!' },
            lembreteAgendamento: { type: String, default: 'Olá {nome}! Lembrete: você tem um agendamento amanhã às {hora}.' },
            cancelamentoAgendamento: { type: String, default: 'Seu agendamento foi cancelado. Entre em contato para reagendar.' }
        }
    },

    // =============================================
    // INFORMAÇÕES DE CONTATO
    // =============================================
    contato: {
        email: { type: String, lowercase: true },
        telefone: String,
        endereco: {
            rua: String,
            numero: String,
            complemento: String,
            cidade: String,
            codigoPostal: String,
            pais: { type: String, default: 'Portugal' }
        },
        website: String,
        redesSociais: {
            instagram: String,
            facebook: String,
            linkedin: String
        }
    },

    // =============================================
    // METADADOS
    // =============================================
    ativo: { type: Boolean, default: true },
    criadoPor: { type: Schema.Types.ObjectId, ref: 'User' },  // Owner/Admin principal

}, {
    timestamps: true,  // createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// =============================================
// ÍNDICES
// =============================================
// TenantSchema.index({ slug: 1 }, { unique: true }); // Removido pois já definido no schema com unique: true
TenantSchema.index({ 'plano.status': 1 });
TenantSchema.index({ 'plano.tipo': 1 });
TenantSchema.index({ ativo: 1 });
TenantSchema.index({ createdAt: -1 });

// =============================================
// VIRTUALS
// =============================================
TenantSchema.virtual('isTrialExpired').get(function () {
    if (this.plano.status !== 'trial') return false;
    const trialEnd = new Date(this.createdAt);
    trialEnd.setDate(trialEnd.getDate() + this.plano.trialDias);
    return new Date() > trialEnd;
});

TenantSchema.virtual('diasRestantesTrial').get(function () {
    if (this.plano.status !== 'trial') return 0;
    const trialEnd = new Date(this.createdAt);
    trialEnd.setDate(trialEnd.getDate() + this.plano.trialDias);
    const diff = trialEnd - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// =============================================
// MÉTODOS ESTÁTICOS
// =============================================
TenantSchema.statics.findBySlug = function (slug) {
    return this.findOne({ slug: slug.toLowerCase(), ativo: true });
};

TenantSchema.statics.createWithDefaults = async function (data) {
    // Gerar slug a partir do nome se não fornecido
    if (!data.slug && data.nome) {
        data.slug = data.nome
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/[^a-z0-9]+/g, '-')     // Substitui caracteres especiais por hífen
            .replace(/^-+|-+$/g, '');        // Remove hífens do início e fim
    }

    return this.create(data);
};

// =============================================
// MIDDLEWARE (HOOKS)
// =============================================

// Antes de salvar, garantir que slug é único
TenantSchema.pre('save', async function (next) {
    if (this.isModified('slug')) {
        const existing = await this.constructor.findOne({
            slug: this.slug,
            _id: { $ne: this._id }
        });
        if (existing) {
            const error = new Error('Este slug já está em uso');
            error.code = 11000;
            return next(error);
        }
    }
    next();
});

// =============================================
// EXPORT
// =============================================
const Tenant = mongoose.model('Tenant', TenantSchema);

export default Tenant;
