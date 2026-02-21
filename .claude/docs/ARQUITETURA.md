# Arquitectura do Sistema — Marcai

## Visão Geral

O Marcai é um SaaS multi-tenant de agendamentos. Cada profissional que se regista fica isolado no seu próprio contexto de dados (tenant), partilhando a mesma base de dados mas sem acesso aos dados de outros tenants.

---

## Stack

```
Backend:   Node.js (ESM) + Express 4 + MongoDB/Mongoose
Frontend:  React 19 + TypeScript + Vite 6 + Tailwind CSS
Auth:      JWT (access 1h + refresh 7d)
Email:     Nodemailer (SMTP)
Push:      Web Push (VAPID)
IA:        OpenAI GPT-4o-mini
WhatsApp:  Z-API
```

---

## Multi-Tenancy

### Estratégia: Banco partilhado com isolamento por `tenantId`

```
MongoDB
└── laura-saas (database)
    ├── tenants        ← um doc por profissional/empresa
    ├── users          ← vinculados ao tenantId
    ├── clientes       ← vinculados ao tenantId
    ├── agendamentos   ← vinculados ao tenantId
    ├── pacotes        ← vinculados ao tenantId
    └── ...
```

### Como funciona o isolamento

1. Registo → cria `Tenant` + `User` (admin) vinculado ao tenant
2. Login → JWT inclui `{ userId, tenantId, email, role, plano }`
3. Middleware `authenticate` extrai `tenantId` do token
4. Todos os controllers filtram por `tenantId` em cada query

### Índices críticos para isolamento

```javascript
// Cliente — telefone único POR tenant (não global)
clienteSchema.index({ tenantId: 1, telefone: 1 }, { unique: true })

// User — email único POR tenant
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true })

// Email globalmente único verificado no register (antes de criar tenant)
// para evitar ambiguidade no login
```

---

## Fluxo de Autenticação

```
1. POST /api/auth/register
   → valida email globalmente único
   → cria Tenant (com rollback se User falhar)
   → cria User admin vinculado ao Tenant
   → gera token de verificação de email (24h)
   → envia email de verificação
   → retorna accessToken (1h) + refreshToken (7d)

2. POST /api/auth/login
   → busca User por email (global)
   → verifica senha (bcrypt)
   → busca Tenant do user
   → verifica status do plano (não permite cancelado/expirado)
   → retorna accessToken + refreshToken

3. POST /api/auth/refresh
   → verifica refreshToken (JWT + existe no banco)
   → rotação de token (invalida antigo, emite novo)
   → retorna novo par de tokens

4. GET /api/auth/verify-email/:token
   → hash do token e busca no banco
   → marca emailVerificado: true
   → remove token do banco
```

---

## Estrutura de Ficheiros (Backend)

```
src/
├── server.js                  # Startup: MongoDB + Express + CRON
├── app.js                     # Express: middlewares + rotas
│
├── controllers/
│   ├── authController.js      # Register, login, refresh, reset-password, verify-email
│   ├── clienteController.js   # CRUD clientes
│   ├── agendamentoController.js
│   ├── pacoteController.js
│   ├── dashboardController.js # KPIs filtrados por tenantId
│   ├── disponibilidadeController.js
│   ├── financeiroController.js
│   └── webhookController.js   # Recebe mensagens WhatsApp (Z-API)
│
├── models/
│   ├── Tenant.js              # Empresa/profissional (plano, branding, configurações)
│   ├── User.js                # Utilizador (roles, permissões, tokens)
│   ├── Cliente.js             # Cliente final (anamnese, sessões)
│   ├── Agendamento.js         # Marcações
│   ├── Pacote.js              # Pacotes de serviços
│   ├── CompraPacote.js        # Vendas de pacotes
│   ├── Pagamento.js
│   ├── Transacao.js
│   └── HistoricoAtendimento.js
│
├── middlewares/
│   ├── auth.js                # authenticate (JWT) + authorize (roles)
│   └── validation.js
│
├── services/
│   ├── emailService.js        # Nodemailer: reset-password, verify-email
│   ├── openaiService.js       # GPT-4o-mini: chatbot WhatsApp
│   ├── zapiService.js         # Envio de mensagens WhatsApp
│   └── webPushService.js      # Notificações push (VAPID)
│
└── routes/
    ├── authRoutes.js
    ├── clienteRoutes.js
    ├── agendamentoRoutes.js
    ├── pacoteRoutes.js
    ├── dashboardRoutes.js
    ├── disponibilidadeRoutes.js
    ├── financeiroRoutes.js
    └── webhookRoutes.js
```

---

## Estrutura de Ficheiros (Frontend)

```
laura-saas-frontend/src/
├── App.tsx                    # Router principal
│
├── pages/
│   ├── Login.jsx
│   ├── Register.jsx
│   ├── ForgotPassword.jsx
│   ├── ResetPassword.jsx
│   ├── VerificarEmail.jsx
│   ├── Dashboard.jsx
│   ├── Clientes.jsx / CriarCliente.jsx / EditarCliente.jsx
│   ├── Agendamentos.jsx / CriarAgendamento.jsx / EditarAgendamento.jsx
│   ├── Pacotes.jsx / CriarPacote.jsx / EditarPacote.jsx
│   ├── VenderPacote.jsx / PacotesAtivos.jsx
│   ├── Financeiro.jsx / Caixa.jsx / Transacoes.jsx
│   ├── CalendarView.jsx
│   ├── Atendimentos.jsx
│   └── Disponibilidade.jsx
│
├── components/
│   ├── MarcaiLogo.jsx         # Logo SVG do produto
│   ├── Sidebar.jsx            # Navegação lateral com grupos
│   ├── ProtectedRoute.jsx     # Guard de autenticação + roles + plano
│   └── InstallPrompt.jsx      # Prompt de instalação PWA
│
├── contexts/
│   ├── AuthContext.jsx        # Estado global de auth (user, tenant, tokens)
│   └── ThemeContext.jsx
│
├── services/
│   ├── api.js                 # Axios: interceptors, refresh automático, toasts
│   └── notificationService.ts # Web Push subscription
│
└── schemas/
    └── validationSchemas.js   # Zod: login, register, cliente, agendamento, pacote
```

---

## Modelo de Planos

```javascript
// Tenant.js
plano: {
  tipo:   'basico' | 'pro' | 'elite' | 'custom'
  status: 'trial' | 'ativo' | 'suspenso' | 'cancelado' | 'expirado'
  trialDias: 7  // trial gratuito
}

limites: {
  maxClientes:          50    // basico
  maxAgendamentosMes:   100   // basico
  maxUsuarios:          1
  iaAtiva:              false
  whatsappAutomacao:    false
  analytics:            false
}
```

---

## CRON Jobs

```javascript
// Executa diariamente às 19h (Europe/Lisbon)
// Envia lembretes WhatsApp para agendamentos do dia seguinte
cron.schedule('0 19 * * *', enviarLembretes, { timezone: 'Europe/Lisbon' })
```

---

## Variáveis de Ambiente Obrigatórias

```env
MONGODB_URI      # Conexão MongoDB Atlas
JWT_SECRET       # Assinar access tokens
JWT_REFRESH_SECRET  # Assinar refresh tokens
FRONTEND_URL     # Para links nos emails (verify-email, reset-password)

# Opcionais (funcionalidades degradam graciosamente sem elas)
SMTP_*           # Emails (sem isto, emails são logados no console em dev)
OPENAI_API_KEY   # Chatbot WhatsApp
ZAPI_*           # Integração WhatsApp
VAPID_*          # Notificações push
```
