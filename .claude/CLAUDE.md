# Laura SaaS Agenda - Contexto do Projeto

## Visão Geral
Sistema SaaS de gestão de agendamentos para profissionais de saúde/estética.
Autor: André dos Reis

## Stack
- **Backend**: Node.js (ESM) + Express + MongoDB/Mongoose
- **Frontend**: React + TypeScript + Vite (PWA)
- **Notificações**: Web Push (VAPID)
- **Integrações**: WhatsApp via webhook, OpenAI

## Estrutura de Diretórios

```
laura-saas-agenda/
├── src/                        # Backend
│   ├── server.js               # Entry point
│   ├── app.js                  # Express setup
│   ├── controllers/            # Lógica de negócio
│   ├── models/                 # Mongoose schemas
│   ├── routes/                 # Rotas Express
│   ├── services/               # Serviços externos
│   ├── middlewares/            # Auth, validação
│   └── utils/                  # Helpers
├── laura-saas-frontend/        # Frontend React
│   └── src/
│       ├── pages/              # Páginas da aplicação
│       ├── components/         # Componentes reutilizáveis
│       ├── contexts/           # React Contexts
│       ├── services/           # Chamadas de API
│       └── types/              # TypeScript types
├── .claude/
│   ├── CLAUDE.md               # Este arquivo
│   ├── docs/                   # Documentação técnica
│   └── agents/                 # Definições de agentes
└── seeds/                      # Seeds do banco
```

## Models Principais
- `Agendamento` - agendamentos de clientes
- `Cliente` - cadastro de clientes
- `Pacote` / `CompraPacote` - pacotes de serviços
- `Pagamento` / `Transacao` - financeiro
- `HistoricoAtendimento` - histórico de atendimentos
- `Tenant` - multi-tenancy
- `User` / `UserSubscription` - autenticação e assinaturas

## Páginas Frontend
- Dashboard, CalendarView, Agendamentos
- Clientes, CriarCliente, EditarCliente
- Pacotes, CriarPacote, EditarPacote, VenderPacote, PacotesAtivos
- Financeiro, Caixa, Transacoes
- Atendimentos, Disponibilidade
- Login, Register, ForgotPassword, ResetPassword

## Convenções
- Backend usa ES Modules (`"type": "module"`)
- Frontend usa `.jsx` para React e `.tsx` para TypeScript
- Auth via JWT (access token 1h)
- Multi-tenant: cada usuário tem seu próprio contexto de dados

## Scripts Úteis
```bash
# Backend
npm run dev       # nodemon src/server.js
npm start         # node src/server.js

# Frontend
cd laura-saas-frontend
npm run dev       # Vite dev server
npm run build     # Build produção
```
