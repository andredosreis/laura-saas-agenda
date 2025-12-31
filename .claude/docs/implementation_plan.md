# 🛠️ PLANO DE IMPLEMENTAÇÃO TÉCNICO - LAURA SAAS COMERCIAL

**Data:** 22 de Dezembro de 2025  
**Versão:** 1.0  
**Objetivo:** Transformar o Laura SAAS numa plataforma comercial multi-tenant

---

## 📑 Índice

1. [Arquitetura Multi-Tenant](#1-arquitetura-multi-tenant)
2. [Novos Modelos de Dados](#2-novos-modelos-de-dados)
3. [Sistema de Autenticação](#3-sistema-de-autenticação)
4. [Sistema de Planos e Billing](#4-sistema-de-planos-e-billing)
5. [Novo Dashboard Design](#5-novo-dashboard-design)
6. [Design System](#6-design-system)
7. [Fases de Implementação](#7-fases-de-implementação)
8. [Arquivos a Modificar](#8-arquivos-a-modificar)
9. [Checklist de Implementação](#9-checklist-de-implementação)

---

## 1. Arquitetura Multi-Tenant

### 1.1 Visão Geral

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LAURA SAAS - ARQUITETURA MULTI-TENANT                  │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────────┐
                              │   LOAD BALANCER  │
                              │   (Vercel Edge)  │
                              └────────┬─────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
            ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
            │   FRONTEND    │  │   FRONTEND    │  │   FRONTEND    │
            │    (PWA)      │  │    (PWA)      │  │    (PWA)      │
            │  laura.app    │  │ clinicax.app  │  │  salony.app   │
            └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
                    │                  │                  │
                    └──────────────────┼──────────────────┘
                                       │
                              ┌────────▼─────────┐
                              │     BACKEND      │
                              │  (Node + Express)│
                              │  Multi-tenant    │
                              └────────┬─────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
            ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
            │   MongoDB     │  │    Redis      │  │   OpenAI      │
            │   Atlas       │  │   (Cache +    │  │   (IA - só    │
            │ (Multi-tenant)│  │    Sessions)  │  │   ELITE)      │
            └───────────────┘  └───────────────┘  └───────────────┘
```

### 1.2 Estratégia de Isolamento de Dados

Usaremos **"Shared Database, Separate Schemas"** via campo `tenantId`:

```javascript
// Cada documento terá um tenantId
{
  _id: ObjectId,
  tenantId: ObjectId,  // 🔑 Chave de isolamento
  nome: "Maria Silva",
  telefone: "351912345678",
  // ...resto dos campos
}
```

**Vantagens:**
- ✅ Único banco de dados (custo menor)
- ✅ Fácil de implementar
- ✅ Queries simples com filtro `tenantId`
- ✅ Backups centralizados

---

## 2. Novos Modelos de Dados

### 2.1 Tenant (Novo)

```javascript
// src/models/Tenant.js
const TenantSchema = new Schema({
  // Identificação
  nome: { type: String, required: true },           // "La Estética Avançada"
  slug: { type: String, required: true, unique: true }, // "la-estetica-avancada"
  
  // Branding
  branding: {
    logo: String,                                    // URL do logo
    corPrimaria: { type: String, default: '#6366f1' },
    corSecundaria: { type: String, default: '#f59e0b' },
    corFundo: { type: String, default: '#0f172a' },
    fonte: { type: String, default: 'Inter' }
  },
  
  // Plano e Billing
  plano: {
    tipo: { 
      type: String, 
      enum: ['basico', 'pro', 'elite'], 
      default: 'basico' 
    },
    dataInicio: Date,
    dataExpiracao: Date,
    status: { 
      type: String, 
      enum: ['ativo', 'suspenso', 'cancelado', 'trial'], 
      default: 'trial' 
    }
  },
  
  // Limites do plano
  limites: {
    maxUsuarios: { type: Number, default: 1 },
    maxClientes: { type: Number, default: 50 },
    iaAtiva: { type: Boolean, default: false },
    whatsappAutomacao: { type: Boolean, default: false }
  },
  
  // Configurações
  configuracoes: {
    timezone: { type: String, default: 'Europe/Lisbon' },
    moeda: { type: String, default: 'EUR' },
    idioma: { type: String, default: 'pt-PT' }
  },
  
  // Integração WhatsApp (Z-API)
  whatsapp: {
    zapiInstanceId: String,
    zapiToken: String,
    numeroWhatsapp: String,
    webhookConfigured: { type: Boolean, default: false }
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});

// Índices
TenantSchema.index({ slug: 1 }, { unique: true });
TenantSchema.index({ 'plano.status': 1 });
```

---

### 2.2 User (Novo)

```javascript
// src/models/User.js
const UserSchema = new Schema({
  // Relação com Tenant
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  
  // Dados de Login
  email: { type: String, required: true, lowercase: true },
  passwordHash: { type: String, required: true },
  
  // Perfil
  nome: { type: String, required: true },
  avatar: String,
  telefone: String,
  
  // Role e Permissões
  role: { 
    type: String, 
    enum: ['admin', 'gerente', 'recepcionista', 'terapeuta'], 
    default: 'admin' 
  },
  
  // Status
  ativo: { type: Boolean, default: true },
  emailVerificado: { type: Boolean, default: false },
  ultimoLogin: Date,
  
  // Notificações
  notificacoes: {
    webPushSubscription: Object,
    emailNotificacoes: { type: Boolean, default: true },
    pushNotificacoes: { type: Boolean, default: true }
  },
  
  // Segurança
  refreshTokens: [String],
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});

// Índices
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
UserSchema.index({ tenantId: 1, role: 1 });
```

---

### 2.3 Atualização dos Modelos Existentes

Todos os modelos existentes precisam do campo `tenantId`:

```javascript
// Adicionar a TODOS os modelos existentes:
// Cliente, Agendamento, Pacote, Schedule, Conversa, UserSubscription

const ClienteSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true }, // 🆕
  
  // ... resto dos campos existentes
});

// Atualizar índices para incluir tenantId
ClienteSchema.index({ tenantId: 1, telefone: 1 }, { unique: true });
ClienteSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
```

---

## 3. Sistema de Autenticação

### 3.1 Stack de Autenticação

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUXO DE AUTENTICAÇÃO                               │
└─────────────────────────────────────────────────────────────────────────────┘

CLIENTE                FRONTEND               BACKEND              DATABASE
   │                      │                      │                     │
   │─── Login ───────────►│                      │                     │
   │    email/password    │                      │                     │
   │                      │                      │                     │
   │                      │── POST /auth/login ─►│                     │
   │                      │   {email, password}  │                     │
   │                      │                      │                     │
   │                      │                      │── Find User ───────►│
   │                      │                      │   {email}           │
   │                      │                      │◄─ User + Tenant ────│
   │                      │                      │                     │
   │                      │                      │── Verify Password ──│
   │                      │                      │   (bcrypt)          │
   │                      │                      │                     │
   │                      │                      │── Generate Tokens ──│
   │                      │                      │   - Access (15min)  │
   │                      │                      │   - Refresh (7days) │
   │                      │                      │                     │
   │                      │◄─ {accessToken, ─────│                     │
   │                      │   refreshToken,      │                     │
   │                      │   user, tenant}      │                     │
   │                      │                      │                     │
   │◄─ Redirect to ───────│                      │                     │
   │   Dashboard          │                      │                     │
   │                      │                      │                     │
```

### 3.2 Endpoints de Autenticação

```javascript
// src/routes/authRoutes.js

POST   /api/auth/register      // Criar conta + tenant
POST   /api/auth/login         // Login
POST   /api/auth/logout        // Logout
POST   /api/auth/refresh       // Renovar access token
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/verify-email/:token
GET    /api/auth/me            // Dados do usuário logado
```

### 3.3 JWT Payload

```javascript
// Access Token (15 min)
{
  userId: "507f1f77bcf86cd799439011",
  tenantId: "507f1f77bcf86cd799439012",
  email: "laura@estetica.pt",
  role: "admin",
  plano: "elite",
  iat: 1734876600,
  exp: 1734877500
}

// Refresh Token (7 dias)
{
  userId: "507f1f77bcf86cd799439011",
  tokenVersion: 1,
  iat: 1734876600,
  exp: 1735481400
}
```

### 3.4 Middleware de Autenticação

```javascript
// src/middlewares/auth.js

// 1. Verificar JWT
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.tenantId = decoded.tenantId; // 🔑 Importante para queries
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// 2. Verificar Role
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  next();
};

// 3. Verificar Plano
const requirePlan = (...planos) => async (req, res, next) => {
  const tenant = await Tenant.findById(req.tenantId);
  if (!planos.includes(tenant.plano.tipo)) {
    return res.status(403).json({ 
      error: 'Funcionalidade não disponível no seu plano',
      planoAtual: tenant.plano.tipo,
      planosNecessarios: planos
    });
  }
  next();
};

// 4. Injetar tenantId em todas as queries
const injectTenant = (req, res, next) => {
  // Middleware para garantir que todas as queries filtram por tenant
  req.tenantFilter = { tenantId: req.tenantId };
  next();
};
```

---

## 4. Sistema de Planos e Billing

### 4.1 Definição dos Planos

```javascript
// src/config/plans.js
export const PLANS = {
  basico: {
    nome: 'Básico',
    preco: 49,
    moeda: 'EUR',
    ciclo: 'mensal',
    limites: {
      maxUsuarios: 1,
      maxClientes: 50,
      maxAgendamentosMes: 100,
      iaAtiva: false,
      whatsappAutomacao: false,
      lembretesWhatsapp: true,
      analytics: false,
      relatorios: false,
      suporte: 'email'
    },
    features: [
      '✅ Agenda digital completa',
      '✅ Gestão de clientes (até 50)',
      '✅ Lembretes WhatsApp básicos',
      '✅ 1 usuário',
      '❌ Automação WhatsApp',
      '❌ Agente IA 24/7',
      '❌ Analytics avançado'
    ]
  },
  
  pro: {
    nome: 'PRO',
    preco: 99,
    moeda: 'EUR',
    ciclo: 'mensal',
    limites: {
      maxUsuarios: 5,
      maxClientes: 500,
      maxAgendamentosMes: -1, // ilimitado
      iaAtiva: false,
      whatsappAutomacao: true,
      lembretesWhatsapp: true,
      analytics: true,
      relatorios: true,
      suporte: 'priority'
    },
    features: [
      '✅ Tudo do Básico',
      '✅ Clientes ilimitados',
      '✅ Até 5 usuários',
      '✅ Automação WhatsApp completa',
      '✅ Analytics e relatórios',
      '✅ Suporte prioritário',
      '❌ Agente IA 24/7'
    ]
  },
  
  elite: {
    nome: 'ELITE',
    preco: 199,
    moeda: 'EUR',
    ciclo: 'mensal',
    limites: {
      maxUsuarios: -1, // ilimitado
      maxClientes: -1,
      maxAgendamentosMes: -1,
      iaAtiva: true,           // 🤖 IA ATIVADA!
      whatsappAutomacao: true,
      lembretesWhatsapp: true,
      analytics: true,
      relatorios: true,
      suporte: 'dedicado'
    },
    features: [
      '✅ Tudo do PRO',
      '✅ Usuários ilimitados',
      '✅ 🤖 Agente IA 24/7',
      '✅ Atendimento automático WhatsApp',
      '✅ Agendamento por IA',
      '✅ Suporte dedicado',
      '✅ Branding personalizado'
    ]
  }
};
```

### 4.2 Verificação de Limites

```javascript
// src/middlewares/planLimits.js

const checkClientLimit = async (req, res, next) => {
  const tenant = await Tenant.findById(req.tenantId);
  const clientCount = await Cliente.countDocuments({ tenantId: req.tenantId });
  
  if (tenant.limites.maxClientes !== -1 && clientCount >= tenant.limites.maxClientes) {
    return res.status(403).json({
      error: 'Limite de clientes atingido',
      limite: tenant.limites.maxClientes,
      atual: clientCount,
      upgrade: 'Faça upgrade para o plano PRO para clientes ilimitados'
    });
  }
  next();
};

const checkIAAccess = async (req, res, next) => {
  const tenant = await Tenant.findById(req.tenantId);
  
  if (!tenant.limites.iaAtiva) {
    return res.status(403).json({
      error: 'Agente IA não disponível no seu plano',
      planoAtual: tenant.plano.tipo,
      upgrade: 'Faça upgrade para o plano ELITE para ativar o Agente IA 24/7'
    });
  }
  next();
};
```

---

## 5. Novo Dashboard Design

### 5.1 Layout Principal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DASHBOARD - LAYOUT                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌─────────┐                                                                │
│  │  LOGO   │  🏠 Dashboard  📅 Agenda  👥 Clientes  📦 Pacotes  ⚙️ Config   │
│  └─────────┘                                        [🔔 3] [👤 Laura ▼]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  "Bom dia, Laura!" 👋                                               │   │
│  │  Hoje é Domingo, 22 de Dezembro de 2025                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │               MÉTRICAS PRINCIPAIS (Mini-Cards Glassmorphism)        │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐│   │
│  │  │ 💰 €2,450    │ │ 📅 8         │ │ 👥 48        │ │ ⚡ 94%       ││   │
│  │  │ Faturamento  │ │ Hoje         │ │ Clientes     │ │ Comparecim.  ││   │
│  │  │ ↑ 15%        │ │ agendamentos │ │ ativos       │ │ este mês     ││   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌────────────────────────────────────┐ ┌────────────────────────────────┐ │
│  │ 📅 AGENDA DE HOJE                  │ │ 📊 DESEMPENHO SEMANAL          │ │
│  ├────────────────────────────────────┤ ├────────────────────────────────┤ │
│  │ ┌────────────────────────────────┐ │ │                                │ │
│  │ │ ⏰ 09:00                       │ │ │    ██                          │ │
│  │ │ Maria Silva                    │ │ │ ██ ██ ██                       │ │
│  │ │ Drenagem Linfática             │ │ │ ██ ██ ██ ██                    │ │
│  │ │ ✅ Confirmado                  │ │ │ ██ ██ ██ ██ ██                 │ │
│  │ │ [📱] [✏️] [✓]                 │ │ │ Seg Ter Qua Qui Sex Sáb       │ │
│  │ └────────────────────────────────┘ │ │  8   6   9   7   5   -         │ │
│  │ ┌────────────────────────────────┐ │ └────────────────────────────────┘ │
│  │ │ ⏰ 10:30                       │ │                                    │
│  │ │ Ana Costa                      │ │ ┌────────────────────────────────┐ │
│  │ │ Massagem Modeladora            │ │ │ ⚠️ AÇÕES PENDENTES            │ │
│  │ │ 🟡 Pendente                    │ │ ├────────────────────────────────┤ │
│  │ │ [📱] [✏️] [✓]                 │ │ │ 🔔 3 clientes sessões baixas   │ │
│  │ └────────────────────────────────┘ │ │ 📱 2 lembretes para enviar     │ │
│  │                                    │ │ 💰 1 pagamento pendente        │ │
│  │ [Ver todos →]                      │ └────────────────────────────────┘ │
│  └────────────────────────────────────┘                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🗓️ CALENDÁRIO SEMANAL (FullCalendar)                               │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐                  │   │
│  │ │ DOM  │ SEG  │ TER  │ QUA  │ QUI  │ SEX  │ SÁB  │                  │   │
│  │ │  22  │  23  │  24  │  25  │  26  │  27  │  28  │                  │   │
│  │ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤                  │   │
│  │ │ 8 ag │ 6 ag │ --- │ 5 ag │ 7 ag │ 4 ag │ --- │                  │   │
│  │ │ █████│ ████ │     │ ████ │ ████ │ ███  │     │                  │   │
│  │ └──────┴──────┴──────┴──────┴──────┴──────┴──────┘                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Componentes do Dashboard

```jsx
// Estrutura de componentes
src/components/
├── dashboard/
│   ├── WelcomeHeader.jsx       // Saudação personalizada
│   ├── MetricCard.jsx          // Card de métrica com glassmorphism
│   ├── MetricsGrid.jsx         // Grid das 4 métricas principais
│   ├── TodayAgenda.jsx         // Lista de agendamentos de hoje
│   ├── AgendaItem.jsx          // Item individual com ações
│   ├── WeeklyChart.jsx         // Gráfico de barras da semana
│   ├── PendingActions.jsx      // Centro de ações pendentes
│   ├── WeeklyCalendar.jsx      // Calendário semanal interativo
│   └── QuickActions.jsx        // Ações rápidas (novo agendamento, etc)
```

---

## 6. Design System

### 6.1 Variáveis CSS (Design Tokens)

```css
/* src/styles/design-tokens.css */

:root {
  /* ========================================
     CORES - MODO CLARO
     ======================================== */
  
  /* Primárias */
  --color-primary-50: #eef2ff;
  --color-primary-100: #e0e7ff;
  --color-primary-200: #c7d2fe;
  --color-primary-300: #a5b4fc;
  --color-primary-400: #818cf8;
  --color-primary-500: #6366f1;   /* Principal */
  --color-primary-600: #4f46e5;
  --color-primary-700: #4338ca;
  --color-primary-800: #3730a3;
  --color-primary-900: #312e81;
  
  /* Acentos */
  --color-accent-400: #fbbf24;
  --color-accent-500: #f59e0b;   /* Amber */
  --color-accent-600: #d97706;
  
  /* Sucesso */
  --color-success-400: #34d399;
  --color-success-500: #10b981;
  --color-success-600: #059669;
  
  /* Warning */
  --color-warning-400: #fb923c;
  --color-warning-500: #f97316;
  --color-warning-600: #ea580c;
  
  /* Error */
  --color-error-400: #f87171;
  --color-error-500: #ef4444;
  --color-error-600: #dc2626;
  
  /* Neutros */
  --color-gray-50: #f8fafc;
  --color-gray-100: #f1f5f9;
  --color-gray-200: #e2e8f0;
  --color-gray-300: #cbd5e1;
  --color-gray-400: #94a3b8;
  --color-gray-500: #64748b;
  --color-gray-600: #475569;
  --color-gray-700: #334155;
  --color-gray-800: #1e293b;
  --color-gray-900: #0f172a;
  
  /* ========================================
     GLASSMORPHISM
     ======================================== */
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-border: rgba(255, 255, 255, 0.5);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  --glass-blur: 20px;
  
  /* ========================================
     TIPOGRAFIA
     ======================================== */
  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-size-xs: 0.75rem;    /* 12px */
  --font-size-sm: 0.875rem;   /* 14px */
  --font-size-base: 1rem;     /* 16px */
  --font-size-lg: 1.125rem;   /* 18px */
  --font-size-xl: 1.25rem;    /* 20px */
  --font-size-2xl: 1.5rem;    /* 24px */
  --font-size-3xl: 1.875rem;  /* 30px */
  --font-size-4xl: 2.25rem;   /* 36px */
  
  /* ========================================
     ESPAÇAMENTO
     ======================================== */
  --spacing-1: 0.25rem;   /* 4px */
  --spacing-2: 0.5rem;    /* 8px */
  --spacing-3: 0.75rem;   /* 12px */
  --spacing-4: 1rem;      /* 16px */
  --spacing-5: 1.25rem;   /* 20px */
  --spacing-6: 1.5rem;    /* 24px */
  --spacing-8: 2rem;      /* 32px */
  --spacing-10: 2.5rem;   /* 40px */
  --spacing-12: 3rem;     /* 48px */
  
  /* ========================================
     BORDER RADIUS
     ======================================== */
  --radius-sm: 0.25rem;   /* 4px */
  --radius-md: 0.5rem;    /* 8px */
  --radius-lg: 0.75rem;   /* 12px */
  --radius-xl: 1rem;      /* 16px */
  --radius-2xl: 1.5rem;   /* 24px */
  --radius-full: 9999px;
  
  /* ========================================
     SOMBRAS
     ======================================== */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  
  /* ========================================
     TRANSIÇÕES
     ======================================== */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 350ms ease;
}

/* ========================================
   MODO ESCURO
   ======================================== */
.dark {
  --glass-bg: rgba(15, 23, 42, 0.8);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  
  /* Inverter neutros para dark mode */
  --color-bg: var(--color-gray-900);
  --color-surface: var(--color-gray-800);
  --color-text-primary: var(--color-gray-50);
  --color-text-secondary: var(--color-gray-400);
}
```

### 6.2 Componente Card Glassmorphism

```jsx
// src/components/ui/GlassCard.jsx
const GlassCard = ({ children, className = '', hoverable = true }) => {
  return (
    <div 
      className={`
        bg-white/70 dark:bg-slate-800/70
        backdrop-blur-xl
        border border-white/50 dark:border-white/10
        rounded-2xl
        shadow-lg shadow-black/5
        ${hoverable ? 'hover:shadow-xl hover:scale-[1.02] transition-all duration-300' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};
```

### 6.3 Componente Metric Card

```jsx
// src/components/dashboard/MetricCard.jsx
const MetricCard = ({ 
  icon, 
  value, 
  label, 
  trend, 
  trendValue,
  color = 'primary' 
}) => {
  const colorClasses = {
    primary: 'from-indigo-500 to-purple-500',
    success: 'from-emerald-500 to-teal-500',
    warning: 'from-amber-500 to-orange-500',
    error: 'from-rose-500 to-red-500'
  };
  
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between">
        <div 
          className={`
            w-12 h-12 rounded-xl 
            bg-gradient-to-br ${colorClasses[color]}
            flex items-center justify-center
            text-white text-xl
            shadow-lg
          `}
        >
          {icon}
        </div>
        
        {trend && (
          <span className={`
            text-xs font-medium px-2 py-1 rounded-full
            ${trend === 'up' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}
          `}>
            {trend === 'up' ? '↑' : '↓'} {trendValue}
          </span>
        )}
      </div>
      
      <div className="mt-4">
        <h3 className="text-3xl font-bold text-gray-900 dark:text-white">
          {value}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {label}
        </p>
      </div>
    </GlassCard>
  );
};
```

---

## 7. Fases de Implementação

### 📅 Cronograma Detalhado

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ROADMAP DE IMPLEMENTAÇÃO                             │
└─────────────────────────────────────────────────────────────────────────────┘

  SEMANA 1        SEMANA 2        SEMANA 3        SEMANA 4        SEMANA 5
     │               │               │               │               │
     ▼               ▼               ▼               ▼               ▼
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ FASE 1A │    │ FASE 1B │    │ FASE 2A │    │ FASE 2B │    │ FASE 3  │
│         │    │         │    │         │    │         │    │         │
│ Auth +  │───►│ Dashboard│───►│ Calendar│───►│ Analytics│───►│ Multi-  │
│ Tenant  │    │ Design  │    │ + Toast │    │         │    │ Tenant  │
│         │    │         │    │         │    │         │    │ + Plans │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
     │               │               │               │               │
     ▼               ▼               ▼               ▼               ▼
   [5 dias]       [5 dias]       [5 dias]       [5 dias]       [7 dias]
```

---

### 🔴 FASE 1A: Autenticação + Tenant (Semana 1)

**Objetivo:** Sistema de login funcional com isolamento de dados

**Tarefas:**
- [ ] Criar modelo `Tenant`
- [ ] Criar modelo `User`
- [ ] Adicionar `tenantId` a todos os modelos existentes
- [ ] Migração de dados existentes (criar tenant "Laura")
- [ ] Implementar endpoints de autenticação
- [ ] Middleware de autenticação JWT
- [ ] Middleware de injeção de tenant
- [ ] Rate limiting
- [ ] Tela de Login (frontend)
- [ ] Tela de Registro (frontend)
- [ ] Context de autenticação (React)
- [ ] Protected Routes

**Arquivos:**
```
src/
├── models/
│   ├── Tenant.js         [NOVO]
│   └── User.js           [NOVO]
├── routes/
│   └── authRoutes.js     [NOVO]
├── controllers/
│   └── authController.js [NOVO]
├── middlewares/
│   ├── auth.js           [NOVO]
│   └── planLimits.js     [NOVO]
├── migrations/
│   └── addTenantId.js    [NOVO]

laura-saas-frontend/src/
├── pages/
│   ├── Login.jsx         [NOVO]
│   └── Register.jsx      [NOVO]
├── contexts/
│   └── AuthContext.jsx   [NOVO]
├── components/
│   └── ProtectedRoute.jsx [NOVO]
```

---

### 🔴 FASE 1B: Novo Dashboard Design (Semana 2)

**Objetivo:** Dashboard premium com glassmorphism

**Tarefas:**
- [ ] Design System (design-tokens.css)
- [ ] Dark mode toggle
- [ ] Componente GlassCard
- [ ] Componente MetricCard
- [ ] WelcomeHeader (saudação personalizada)
- [ ] Grid de métricas (4 cards)
- [ ] TodayAgenda (lista redesenhada)
- [ ] AgendaItem (com ações inline)
- [ ] WeeklyChart (gráfico de barras)
- [ ] PendingActions (centro de alertas)
- [ ] Skeleton loading
- [ ] Animações de entrada

**Arquivos:**
```
laura-saas-frontend/src/
├── styles/
│   └── design-tokens.css       [NOVO]
├── components/
│   ├── ui/
│   │   ├── GlassCard.jsx       [NOVO]
│   │   ├── Skeleton.jsx        [NOVO]
│   │   └── Badge.jsx           [NOVO]
│   └── dashboard/
│       ├── WelcomeHeader.jsx   [NOVO]
│       ├── MetricCard.jsx      [NOVO]
│       ├── MetricsGrid.jsx     [NOVO]
│       ├── TodayAgenda.jsx     [NOVO]
│       ├── AgendaItem.jsx      [NOVO]
│       ├── WeeklyChart.jsx     [NOVO]
│       └── PendingActions.jsx  [NOVO]
├── pages/
│   └── Dashboard.jsx           [MODIFICAR]
```

---

### 🟡 FASE 2A: Calendário + Toasts (Semana 3)

**Objetivo:** Calendário interativo e notificações elegantes

**Tarefas:**
- [ ] Instalar e configurar FullCalendar
- [ ] Componente CalendarView
- [ ] Integrar com agendamentos
- [ ] Drag-and-drop de agendamentos
- [ ] Substituir todos alert() por toast
- [ ] Configurar react-toastify com design custom
- [ ] Toast de sucesso, erro, warning, info
- [ ] Skeleton loading em listas

**Dependências:**
```bash
npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
npm install react-toastify
```

---

### 🟡 FASE 2B: Analytics (Semana 4)

**Objetivo:** Métricas financeiras e gráficos

**Tarefas:**
- [ ] Endpoint: GET /api/analytics/faturamento
- [ ] Endpoint: GET /api/analytics/comparecimento
- [ ] Endpoint: GET /api/analytics/servicos-populares
- [ ] Endpoint: GET /api/analytics/horarios-pico
- [ ] Componente LineChart (faturamento)
- [ ] Componente PieChart (serviços)
- [ ] Componente Heatmap (horários)
- [ ] Página de Relatórios
- [ ] Export PDF (react-pdf)

**Dependências:**
```bash
npm install recharts
npm install @react-pdf/renderer
```

---

### 🟢 FASE 3: Multi-Tenant Completo + Planos (Semana 5-6)

**Objetivo:** Sistema pronto para comercialização

**Tarefas:**
- [ ] Página de Pricing público
- [ ] Onboarding wizard (novo tenant)
- [ ] Configurações de branding por tenant
- [ ] Stripe integration (billing)
- [ ] Webhook Stripe (mudança de plano)
- [ ] Tela de upgrade de plano
- [ ] Admin panel (super admin)
- [ ] Landing page comercial

---

## 8. Arquivos a Modificar

### Backend (Modificações)

| Arquivo | Mudança |
|---------|---------|
| `src/models/Cliente.js` | Adicionar `tenantId` |
| `src/models/Agendamento.js` | Adicionar `tenantId` |
| `src/models/Pacote.js` | Adicionar `tenantId` |
| `src/models/Schedule.js` | Adicionar `tenantId` |
| `src/models/Conversa.js` | Adicionar `tenantId` |
| `src/controllers/*.js` | Usar `req.tenantFilter` em queries |
| `src/app.js` | Adicionar middlewares auth |
| `src/routes/index.js` | Proteger rotas |

### Frontend (Modificações)

| Arquivo | Mudança |
|---------|---------|
| `src/App.tsx` | Adicionar AuthContext, ProtectedRoutes |
| `src/services/api.js` | Adicionar interceptor JWT |
| `src/pages/Dashboard.jsx` | Redesign completo |
| `src/index.css` | Design tokens |
| `tailwind.config.js` | Dark mode, custom colors |

---

## 9. Checklist de Implementação

### Fase 1A - Autenticação
- [ ] 1.1 Criar modelo Tenant
- [ ] 1.2 Criar modelo User
- [ ] 1.3 Migration: adicionar tenantId a modelos existentes
- [ ] 1.4 Migration: criar tenant "Laura" com dados existentes
- [ ] 1.5 Implementar authController (register, login, refresh)
- [ ] 1.6 Implementar middleware authenticate
- [ ] 1.7 Implementar middleware injectTenant
- [ ] 1.8 Atualizar todas as queries com tenantFilter
- [ ] 1.9 Criar página Login.jsx
- [ ] 1.10 Criar página Register.jsx
- [ ] 1.11 Criar AuthContext
- [ ] 1.12 Criar ProtectedRoute
- [ ] 1.13 Atualizar api.js com interceptor JWT
- [ ] 1.14 Testar fluxo completo login → dashboard

### Fase 1B - Dashboard Design
- [ ] 2.1 Criar design-tokens.css
- [ ] 2.2 Atualizar tailwind.config.js
- [ ] 2.3 Implementar dark mode toggle
- [ ] 2.4 Criar componente GlassCard
- [ ] 2.5 Criar componente MetricCard
- [ ] 2.6 Criar WelcomeHeader
- [ ] 2.7 Criar MetricsGrid
- [ ] 2.8 Criar TodayAgenda
- [ ] 2.9 Criar AgendaItem
- [ ] 2.10 Criar WeeklyChart
- [ ] 2.11 Criar PendingActions
- [ ] 2.12 Criar Skeleton
- [ ] 2.13 Integrar tudo no Dashboard.jsx
- [ ] 2.14 Adicionar animações de entrada
- [ ] 2.15 Testar responsividade

---

## 🚀 Próximo Passo

Aguardo sua aprovação para começar a implementação da **Fase 1A (Autenticação + Tenant)**.

> **⚠️ IMPORTANTE:** Este é um plano técnico. Não vou alterar código até você aprovar.
