# Codebase Architecture Mapping

**Version**: 1.0
**Date**: 2026-04-08
**Author**: André dos Reis
**Analyst**: Architecture ADR Phase 1

---

## Project Overview

| Field | Value |
|-------|-------|
| **Name** | Marcai (previously branded "Laura SaaS Agenda") |
| **Purpose** | Multi-tenant SaaS platform for appointment management targeting health and aesthetics professionals |
| **Type** | B2B SaaS — Progressive Web App (PWA) + REST API |
| **Primary Languages** | JavaScript (Node.js ESM backend), TypeScript (React frontend) |
| **Architecture Style** | Layered Monolith (Backend) + SPA PWA (Frontend) |
| **Tenancy Model** | Database-per-Tenant (logical isolation via MongoDB `useDb()`) |
| **Deployment** | Backend on Render (Node.js free tier), Frontend on Vercel |

---

## Technology Stack

### Backend
| Category | Technology | Version |
|----------|-----------|---------|
| Runtime | Node.js (ESM modules, `"type": "module"`) | >=18.0.0 |
| Framework | Express | ^4.19.2 |
| Database | MongoDB via Mongoose | ^8.1.2 |
| Database driver | mongodb | ^7.0.0 |
| Authentication | JWT (jsonwebtoken) | ^9.0.3 |
| Password hashing | bcryptjs | ^3.0.3 |
| Environment | dotenv-flow | ^4.1.0 |
| Logging | Pino + pino-pretty | ^10.3.1 |
| HTTP logging | Morgan | ^1.10.0 |
| Rate limiting | express-rate-limit | ^8.2.1 |
| CRON scheduler | node-cron | ^3.0.3 |
| Email | Nodemailer | ^6.9.16 |
| Web Push (VAPID) | web-push | ^3.6.7 |
| AI / NLP | OpenAI SDK (gpt-4o-mini, gpt-3.5-turbo) | ^4.26.0 |
| HTTP client | Axios | ^1.7.2 |
| Date/time | Luxon | ^3.7.2 |
| Testing | Jest + Supertest + mongodb-memory-server | ^29.7.0 |

### Frontend
| Category | Technology | Version |
|----------|-----------|---------|
| Framework | React | ^19.0.0 |
| Language | TypeScript | ^5.9.2 |
| Build tool | Vite | ^6.3.5 |
| Styling | Tailwind CSS | ^3.4.3 |
| Routing | React Router DOM | ^7.5.2 |
| HTTP client | Axios | ^1.9.0 |
| Forms | React Hook Form + Zod | ^7.70.0 / ^4.3.5 |
| Calendar | FullCalendar (React) | ^6.1.20 |
| Charts | Recharts | ^3.6.0 |
| Animations | Framer Motion | ^12.24.7 |
| Icons | Lucide React | ^0.553.0 |
| Toast notifications | React Toastify | ^11.0.5 |
| PWA | vite-plugin-pwa | ^1.1.0 |
| Date/time | Luxon | ^3.7.2 |
| Analytics | @vercel/speed-insights | ^1.2.0 |
| Offline support | Service Worker (Workbox via Vite PWA) | — |

### Infrastructure & External Services
| Service | Role | Integration Point |
|---------|------|-------------------|
| MongoDB Atlas | Primary cloud database | Mongoose via `MONGO_URI` |
| Evolution API (Docker) | WhatsApp gateway (self-hosted) | Webhooks + REST `ZAPI_*` env vars |
| OpenAI API | NLP intent classification + function calling | `OPENAI_API_KEY` |
| Web Push (VAPID) | Browser push notifications to professionals | `VAPID_*` env vars |
| Render.com | Backend hosting | `render.yaml` |
| Vercel | Frontend + edge hosting | `vercel.json` |

---

## Context Notes

**Source Files Analyzed**:
- `.claude/CLAUDE.md` — Project conventions and stack overview
- `.claude/docs/API.md` — Full REST API reference
- `.claude/docs/ARQUITETURA.md` — C4 diagrams (Context, Container, Sequence)
- `.claude/docs/MELHORIAS.md` — Known issues and improvement tracker
- `.claude/docs/MELHORIAS_LAURA_SAAS.md` — Senior-level improvement roadmap
- `.claude/docs/Docs Arqueturais/HLD_Laura_SaaS.md` — High-Level Design
- `.claude/docs/Docs Arqueturais/PRD_Laura_SaaS.md` — Product Requirements
- `.claude/docs/Docs Arqueturais/FDD_Sistema_Rotas_API.md` — Feature Design Doc (API Routes)

**Key Insights**:

1. **Database-per-Tenant isolation**: The most architecturally significant decision. Each tenant gets its own MongoDB database (`tenant_<tenantId>`), accessed via `mongoose.connection.useDb()` with a connection cache in `tenantDB.js`. Global models (`Tenant`, `User`) live in a shared DB.

2. **Model Registry pattern**: `src/models/registry.js` exposes `getModels(db)` which compiles all tenant-scoped schemas against the tenant's isolated connection. This prevents cross-tenant data leakage at the ORM level.

3. **Layered middleware pipeline**: Every authenticated request passes through `authenticate` → `authorize` → `injectTenant` → optional `requirePlan`/`checkLimit`. The pipeline is documented with sequence diagrams in `ARQUITETURA.md`.

4. **AI integration is partially implemented**: `openaiHelper.js` uses GPT-4o-mini with function calling (`functionsSchema.json`). A separate `classificarIntencaoCliente` uses gpt-3.5-turbo for cheaper intent classification. The WhatsApp chatbot layer is functional but the full AI scheduling flow is marked as in-progress.

5. **PWA offline capability**: The frontend uses Workbox (via vite-plugin-pwa) for service worker management. `offlineService.ts` and `serviceWorkerService.ts` handle offline queuing.

6. **Billing model embedded in Tenant**: Subscription plans (`basico`, `pro`, `elite`, `custom`) with trial periods, Stripe references, and feature flags (`limites.*`) are all nested inside the `Tenant` document. Plan enforcement is done in middleware.

7. **Mixed auth token storage**: Access and refresh tokens stored in `localStorage` (not HttpOnly cookies) — a known security trade-off documented in the improvement backlog.

8. **CRON embedded in API process**: The daily reminder job (`node-cron`) runs inside `server.js` — no separate worker process. This is appropriate for the current single-tenant scale but flagged as a future concern.

---

## System Modules

### Module Index

| ID | Name | Layer | Description |
|----|------|-------|-------------|
| [AUTH] | Authentication & Authorization | Backend Cross-cutting | JWT lifecycle, RBAC, plan gating, tenant injection |
| [TENANT] | Multi-Tenancy Engine | Backend Infrastructure | Database isolation, connection registry, model factory |
| [SCHED] | Scheduling Core | Backend Domain | Appointment CRUD, availability, calendar, reminders |
| [CRM] | Client Relationship Management | Backend Domain | Client registry, anamnese, client history |
| [PKG] | Packages & Sessions | Backend Domain | Service packages, session tracking, purchase lifecycle |
| [FIN] | Financial Management | Backend Domain | Transactions, payments, cash register (caixa), analytics |
| [NOTIF] | Notifications Engine | Backend Service | Web Push (VAPID), WhatsApp reminders, email |
| [WA] | WhatsApp Integration | Backend Service | Z-API/Evolution gateway, webhook ingestion, message dispatch |
| [AI] | AI / NLP Layer | Backend Service | Intent classification, function calling, conversation context |
| [API] | REST API Gateway | Backend Infrastructure | Express routing, middleware pipeline, CORS, error handling |
| [FE-CORE] | Frontend Core Shell | Frontend Infrastructure | App entry, routing, auth context, theme, PWA shell |
| [FE-DASH] | Dashboard & Calendar | Frontend Feature | KPI display, FullCalendar view, analytics charts |
| [FE-SCHED] | Scheduling UI | Frontend Feature | Appointment list, creation, editing, detail modal |
| [FE-CRM] | Client UI | Frontend Feature | Client list, creation, editing, history |
| [FE-PKG] | Packages UI | Frontend Feature | Package management, sales flow, active packages |
| [FE-FIN] | Financial UI | Frontend Feature | Transaction list, cash register, financial summary |
| [FE-SETTINGS] | Settings & Config UI | Frontend Feature | Tenant configuration, availability, profile |
| [DATA] | Data Layer | Backend Infrastructure | Mongoose schemas, indexes, migrations, seeds |
| [INFRA] | DevOps & Infrastructure | Cross-cutting | Deployment configs, CI, health check, environment |

---

### [AUTH]: Authentication & Authorization

**Purpose**: Handles the complete identity and access lifecycle — JWT issuance/validation, role-based access control (RBAC), plan-level feature gating, and per-request tenant injection.

**Location**: `src/middlewares/auth.js`, `src/routes/authRoutes.js`, `src/controllers/authController.js`

**Key Components**:
- `authenticate` — Verifies Bearer JWT, decodes `userId` + `tenantId`, injects `req.db` and `req.models`
- `authorize(...roles)` — RBAC guard; `superadmin` bypasses all
- `requirePermission(permission)` — Granular permission check via `User.hasPermission()`
- `requirePlan(...plans)` — Validates tenant plan status (trial expiry, plan type)
- `checkLimit(limitType)` — Enforces plan quotas (maxClientes, maxUsuarios, maxAgendamentosMes)
- `injectTenant` — Stamps `req.body.tenantId` and `req.tenantFilter` for downstream use
- `optionalAuth` — Non-blocking auth for semi-public routes

**Technologies**: `jsonwebtoken`, `bcryptjs`, `express-rate-limit` (on auth routes)

**Dependencies**:
- Internal: `[TENANT]` (getTenantDB, getModels), `User` model, `Tenant` model
- External: None

**Patterns**:
- Pipeline middleware (Chain of Responsibility)
- Token-based stateless auth (JWT access 1h + refresh token rotation)
- Hierarchical RBAC (`superadmin > admin > user`)

**Key Files**:
- `src/middlewares/auth.js` — All middleware exports
- `src/middlewares/rateLimiter.js` — Rate limiting for auth routes
- `src/middlewares/webhookAuth.js` — Z-API token validation for webhook routes
- `src/controllers/authController.js` — Register, login, refresh, logout, password reset, email verification

**Scope**: Large — 7 middleware functions + full auth controller (register, login, refresh, logout, profile, password change, password reset, email verification)

---

### [TENANT]: Multi-Tenancy Engine

**Purpose**: Provides complete data isolation between tenants using a database-per-tenant strategy over a shared MongoDB connection pool.

**Location**: `src/config/tenantDB.js`, `src/models/registry.js`, `src/models/Tenant.js`, `src/models/User.js`

**Key Components**:
- `getTenantDB(tenantId)` — Returns a cached `mongoose.Connection` scoped to `tenant_<tenantId>` DB namespace
- `getModels(db)` — Factory that registers/returns all tenant-scoped Mongoose models on the isolated connection
- `Tenant` schema — Global entity storing company profile, branding, plan/billing, WhatsApp config, limits
- `User` schema — Global entity (not tenant-isolated) linking users to tenants with roles and permissions

**Technologies**: `mongoose` (`useDb()`, connection cache Map), MongoDB Atlas

**Dependencies**:
- Internal: `[DATA]` (schema exports), `[AUTH]` (middleware injects `req.db`, `req.models`)
- External: MongoDB Atlas

**Patterns**:
- Database-per-Tenant (logical isolation without separate connection pools)
- Model Registry / Factory
- Connection caching (in-memory Map, one connection per tenantId per process lifetime)

**Key Files**:
- `src/config/tenantDB.js` — Connection factory and cache
- `src/models/registry.js` — Model registration factory (`getModels`)
- `src/models/Tenant.js` — Tenant schema with plan virtuals (`isTrialExpired`, `diasRestantesTrial`), slug generation, branding
- `src/models/User.js` — User schema with permissions

**Scope**: Medium — 4 key files, but architecturally the most critical decision in the system

---

### [SCHED]: Scheduling Core

**Purpose**: The central business domain — manages appointments (agendamentos), professional availability windows, and daily reminder dispatch via CRON.

**Location**: `src/controllers/agendamentoController.js`, `src/controllers/scheduleController.js`, `src/controllers/agenteController.js`, `src/routes/agendamentoRoutes.js`, `src/routes/scheduleRoutes.js`, `src/models/Agendamento.js`, `src/models/Schedule.js`

**Key Components**:
- Appointment CRUD with state machine: `agendado → confirmado → realizado | cancelado | nao_compareceu`
- Availability configuration per weekday (start/end time, interval, active flag)
- WhatsApp reminder dispatch (manual trigger + CRON automated at 19h Europe/Lisbon)
- `sendReminderNotifications` in `agenteController.js` — orchestrates daily reminder batches

**Technologies**: `node-cron`, `[WA]` (WhatsApp dispatch), `[NOTIF]` (push), Mongoose

**Dependencies**:
- Internal: `[AUTH]`, `[TENANT]`, `[CRM]`, `[WA]`, `[NOTIF]`
- External: None

**Patterns**:
- State machine (appointment status transitions)
- CRON embedded in main process (`server.js`)
- Multi-channel notification (WhatsApp + Web Push)

**Key Files**:
- `src/controllers/agendamentoController.js` — Main CRUD + status transitions
- `src/controllers/agenteController.js` — Reminder logic + CRON target
- `src/controllers/scheduleController.js` — Availability configuration
- `src/models/Agendamento.js` — Appointment schema
- `src/models/Schedule.js` — Availability schedule schema
- `src/server.js` — CRON job registration (19h daily)

**Scope**: Large — spans 3 controllers, 2 models, 2 route files, CRON integration

---

### [CRM]: Client Relationship Management

**Purpose**: Manages the client registry for each tenant, including personal data, anamnese (health intake form), attendance history, and appointment linkage.

**Location**: `src/controllers/clienteController.js`, `src/controllers/historicoAtendimentoController.js`, `src/routes/clienteRoutes.js`, `src/routes/historicoAtendimentoRoutes.js`, `src/models/Cliente.js`, `src/models/HistoricoAtendimento.js`

**Key Components**:
- Client CRUD with phone uniqueness per tenant
- Anamnese embedded in client document
- `HistoricoAtendimento` — attendance records linking client + appointment + financial data
- Pagination via `?page&limit` query params

**Technologies**: Mongoose, `[AUTH]`/`[TENANT]` middleware stack

**Dependencies**:
- Internal: `[AUTH]`, `[TENANT]`, `[SCHED]`, `[PKG]`
- External: None

**Patterns**:
- Soft-delete pattern (clients marked inactive rather than removed)
- Embedded sub-documents (anamnese inside Cliente)
- Paginated list responses `{ success, data, pagination: { total, page, pages, limit } }`

**Key Files**:
- `src/controllers/clienteController.js`
- `src/models/Cliente.js`
- `src/controllers/historicoAtendimentoController.js`
- `src/models/HistoricoAtendimento.js`

**Scope**: Medium — 2 controllers, 2 models, 2 route files

---

### [PKG]: Packages & Sessions

**Purpose**: Models the business concept of "session packages" — a client purchases N sessions of a service, which are then consumed one-by-one through appointments. Tracks remaining sessions and purchase lifecycle.

**Location**: `src/controllers/pacoteController.js`, `src/controllers/compraPacoteController.js`, `src/routes/pacoteRoutes.js`, `src/routes/compraPacoteRoutes.js`, `src/models/Pacote.js`, `src/models/CompraPacote.js`

**Key Components**:
- `Pacote` — Package template (name, service type, session count, price, category)
- `CompraPacote` — Purchase instance linking client + package + remaining sessions
- Session consumption tracking (decrements remaining sessions on appointment completion)
- Low-session alert surfaced via `GET /dashboard/sessoes-baixas` (≤2 sessions remaining)

**Technologies**: Mongoose, `[AUTH]`/`[TENANT]` middleware

**Dependencies**:
- Internal: `[AUTH]`, `[TENANT]`, `[CRM]`, `[FIN]`
- External: None

**Patterns**:
- Template + Instance pattern (Pacote template → CompraPacote instance)
- Session counter with business rule enforcement

**Key Files**:
- `src/models/Pacote.js` — Package template schema
- `src/models/CompraPacote.js` — Purchase instance schema
- `src/controllers/compraPacoteController.js` — Purchase lifecycle + session tracking

**Scope**: Medium — 2 controllers, 2 models, 2 route files

---

### [FIN]: Financial Management

**Purpose**: Tracks all monetary flows — transactions (income/expense), payments linked to appointments or package purchases, and daily cash register (caixa) operations. Includes analytics aggregations.

**Location**: `src/controllers/financeiroController.js`, `src/controllers/transacaoController.js`, `src/controllers/pagamentoController.js`, `src/controllers/caixaController.js`, `src/controllers/analyticsController.js`, `src/services/financeiroService.js`, `src/services/analyticsService.js`

**Key Components**:
- `Transacao` — Generic financial transaction (income, expense, category, date)
- `Pagamento` — Payment linked to appointment or package purchase
- Caixa — Daily cash register view (open/close, balance summary)
- Analytics — Aggregated revenue, top clients, service distribution (Recharts-ready)
- `financeiroService.js` — Business logic for financial calculations
- `analyticsService.js` — MongoDB aggregation pipelines for charts

**Technologies**: Mongoose aggregation pipeline, `[AUTH]`/`[TENANT]`

**Dependencies**:
- Internal: `[AUTH]`, `[TENANT]`, `[SCHED]`, `[PKG]`, `[CRM]`
- External: None (Stripe referenced in Tenant schema but not yet integrated for payments)

**Patterns**:
- Service layer for financial calculations (separated from controllers)
- Aggregation pipeline for analytics
- Double-entry bookkeeping concept (partial — transactions + payments)

**Key Files**:
- `src/models/Transacao.js`
- `src/models/Pagamento.js`
- `src/services/financeiroService.js`
- `src/services/analyticsService.js`
- `src/controllers/dashboardController.js` — KPI aggregations

**Scope**: Large — 5 controllers + 2 services + 2 models + dashboard controller

---

### [NOTIF]: Notifications Engine

**Purpose**: Delivers real-time and scheduled notifications to professionals via Web Push (VAPID) and to clients via WhatsApp and email.

**Location**: `src/services/pushService.js`, `src/controllers/notificationController.js`, `src/routes/notificationRoutes.js`, `src/services/emailService.js`, `src/models/UserSubscription.js`

**Key Components**:
- `pushService.js` — VAPID-based Web Push; single and bulk send with subscription expiry handling
- `notificationController.js` — Subscribe/unsubscribe push endpoint, send notification endpoint
- `emailService.js` — Nodemailer transport for password reset and email verification
- `UserSubscription` model — Stores push subscription objects (endpoint, keys.p256dh, keys.auth)

**Technologies**: `web-push` (VAPID), `nodemailer`, `[WA]` (WhatsApp channel)

**Dependencies**:
- Internal: `[AUTH]`, `[WA]`, `[SCHED]`
- External: Browser Push API (VAPID), SMTP server (email), Evolution API/Z-API (WhatsApp)

**Patterns**:
- Observer-like (subscriptions stored, notifications pushed on events)
- Multi-channel notification routing

**Key Files**:
- `src/services/pushService.js`
- `src/services/emailService.js`
- `src/models/UserSubscription.js`

**Scope**: Medium — 1 controller, 2 services, 1 model

---

### [WA]: WhatsApp Integration

**Purpose**: Bidirectional WhatsApp communication layer — receives incoming messages via webhook from the Evolution API gateway and dispatches outbound messages (reminders, confirmations, chatbot replies).

**Location**: `src/controllers/webhookController.js`, `src/controllers/whatsappController.js`, `src/routes/webhookRoutes.js`, `src/routes/whatsappRoutes.js`, `src/utils/sendZapiWhatsAppMessage.js`, `src/utils/zapi_client.js`, `src/middlewares/webhookAuth.js`, `src/models/Conversa.js`, `src/models/Mensagem.js`

**Key Components**:
- `webhookController.js` — Ingests incoming WhatsApp messages, routes to AI layer, dispatches reply
- `whatsappController.js` — Manual send and configuration endpoints
- `webhookAuth.js` — Validates `x-api-token` header from Z-API on all webhook calls
- `sendZapiWhatsAppMessage.js` / `zapi_client.js` — HTTP client wrappers for Z-API REST API
- `Conversa` model — Conversation thread per client phone number
- `Mensagem` model — Individual message records within a conversation

**Technologies**: `axios` (Z-API HTTP calls), `express-rate-limit`, `[AI]` (intent + function calling)

**Dependencies**:
- Internal: `[AI]`, `[SCHED]`, `[CRM]`, `[NOTIF]`
- External: Evolution API (Docker, self-hosted), Z-API REST endpoints

**Patterns**:
- Webhook ingestion with token validation
- Conversation state machine (stored in Conversa model)
- Synchronous webhook processing (queue improvement identified in backlog)

**Key Files**:
- `src/controllers/webhookController.js`
- `src/middlewares/webhookAuth.js`
- `src/utils/zapi_client.js`
- `src/models/Conversa.js`

**Scope**: Medium — 2 controllers, 2 utilities, 2 models, 2 route files

---

### [AI]: AI / NLP Layer

**Purpose**: Processes natural language from WhatsApp messages — classifies intent and orchestrates OpenAI function calling to extract structured scheduling data and trigger internal API actions.

**Location**: `src/utils/openaiHelper.js`, `src/utils/functionsSchema.json`, `src/utils/promptLoader.js`, `src/services/functionDispatcher.js`, `src/prompt/systemLaura.md`

**Key Components**:
- `openaiHelper.js` — Two-tier AI: `chatWithLaura()` (GPT-4o-mini with function calling) and `classificarIntencaoCliente()` (GPT-3.5-turbo for cheap classification)
- `functionsSchema.json` — OpenAI tools schema defining callable functions (criar_agendamento, consultar_disponibilidade, etc.)
- `systemLaura.md` — System prompt loaded once at module initialization
- `functionDispatcher.js` — Routes OpenAI tool call results to internal service functions
- `promptLoader.js` — Reads and caches prompt files from disk

**Technologies**: `openai` SDK, `fs/promises` (prompt file loading)

**Dependencies**:
- Internal: `[WA]` (caller), `[SCHED]`, `[CRM]`
- External: OpenAI API (GPT-4o-mini, GPT-3.5-turbo)

**Patterns**:
- Two-tier LLM (cheap classifier + capable function-caller)
- Function Calling / Tool Use pattern (OpenAI tools API)
- System prompt loaded once (module-level singleton)
- Dispatcher pattern for tool result routing

**Key Files**:
- `src/utils/openaiHelper.js`
- `src/utils/functionsSchema.json`
- `src/services/functionDispatcher.js`
- `src/prompt/systemLaura.md`

**Scope**: Small-Medium — 4 files, high strategic importance

---

### [API]: REST API Gateway

**Purpose**: Express application setup — middleware pipeline configuration, route registration, CORS policy, error handling, and health check endpoint.

**Location**: `src/app.js`, `src/server.js`, `src/middlewares/errorHandler.js`, `src/middlewares/requestLogger.js`, `src/middlewares/validateObjectId.js`

**Key Components**:
- `app.js` — Express instance, CORS whitelist (Vercel + Z-API), all route mounts, trust proxy, health endpoint
- `server.js` — DB connection bootstrap, HTTP server start, CRON job registration
- `errorHandler.js` — Centralized error middleware (last middleware in chain)
- `requestLogger.js` — Pino-based structured request logging
- `validateObjectId.js` — Guard middleware for MongoDB ObjectId params

**Technologies**: `express`, `cors`, `morgan`, `pino`, `dotenv-flow`

**Dependencies**:
- Internal: All domain modules (routes imported)
- External: None

**Patterns**:
- Layered middleware (trust proxy → JSON parse → logger → CORS → routes → error handler)
- Environment-conditional CORS (open in dev, restricted in prod)
- Health check at `GET /api/health` (monitored by Render)

**Key Files**:
- `src/app.js`
- `src/server.js`
- `src/middlewares/errorHandler.js`

**Scope**: Small — 5 files, but central architectural configuration

---

### [FE-CORE]: Frontend Core Shell

**Purpose**: Application entry point, routing tree, authentication state management, theme, PWA service worker lifecycle, and shared infrastructure for all frontend modules.

**Location**: `laura-saas-frontend/src/App.tsx`, `laura-saas-frontend/src/main.tsx`, `laura-saas-frontend/src/contexts/`, `laura-saas-frontend/src/services/api.js`, `laura-saas-frontend/src/components/ProtectedRoute.jsx`

**Key Components**:
- `AuthContext.jsx` — Global auth state (user, tenant, tokens), login/logout/register, refresh token rotation, localStorage persistence
- `ThemeContext.jsx` — Dark/light mode toggle with localStorage persistence
- `api.js` — Axios instance with JWT injection interceptor, automatic 401 → token refresh → retry, 30s graceful redirect on session expiry
- `ProtectedRoute.jsx` — Route guard component
- `App.tsx` — React Router v7 route tree (26 pages registered)
- `serviceWorkerService.ts` — Workbox service worker registration and update handling

**Technologies**: React 19, React Router DOM v7, Axios, Vite PWA (Workbox)

**Dependencies**:
- Internal: All FE feature modules consume this context
- External: `[API]` (backend REST), Browser PWA APIs

**Patterns**:
- Context + Provider pattern (Auth, Theme)
- Token refresh with in-flight request queuing (subscriber pattern in `api.js`)
- Progressive Web App (offline-first with Workbox)

**Key Files**:
- `laura-saas-frontend/src/contexts/AuthContext.jsx`
- `laura-saas-frontend/src/services/api.js`
- `laura-saas-frontend/src/App.tsx`

**Scope**: Medium — 6 core files, underpins all frontend modules

---

### [FE-DASH]: Dashboard & Calendar

**Purpose**: Main landing view after login — KPI cards, trial/email banners, appointment calendar (FullCalendar), revenue charts (Recharts), and quick appointment creation.

**Location**: `laura-saas-frontend/src/pages/Dashboard.jsx`, `laura-saas-frontend/src/pages/CalendarView.jsx`, `laura-saas-frontend/src/components/DashboardChart.jsx`, `laura-saas-frontend/src/components/RevenueLineChart.jsx`, `laura-saas-frontend/src/components/ServicePieChart.jsx`, `laura-saas-frontend/src/components/TopClientsTable.jsx`

**Key Components**:
- Dashboard KPI cards (agendamentos hoje/amanhã, clientes da semana, sessões baixas)
- Trial expiry banner (amber, ≤3 days remaining)
- Email verification banner (blue, when `emailVerificado === false`)
- `CalendarView` — FullCalendar with day/week/month views, quick appointment modal
- Chart components (revenue line, service pie, top clients table)

**Technologies**: FullCalendar (React), Recharts, `[FE-CORE]` (AuthContext, api.js)

**Dependencies**:
- Internal: `[FE-CORE]`, `[FE-SCHED]` (QuickAppointmentModal)
- External: `[SCHED]` endpoints, `[FIN]` analytics endpoints

**Scope**: Medium — 6 files (2 pages + 4 chart/widget components)

---

### [FE-SCHED]: Scheduling UI

**Purpose**: Appointment management views — list, creation form, editing form, detail modal with status transitions, and rescheduling confirmation.

**Location**: `laura-saas-frontend/src/pages/Agendamentos.jsx`, `laura-saas-frontend/src/pages/CriarAgendamento.jsx`, `laura-saas-frontend/src/pages/EditarAgendamento.jsx`, `laura-saas-frontend/src/components/AppointmentDetailModal.jsx`, `laura-saas-frontend/src/components/QuickAppointmentModal.jsx`, `laura-saas-frontend/src/components/RescheduleConfirmModal.jsx`

**Key Components**:
- Appointment list with date filter and status indicators
- Create/Edit forms with client search, service, time, duration, package linkage
- Detail modal with status change actions and WhatsApp reminder trigger
- Quick appointment modal (accessible from calendar)

**Technologies**: React Hook Form, Zod (schema validation), `[FE-CORE]`

**Scope**: Medium — 3 pages + 3 modal components

---

### [FE-CRM]: Client UI

**Purpose**: Client management views — searchable list, creation and editing forms, anamnese form, and attendance history viewer.

**Location**: `laura-saas-frontend/src/pages/Clientes.jsx`, `laura-saas-frontend/src/pages/CriarCliente.jsx`, `laura-saas-frontend/src/pages/EditarCliente.jsx`, `laura-saas-frontend/src/pages/Atendimentos.jsx`, `laura-saas-frontend/src/components/HistoricoAtendimentos.jsx`

**Key Components**:
- Client list with search (`?search=`) and active/inactive filter
- Create/Edit with anamnese (health form) embedded
- Attendance history with session consumption visualization
- `FinalizarAtendimentoModal` — finalizes session, links payment

**Technologies**: React Hook Form, `[FE-CORE]`

**Scope**: Medium — 4 pages + 2 components

---

### [FE-PKG]: Packages UI

**Purpose**: Package template management and the sales flow for creating package purchases for clients.

**Location**: `laura-saas-frontend/src/pages/Pacotes.jsx`, `laura-saas-frontend/src/pages/CriarPacote.jsx`, `laura-saas-frontend/src/pages/EditarPacote.jsx`, `laura-saas-frontend/src/pages/VenderPacote.jsx`, `laura-saas-frontend/src/pages/PacotesAtivos.jsx`

**Key Components**:
- Package template list and CRUD
- `VenderPacote` — sales form with client search, package selection, payment method, custom total value, session tracking
- `PacotesAtivos` — active purchases per client with remaining sessions visualization

**Technologies**: React Hook Form, `[FE-CORE]`

**Scope**: Small-Medium — 5 pages

---

### [FE-FIN]: Financial UI

**Purpose**: Financial overview pages — transaction list, cash register operations, and financial summary.

**Location**: `laura-saas-frontend/src/pages/Financeiro.jsx`, `laura-saas-frontend/src/pages/Transacoes.jsx`, `laura-saas-frontend/src/pages/Caixa.jsx`, `laura-saas-frontend/src/components/RegistrarPagamentoModal.jsx`

**Key Components**:
- Financial summary (revenue, expenses, balance)
- Transaction log with filters
- Caixa (cash register) — open/close session with balance
- Payment registration modal

**Technologies**: Recharts (charts in Financeiro), `[FE-CORE]`

**Scope**: Small-Medium — 3 pages + 1 modal component

---

### [FE-SETTINGS]: Settings & Config UI

**Purpose**: Tenant configuration, professional availability setup, and user profile/password management.

**Location**: `laura-saas-frontend/src/pages/Configuracoes.jsx`, `laura-saas-frontend/src/pages/Disponibilidade.tsx`, `laura-saas-frontend/src/pages/Home.jsx`, `laura-saas-frontend/src/pages/LandingPage.jsx`

**Key Components**:
- `Configuracoes` — Edit company name, contact data, WhatsApp config, plan info display
- `Disponibilidade` — Per-weekday availability config (start, end, interval, active toggle)
- `LandingPage` — Public marketing page
- `Home` — Auth redirect handler

**Technologies**: React Hook Form, Zod, TypeScript (Disponibilidade.tsx), `[FE-CORE]`

**Scope**: Small — 4 pages

---

### [DATA]: Data Layer

**Purpose**: Mongoose schema definitions, composite indexes, migrations (tenant data migration from shared to isolated DBs), and seed data.

**Location**: `src/models/`, `src/migrations/`, `src/scripts/`, `seeds/`

**Key Components**:
- 12 Mongoose schemas (9 tenant-scoped via registry, 2 global: Tenant/User, 1 global: UserSubscription)
- Composite indexes on high-traffic query patterns:
  - `Tenant`: slug (unique), plano.status, plano.tipo, ativo, createdAt
  - `Agendamento`: expected `{tenantId, data}`, `{tenantId, estado}`, `{tenantId, clienteId}`
  - `Cliente`: expected `{tenantId, telefone}` unique, `{tenantId, nome}` text
- Migration scripts for database-per-tenant transition (`migrateFromTestToLaura.js`, `createLauraTenant.js`)
- `registry.js` — Tenant model factory

**Technologies**: Mongoose 8, MongoDB Atlas

**Dependencies**:
- Internal: `[TENANT]` (registry), all domain modules consume models
- External: MongoDB Atlas

**Patterns**:
- Schema-per-collection with explicit index definitions
- Virtual fields for computed properties (`isTrialExpired`, `diasRestantesTrial`)
- Pre-save hooks for business invariants (slug uniqueness)
- Export both schema and compiled model (dual export for registry compatibility)

**Key Files**:
- `src/models/registry.js`
- `src/models/Tenant.js`
- `src/models/User.js`
- `src/models/Agendamento.js`
- `src/models/Cliente.js`
- `src/models/CompraPacote.js`
- `src/models/Transacao.js`
- `src/config/db.js` — MongoDB connection setup
- `seeds/seedPacotes.js`

**Scope**: Large — 14 model files + migrations + seeds + config

---

### [INFRA]: DevOps & Infrastructure

**Purpose**: Deployment configuration, CI/CD (pending), environment variable management, health monitoring, test infrastructure.

**Location**: `render.yaml`, `vercel.json`, `jest.config.js`, `tests/`, `.env*` files

**Key Components**:
- `render.yaml` — Render.com backend deployment (Node.js, free tier, Oregon region, `npm start`, health check at `/api/health`, autoDeploy: true)
- `vercel.json` — Frontend Vercel deployment
- `jest.config.js` — Jest with ESM support (`--experimental-vm-modules`), `mongodb-memory-server` for integration tests
- `tests/` — Auth, Cliente, multi-tenant integration tests with shared setup (`tests/setup.js`)
- CORS whitelist: `laura-saas-agenda-mfqt.vercel.app` + `api.z-api.io`

**Technologies**: Render, Vercel, Jest, Supertest, mongodb-memory-server

**Dependencies**:
- Internal: All modules (deployment encompasses everything)
- External: Render.com, Vercel, GitHub (autoDeploy)

**Patterns**:
- Health check endpoint for uptime monitoring (`GET /api/health`)
- In-memory MongoDB for test isolation
- Environment-specific config via `dotenv-flow` (`.env`, `.env.development`, `.env.production`)

**Key Files**:
- `render.yaml`
- `vercel.json`
- `jest.config.js`
- `tests/setup.js`
- `tests/auth.test.js`, `tests/cliente.test.js`, `tests/multiTenant.test.js`

**Scope**: Small — configuration files + nascent test suite

---

## Cross-Cutting Concerns

### Authentication & Security
- JWT Bearer tokens (access: 1h, refresh: rotation)
- All protected routes require `authenticate` middleware
- Plan enforcement at middleware level (`requirePlan`, `checkLimit`)
- Rate limiting on auth routes (`express-rate-limit`)
- Webhook security via `x-api-token` header validation
- CORS restricted to known origins in production
- **Known gap**: Tokens stored in `localStorage` (not HttpOnly cookies)
- **Known gap**: Email verification not enforced as hard block

### Data Isolation (Multi-Tenancy)
- `tenantId` injected into every request by `authenticate` middleware
- `req.db` and `req.models` scoped to tenant's isolated MongoDB database
- Every query includes `tenantId` filter (enforced by `injectTenant` middleware)
- Global entities (Tenant, User) remain in the shared MongoDB connection

### Observability
- Structured logging: Pino (JSON format) in backend, replacing `console.log` (partially complete)
- Request logging: Morgan (dev) + custom Pino request logger
- Health check: `GET /api/health` (uptime, timestamp, env)
- **Pending**: Sentry error tracking (documented in improvement backlog)
- **Pending**: Full `console.log` → Pino migration in services

### Error Handling
- Centralized error middleware (`errorHandler.js`) — last in Express chain
- Consistent response envelope: `{ success: boolean, error?: string, data?: any }`
- Specific HTTP codes: 400 (validation), 401 (auth), 403 (plan/role), 404, 409 (conflict), 423 (locked), 500
- Frontend: Axios interceptors with toast notifications, graceful session expiry (30s delay)

### Validation
- Backend: Mongoose schema validation + manual checks in controllers
- Frontend: Zod schemas (`validationSchemas.js` in `src/schemas/`) + React Hook Form
- **Partial gap**: Not all controllers use Zod on backend (identified in improvement backlog)

### Offline / PWA
- Workbox service worker (via vite-plugin-pwa) for asset caching
- `offlineService.ts` — request queuing when offline
- PWA install prompt (`InstallPrompt.tsx`) with Marcai branding

### Deployment Pipeline
- Backend: Render autoDeploy from GitHub (main branch push triggers deploy)
- Frontend: Vercel (automatic deploys)
- **Pending**: GitHub Actions CI pipeline (documented in improvement roadmap)
- **Pending**: Automated test run on push

---

## Known Technical Debt & Active Improvement Areas

| Priority | Area | Status |
|----------|------|--------|
| Critical | Test coverage (~0% active) | In backlog |
| Critical | Sentry error tracking | In backlog |
| High | Rate limiting | Implemented |
| High | Structured logging (Pino) | Partially implemented |
| High | MongoDB composite indexes | Partially defined |
| High | GitHub Actions CI pipeline | In backlog |
| Medium | WhatsApp webhook processing queue (BullMQ) | In backlog |
| Medium | AI scheduling flow completion | In progress |
| Medium | Email verification hard enforcement | In backlog |
| Medium | Dashboard caching (node-cache) | In backlog |
| Low | localStorage → HttpOnly cookie for tokens | In backlog |
