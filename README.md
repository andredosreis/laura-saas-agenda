# Laura SAAS Agenda

Sistema SaaS multi-tenant de gestão de agendamentos para profissionais de saúde e estética.

**Autor:** André dos Reis

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 18+ (ESM) + Express 4 + MongoDB/Mongoose |
| Frontend | React 19 + TypeScript + Vite 6 + Tailwind CSS (PWA) |
| Autenticação | JWT (access token 1h + refresh token 7d) |
| Email | Nodemailer (SMTP) |
| Notificações | Web Push (VAPID) |
| Integrações | WhatsApp via Z-API, OpenAI GPT-4o-mini |

---

## Funcionalidades

- **Dashboard** com KPIs em tempo real (agendamentos do dia, clientes atendidos, sessões baixas)
- **Gestão de Clientes** — CRUD completo + ficha de anamnese médica
- **Gestão de Agendamentos** — estados (agendado, confirmado, realizado, cancelado, não compareceu)
- **Gestão de Pacotes** — criação, venda e controlo de sessões
- **Financeiro** — caixa e transações
- **Chatbot WhatsApp com IA** — agendamentos automáticos via conversa (GPT-4o-mini + Function Calling)
- **Notificações dual-channel** — WhatsApp (clientes) + Web Push (profissional)
- **Lembretes automáticos** — CRON diário às 19h (Europe/Lisbon)
- **PWA instalável** — funciona em Android, iOS e Desktop
- **Multi-tenant** — cada profissional tem os seus dados isolados

---

## Arquitectura Multi-Tenant

Banco partilhado com isolamento por `tenantId`:

- Cada registo cria um `Tenant` próprio + utilizador admin
- Todos os documentos (`Cliente`, `Agendamento`, etc.) ficam vinculados ao `tenantId`
- O JWT carrega o `tenantId`, garantindo isolamento automático nas rotas protegidas
- O mesmo número de telefone pode existir em tenants diferentes (índice composto `{ tenantId, telefone }`)

---

## Estrutura do Projecto

```
laura-saas-agenda/
├── src/                        # Backend
│   ├── server.js               # Entry point
│   ├── app.js                  # Express setup
│   ├── controllers/            # Lógica de negócio
│   ├── models/                 # Mongoose schemas
│   ├── routes/                 # Rotas Express
│   ├── services/               # Email, Web Push, WhatsApp, OpenAI
│   ├── middlewares/            # Auth, validação
│   └── utils/                  # Helpers
├── laura-saas-frontend/        # Frontend React
│   └── src/
│       ├── pages/              # Páginas da aplicação
│       ├── components/         # Componentes reutilizáveis
│       ├── contexts/           # AuthContext, ThemeContext
│       ├── services/           # Axios (api.js)
│       ├── schemas/            # Validação com Zod
│       └── types/              # TypeScript types
├── seeds/                      # Seeds do banco de dados
├── .env.example                # Variáveis de ambiente do backend
└── laura-saas-frontend/
    └── .env.example            # Variáveis de ambiente do frontend
```

---

## Instalação

### Pré-requisitos

- Node.js >= 18
- npm >= 9
- Conta MongoDB Atlas (ou instância local)

### 1. Clonar o repositório

```bash
git clone https://github.com/andredosreis/laura-saas-agenda.git
cd laura-saas-agenda
```

### 2. Backend

```bash
npm install
cp .env.example .env
# Editar .env com os valores corretos
npm run dev
```

O backend corre em `http://localhost:5000`.

### 3. Frontend

```bash
cd laura-saas-frontend
npm install
cp .env.example .env
# Editar .env com os valores corretos
npm run dev
```

O frontend corre em `http://localhost:5173`.

---

## Variáveis de Ambiente

### Backend (`.env`)

```env
# MongoDB
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/lauraDB

# JWT
JWT_SECRET=chave-secreta-muito-longa
JWT_REFRESH_SECRET=outra-chave-secreta

# Servidor
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu@email.com
SMTP_PASS=senha-de-app
SMTP_FROM="Laura SAAS" <noreply@laurasaas.com>

# Web Push — gerar com: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:seu@email.com

# OpenAI (opcional — chatbot WhatsApp)
OPENAI_API_KEY=sk-proj-...

# Z-API WhatsApp (opcional)
ZAPI_INSTANCE_ID=...
ZAPI_TOKEN=...
```

### Frontend (`laura-saas-frontend/.env`)

```env
VITE_API_URL=http://localhost:5000/api
```

---

## Principais Rotas da API

### Autenticação (`/api/auth`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/register` | Criar conta (cria Tenant + User admin) |
| POST | `/login` | Autenticar |
| POST | `/refresh` | Renovar access token |
| POST | `/logout` | Terminar sessão |
| GET | `/me` | Dados do utilizador autenticado |
| PUT | `/profile` | Atualizar perfil |
| PUT | `/password` | Alterar senha |
| POST | `/forgot-password` | Solicitar recuperação de senha |
| POST | `/reset-password` | Redefinir senha com token |
| GET | `/verify-email/:token` | Confirmar email |

### Recursos (todos autenticados e isolados por tenant)

| Recurso | Base URL |
|---------|----------|
| Clientes | `/api/clientes` |
| Agendamentos | `/api/agendamentos` |
| Pacotes | `/api/pacotes` |
| Financeiro | `/api/financeiro` |
| Dashboard | `/api/dashboard` |
| Disponibilidade | `/api/disponibilidade` |

### Webhooks

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/webhook/whatsapp` | Receber mensagens Z-API |

---

## Scripts

```bash
# Backend
npm run dev       # Nodemon (hot reload)
npm start         # Produção
npm run seed      # Popular banco com pacotes de exemplo

# Frontend
npm run dev       # Vite dev server
npm run build     # Build produção
npm run preview   # Preview do build
```

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
