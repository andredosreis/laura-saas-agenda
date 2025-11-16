# 💆‍♀️ LAURA SAAS AGENDA

Sistema completo de gestão de agendamentos para estética com chatbot WhatsApp inteligente (IA) e notificações automatizadas.

[![Status](https://img.shields.io/badge/status-beta-yellow)](https://github.com)
[![Node](https://img.shields.io/badge/node-v18+-green)](https://nodejs.org)
[![React](https://img.shields.io/badge/react-19.0-blue)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/mongodb-8.1-green)](https://mongodb.com)
[![OpenAI](https://img.shields.io/badge/openai-gpt--4o--mini-purple)](https://openai.com)

---

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Funcionalidades](#-funcionalidades)
- [Stack Tecnológica](#-stack-tecnológica)
- [Arquitetura](#-arquitetura)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Uso](#-uso)
- [Documentação](#-documentação)
- [Roadmap](#-roadmap)
- [Contribuindo](#-contribuindo)
- [Licença](#-licença)

---

## 🎯 Visão Geral

**LAURA SAAS AGENDA** é uma solução completa para gestão de clientes e agendamentos em clínicas de estética, com foco em automação através de:

- **Chatbot WhatsApp com IA** (GPT-4o-mini) para agendamentos automáticos
- **Dashboard inteligente** com KPIs em tempo real
- **Notificações dual-channel** (WhatsApp + Web Push)
- **PWA instalável** (Android, iOS, Desktop)
- **Lembretes automatizados** via CRON (24h antes)

### 🌟 Diferenciais

- ✅ **Zero touch**: Cliente agenda via WhatsApp sem intervenção humana
- ✅ **Offline-first**: PWA funciona sem internet
- ✅ **LGPD-ready**: Ficha de anamnese médica completa
- ✅ **Inteligente**: IA contextual com histórico de conversas
- ✅ **Escalável**: Arquitetura preparada para crescimento

---

## ⚡ Funcionalidades

### 📱 Chatbot WhatsApp (IA)
- Agendamentos automáticos via conversa natural
- Detecção de intenção (OpenAI GPT-4o-mini)
- Function Calling (criar cliente, agendar, reagendar, cancelar)
- Histórico de conversas
- Personalidade profissional (PT-PT)

### 📊 Dashboard
- Agendamentos de hoje e amanhã
- Próximos 5 agendamentos
- Clientes atendidos na semana
- Alertas de sessões baixas (≤ 2 sessões)
- Totais do sistema

### 👥 Gestão de Clientes
- CRUD completo
- Ficha de anamnese médica (20+ campos)
- Controle de sessões restantes
- Vínculo com pacotes
- Histórico de mensagens WhatsApp

### 📅 Gestão de Agendamentos
- CRUD completo
- Estados: Agendado, Confirmado, Realizado, Cancelado, Não Compareceu
- Suporte para pacotes e serviços avulsos
- Sistema de confirmação
- Envio manual de lembretes

### 📦 Gestão de Pacotes
- CRUD completo
- Categorização de serviços
- Controle de sessões e valores
- Status ativo/inativo

### 🔔 Notificações Automatizadas
- **WhatsApp** (para clientes): Lembretes 24h antes
- **Web Push** (para Laura): Novos agendamentos, alertas
- **CRON jobs**: Diário às 19h (Europe/Lisbon)

### 📱 Progressive Web App (PWA)
- Instalável (ícone na tela inicial)
- Offline-first (Service Worker)
- Push notifications
- Ícones adaptáveis (Android Adaptive Icons)
- Apple Touch Icons (iOS)

### ⏰ Gestão de Disponibilidade
- Configuração por dia da semana
- Horário de funcionamento + intervalo
- Timezone: Europe/Lisbon

---

## 🛠️ Stack Tecnológica

### Backend
```
Runtime:      Node.js (ES Modules)
Framework:    Express.js 4.19.2
Database:     MongoDB 8.1.2 (Mongoose ODM)
IA/LLM:       OpenAI API 4.26.0 (GPT-4o-mini)
WhatsApp:     Z-API
Notifications: web-push 3.6.7
CRON:         node-cron 3.0.3
DateTime:     luxon 3.7.2 (Europe/Lisbon)
Testing:      Jest 29.7.0 + Supertest 6.3.4
```

### Frontend
```
Framework:    React 19.0.0
Build:        Vite 6.3.5
Language:     TypeScript 5.9.2
Router:       React Router DOM 7.5.2
UI:           TailwindCSS 3.4.3
PWA:          vite-plugin-pwa 1.1.0
Notifications: react-toastify 11.0.5
Analytics:    @vercel/speed-insights 1.2.0
```

### Integrações
```
WhatsApp:     Z-API WhatsApp Business API
IA:           OpenAI GPT-4o-mini + GPT-3.5-turbo
Database:     MongoDB Atlas (Cloud)
Deploy:       Vercel (Frontend)
Push:         Web Push Protocol (VAPID)
```

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAURA SAAS - ECOSSISTEMA                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐         ┌──────────────┐                      │
│  │   FRONTEND   │ ◄─────► │   BACKEND    │                      │
│  │ React + Vite │   API   │ Node.js +    │                      │
│  │  (PWA App)   │  REST   │   Express    │                      │
│  └──────────────┘         └──────┬───────┘                      │
│         │                        │                               │
│         │                        ├─────► MongoDB Atlas           │
│         │                        │       (Database)              │
│         │                        │                               │
│         │                        ├─────► OpenAI GPT-4o-mini     │
│         │                        │       (LLM Agent)             │
│         │                        │                               │
│         │                        └─────► Z-API WhatsApp          │
│         │                                (Integração Webhook)    │
│         │                                                         │
│         └──────────────────────────────► Web Push Service        │
│                                          (Notificações)          │
└─────────────────────────────────────────────────────────────────┘
```

**Documentação completa:** [docs/ARQUITETURA.md](docs/ARQUITETURA.md)

---

## 🚀 Instalação

### Pré-requisitos

- Node.js 18+ ([Download](https://nodejs.org))
- MongoDB Atlas account ([Criar conta](https://mongodb.com/cloud/atlas))
- OpenAI API Key ([Criar key](https://platform.openai.com/api-keys))
- Z-API account ([Criar conta](https://z-api.io))

### Clone o Repositório

```bash
git clone https://github.com/seu-usuario/laura-saas-agenda.git
cd laura-saas-agenda
```

### Instalar Dependências

#### Backend
```bash
npm install
```

#### Frontend
```bash
cd laura-saas-frontend
npm install
cd ..
```

---

## ⚙️ Configuração

### 1. Variáveis de Ambiente

O projeto já possui arquivos `.env` configurados. Certifique-se de que contêm:

#### Backend (`.env.local`)
```env
# Porta do servidor
PORT=5000

# MongoDB
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/lauraDB

# Ambiente
NODE_ENV=development

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Z-API WhatsApp
ZAPI_INSTANCE_ID=your_instance_id
ZAPI_TOKEN=your_token
ZAPI_BASE_URL=https://api.z-api.io/instances/{instance}/token/{token}

# Web Push (VAPID)
VAPID_PUBLIC_KEY=BJ...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:support@laurasaas.com
```

#### Frontend (`laura-saas-frontend/.env.local`)
```env
VITE_API_URL=http://localhost:5000/api
VITE_VAPID_PUBLIC_KEY=BJ...
```

### 2. Gerar VAPID Keys (Web Push)

```bash
node generate-vapid.js
```

Copie as keys geradas para os arquivos `.env`.

### 3. Popular Banco de Dados (Seed)

```bash
npm run seed
```

Isso criará pacotes iniciais no MongoDB.

---

## 🎮 Uso

### Desenvolvimento

#### 1. Iniciar Backend
```bash
npm run dev
# Servidor rodando em http://localhost:5000
```

#### 2. Iniciar Frontend (em outro terminal)
```bash
cd laura-saas-frontend
npm run dev
# App rodando em http://localhost:5173
```

#### 3. Acessar Dashboard
Abra o navegador em: `http://localhost:5173`

---

### Produção

#### Build Frontend
```bash
cd laura-saas-frontend
npm run build
```

#### Deploy Frontend (Vercel)
```bash
vercel deploy --prod
```

#### Deploy Backend
Configure variáveis de ambiente no seu provedor (Railway, Render, etc.) e faça deploy do diretório raiz.

---

## 📚 Documentação

### Documentação Disponível

- **[ANALISE_COMPLETA.md](docs/ANALISE_COMPLETA.md)**: Análise técnica detalhada (127 arquivos, 15k+ LOC)
- **[ARQUITETURA.md](docs/ARQUITETURA.md)**: Diagramas, fluxos e decisões arquiteturais
- **[ARQUITETURA_PWA.md](assets/docs/ARQUITETURA_PWA.md)**: Documentação PWA v2
- **[CHECKLIST_PWA.md](assets/docs/CHECKLIST_PWA.md)**: Checklist de implementação PWA
- **[systemLaura.md](src/prompt/systemLaura.md)**: System prompt do chatbot IA

### Endpoints API

#### Clientes
- `GET /api/clientes` - Listar todos
- `GET /api/clientes/:id` - Buscar por ID
- `POST /api/clientes` - Criar
- `PUT /api/clientes/:id` - Atualizar
- `DELETE /api/clientes/:id` - Deletar

#### Agendamentos
- `GET /api/agendamentos` - Listar todos
- `GET /api/agendamentos/:id` - Buscar por ID
- `POST /api/agendamentos` - Criar
- `PUT /api/agendamentos/:id` - Atualizar
- `DELETE /api/agendamentos/:id` - Deletar
- `POST /api/agendamentos/:id/enviar-lembrete` - Enviar lembrete manual

#### Dashboard
- `GET /api/dashboard/agendamentosHoje`
- `GET /api/dashboard/agendamentosAmanha`
- `GET /api/dashboard/proximos-agendamentos`
- `GET /api/dashboard/clientesAtendidosSemana`
- `GET /api/dashboard/sessoes-baixas`
- `GET /api/dashboard/totais`

#### Webhooks
- `POST /webhook/whatsapp` - Receber mensagens Z-API

**Documentação completa (Swagger):** (em desenvolvimento)

---

## 🗺️ Roadmap

### ✅ Concluído (v1.0 - MVP)
- ✅ CRUD Clientes, Agendamentos, Pacotes
- ✅ Chatbot WhatsApp com IA (GPT-4o-mini)
- ✅ Dashboard com KPIs
- ✅ PWA instalável
- ✅ Notificações dual-channel
- ✅ CRON lembretes automatizados

### 🔄 Em Andamento (v1.1)
- ⏳ Autenticação JWT
- ⏳ LGPD compliance (consent forms + criptografia)
- ⏳ Rate limiting
- ⏳ Logging estruturado (Winston)
- ⏳ Error tracking (Sentry)

### 📅 Próximas Versões

#### v1.2 (Sprint 2-4 - 30 dias)
- Redis cache (KPIs, queries)
- Bull queue (WhatsApp + LLM)
- PWA offline mode completo (IndexedDB)
- MongoDB índices otimizados
- Testes E2E (Playwright)
- Coverage 80%+

#### v1.3 (Sprint 5-8 - 60 dias)
- Dashboard financeiro completo
- Analytics avançado (no-show rate, conversão)
- Integração pagamentos (Stripe)
- Multi-usuário (roles: admin, recepcionista)
- Calendário visual (FullCalendar)

#### v2.0 (Sprint 9+ - 90 dias)
- Migração para TypeScript (backend)
- LangChain.js + LangGraph
- Microserviço IA (Python)
- n8n workflow orchestration
- Mobile app nativo (React Native)
- Multi-tenant (múltiplas clínicas)

---

## 🐛 Problemas Conhecidos

### Críticos
- ⚠️ **Sem autenticação**: APIs expostas publicamente (em desenvolvimento)
- ⚠️ **LGPD**: Dados médicos sem criptografia (em desenvolvimento)

### Importantes
- ⚠️ Webhook Z-API sem validação de signature
- ⚠️ PWA offline mode incompleto (IndexedDB)
- ⚠️ Sem rate limiting

### Desejáveis
- 💡 Backend em JavaScript (migrar para TypeScript)
- 💡 Testes com coverage < 20% (target: 80%)
- 💡 Sem monitoramento estruturado (Prometheus/Grafana)

**Ver lista completa:** [docs/ANALISE_COMPLETA.md#11-pontos-de-atenção-e-melhorias](docs/ANALISE_COMPLETA.md#11-pontos-de-aten%C3%A7%C3%A3o-e-melhorias)

---

## 🧪 Testes

### Executar Testes
```bash
npm test
```

### Testes com Coverage
```bash
npm test -- --coverage
```

### Testes Disponíveis
- `tests/cliente.test.js` - Testes de Cliente (CRUD)
- `tests/test_zapi.js` - Testes de integração Z-API

**Coverage atual:** ~20%
**Target:** 80%+

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor, siga estas etapas:

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

### Diretrizes

- Código TypeScript (ou JavaScript com JSDoc)
- Testes unitários obrigatórios
- Coverage mínimo: 70%
- ESLint sem erros
- Commits semânticos (Conventional Commits)

---

## 📊 Status do Projeto

- **Versão:** 1.0.0 (MVP)
- **Status:** Beta (com clientes reais)
- **Última atualização:** 16 de Novembro de 2025
- **Licença:** [Definir]

---

## 📞 Suporte

- **Email:** [seu-email@exemplo.com]
- **Issues:** [GitHub Issues](https://github.com/seu-usuario/laura-saas-agenda/issues)
- **Documentação:** [docs/](docs/)

---

## 🙏 Agradecimentos

- [OpenAI](https://openai.com) - GPT-4o-mini
- [Z-API](https://z-api.io) - WhatsApp Business API
- [MongoDB](https://mongodb.com) - Database
- [Vercel](https://vercel.com) - Hosting
- [React](https://react.dev) - Frontend framework
- [Vite](https://vitejs.dev) - Build tool
- [TailwindCSS](https://tailwindcss.com) - CSS framework

---

## 📄 Licença

[Definir licença - MIT, Apache 2.0, etc.]

---

## 🌟 Star History

Se este projeto foi útil, considere dar uma ⭐!

---

**Desenvolvido com ❤️ por André dos Reis**
