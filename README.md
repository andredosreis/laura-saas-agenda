# Marcai — Laura SAAS Agenda

Sistema SaaS multi-tenant de gestão de agendamentos para profissionais de saúde e estética.
Nome comercial: **Marcai**.

**Autor:** André dos Reis

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 18+ (ESM) + Express + MongoDB/Mongoose (DB-per-tenant) |
| Frontend | React 19 + TypeScript + Vite 6 + Tailwind CSS (PWA) |
| Serviço de IA | Python (FastAPI + LangChain) — agente conversacional (Gemini / OpenAI) |
| Autenticação | JWT (access token 1h + refresh token 7d) |
| Email | Resend |
| Notificações | Web Push (VAPID) + WhatsApp |
| Filas / Lembretes | BullMQ + Redis |
| WhatsApp | Evolution API (v2, self-hosted) |
| Timezone | Europe/Lisbon (Luxon) |

---

## Funcionalidades

- **Dashboard** com KPIs em tempo real (agendamentos do dia, clientes atendidos, sessões baixas)
- **Gestão de Clientes** — CRUD completo + ficha de anamnese médica
- **Gestão de Agendamentos** — estados (agendado, confirmado, realizado, cancelado, não compareceu)
- **Gestão de Pacotes** — criação, venda e controlo de sessões
- **Financeiro** — caixa, transações e pagamentos
- **Agente de IA no WhatsApp** — agendamentos, reagendamentos e conversão de leads via conversa (microserviço Python com LangChain)
- **Inbox de Conversas** — painel unificado de conversas (lead + cliente) com handoff humano (pausar/retomar a IA por contacto)
- **Notificações dual-channel** — WhatsApp (clientes) + Web Push (profissional)
- **Lembretes automáticos** — via fila BullMQ/Redis
- **PWA instalável** — funciona em Android, iOS e Desktop
- **Multi-tenant** — cada profissional tem a sua própria base de dados isolada

---

## Arquitectura Multi-Tenant (DB-per-tenant)

Cada tenant tem a **sua própria base de dados** (`tenant_<id>`), isolada das restantes:

- O registo cria um `Tenant` + utilizador admin (numa base partilhada com `Tenant`/`User`)
- Os dados de negócio (`Cliente`, `Agendamento`, `Pacote`, etc.) vivem na DB do tenant
- O JWT carrega o `tenantId`; cada pedido abre a conexão à DB desse tenant
- Acesso a um recurso de outro tenant devolve `404` (nunca revela que existe)

> Versionamento da API: as rotas estão montadas em **dual-path** — `/api/<recurso>` (legacy) e `/api/v1/<recurso>` (canónico para novos clientes).

---

## Componentes em produção

```
                         Internet
                            │
                  ┌─────────▼──────────┐
                  │  nginx (80/443)    │  ← único ponto exposto, TLS Let's Encrypt
                  │  reverse proxy     │
                  └──┬──────┬──────┬───┘
          api.───────┘   wa.┘  logs.└──────────┐
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ backend Node │ │ Evolution v2 │ │   Dozzle     │
   │  (Express)   │ │  (WhatsApp)  │ │ (logs web)   │
   └──┬────────┬──┘ └──────┬───────┘ └──────────────┘
      │        │           │
      │   ┌────▼─────┐ ┌───▼────┐
      │   │ia-service│ │Postgres│  (rede interna Docker — nada exposto)
      │   │ (Python) │ └────────┘
      │   └──────────┘
   ┌──▼────┐
   │ Redis │  (BullMQ — lembretes + cache Evolution)
   └───────┘

   MongoDB Atlas (UE) ◄── conexão externa (DB-per-tenant)
   Frontend PWA      ◄── Vercel
```

Ver `docker-compose.prod.yml` e o runbook `deploy/SETUP-CONTABO.md`.

---

## Estrutura do Projecto

```
laura-saas-agenda/
├── src/                        # Backend Node.js (ESM)
│   ├── server.js               # Entry point (Express + worker de lembretes)
│   ├── app.js                  # Setup Express, middlewares, rotas (dual-mount /api e /api/v1)
│   ├── modules/                # Layout modular (auth, clientes, agendamento,
│   │                           #   financeiro, ia, messaging, ...) — ADR-011
│   ├── controllers/ routes/    # Módulos ainda não migrados (dashboard, analytics, ...)
│   ├── models/                 # Mongoose schemas + registry (DB-per-tenant)
│   ├── middlewares/            # Auth, rate limiting, validação, webhook
│   ├── queues/ workers/        # BullMQ (filas + worker de notificações)
│   ├── services/ utils/        # Email (Resend), Web Push, Evolution client, helpers
│   └── config/                 # Conexão DB-per-tenant (tenantDB.js)
├── ia-service/                 # Microserviço Python (FastAPI + LangChain)
│   └── src/ia_service/         # Agente de IA: lead + client orchestrators
├── laura-saas-frontend/        # Frontend React (migração TS em curso)
│   └── src/                    # pages, components, contexts, services (api.js), schemas, types
├── nginx/conf.d/               # Config do reverse proxy + TLS (produção)
├── deploy/                     # init-letsencrypt.sh + runbook SETUP-CONTABO.md
├── docker-compose.prod.yml     # Topologia de produção (Contabo)
├── Dockerfile                  # Imagem do backend
└── .env.production.example     # Template de variáveis de produção
```

---

## Desenvolvimento local

### Pré-requisitos

- Node.js >= 18 e npm >= 9
- Python 3.12+ (para o `ia-service`, opcional)
- Conta MongoDB Atlas (ou instância local)

### Backend

```bash
git clone https://github.com/andredosreis/laura-saas-agenda.git
cd laura-saas-agenda
npm install
cp .env.example .env          # editar com os valores correctos
npm run dev                   # http://localhost:5000
# verificar: GET http://localhost:5000/api/auth/me → 401 (API activa)
```

### Frontend

```bash
cd laura-saas-frontend
npm install
cp .env.example .env
npm run dev                   # http://localhost:5173
```

### ia-service (opcional)

```bash
cd ia-service
uv sync                       # ou: pip install -e .
cp .env.example .env
PYTHONPATH=src .venv/bin/uvicorn ia_service.main:app --port 8000
```

---

## Variáveis de Ambiente (backend `.env`)

```env
# MongoDB (DB-per-tenant)
MONGODB_URI=mongodb+srv://utilizador:senha@cluster.mongodb.net/
MONGODB_DB_PREFIX=marcai

# JWT
JWT_SECRET=chave-secreta-muito-longa
JWT_REFRESH_SECRET=outra-chave-secreta

# Servidor
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Email (Resend)
RESEND_API_KEY=re_...
EMAIL_FROM=Marcai <no-reply@exemplo.pt>

# Web Push — gerar com: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:seu@email.com

# Redis (BullMQ — lembretes)
REDIS_URL=redis://localhost:6379

# WhatsApp (Evolution API)
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=...
EVOLUTION_WEBHOOK_SECRET=...

# Microserviço de IA
IA_SERVICE_URL=http://localhost:8000
IA_SERVICE_ENABLED=true
INTERNAL_SERVICE_TOKEN=...     # tem de ser IGUAL no backend e no ia-service
```

Frontend (`laura-saas-frontend/.env`):

```env
VITE_API_URL=http://localhost:5000/api/v1
```

> Em produção, ver `.env.production.example` (inclui `POSTGRES_PASSWORD`, `GOOGLE_API_KEY`, `LLM_PROVIDER`, etc.).

---

## Principais Rotas da API

### Autenticação (`/api/v1/auth`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/register` | Criar conta (cria Tenant + User admin) |
| POST | `/login` | Autenticar |
| POST | `/refresh` | Renovar access token |
| GET | `/me` | Dados do utilizador autenticado |
| POST | `/forgot-password` | Solicitar recuperação de senha |
| POST | `/reset-password` | Redefinir senha com token |
| GET | `/verify-email/:token` | Confirmar email |

### Recursos (autenticados, isolados por tenant)

| Recurso | Base URL |
|---------|----------|
| Clientes | `/api/v1/clientes` |
| Agendamentos | `/api/v1/agendamentos` |
| Pacotes | `/api/v1/pacotes` |
| Financeiro | `/api/v1/financeiro` |
| Conversas (inbox) | `/api/v1/conversas` |
| Dashboard | `/api/v1/dashboard` |

### Webhook

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/webhook/evolution` | Receber mensagens do WhatsApp (Evolution API) — validado por header `apikey` |

---

## Scripts

```bash
# Backend
npm run dev       # Nodemon (hot reload)
npm start         # Produção
npm test          # Jest (mongodb-memory-server)
npm run seed      # Popular pacotes de exemplo

# Frontend
npm run dev       # Vite dev server
npm run build     # Build de produção
npm run lint      # ESLint
```

---

## Implantação (Produção)

Toda a computação corre num **VPS único (Contabo)** orquestrado por Docker Compose,
com o MongoDB no Atlas e o frontend na Vercel (ADR-023).

```bash
# no servidor, com o .env preenchido
docker compose -f docker-compose.prod.yml up -d --build
```

Passo-a-passo completo (hardening, TLS, cutover do WhatsApp): **`deploy/SETUP-CONTABO.md`**.
Painel de logs web: Dozzle (`logs.<dominio>`).

---

## Planos

| Plano | Trial | Clientes | Agendamentos/mês |
|-------|-------|----------|-----------------|
| Básico | 7 dias | 50 | 100 |
| Pro | — | ilimitado | ilimitado |
| Elite | — | ilimitado | ilimitado + IA |

---

## Licença

ISC — André dos Reis
