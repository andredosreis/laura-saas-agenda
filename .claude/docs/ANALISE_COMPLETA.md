# 📊 ANÁLISE COMPLETA - LAURA SAAS AGENDA

**Data da Análise:** 16 de Novembro de 2025
**Status do Projeto:** BETA (com clientes reais em produção)
**Arquivos Analisados:** 127 arquivos
**Linhas de Código:** ~15.000+ LOC

---

## 📑 Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Stack Tecnológica Completa](#2-stack-tecnológica-completa)
3. [Modelos de Dados (MongoDB)](#3-modelos-de-dados-mongodb)
4. [Estrutura de Rotas e APIs](#4-estrutura-de-rotas-e-apis)
5. [Principais Funcionalidades](#5-principais-funcionalidades-implementadas)
6. [Integrações Externas](#6-integrações-externas)
7. [Fluxos Principais](#7-fluxos-principais-da-aplicação)
8. [Sistema de Autenticação](#8-sistema-de-autenticação)
9. [Estrutura de Pastas](#9-estrutura-de-pastas-completa)
10. [Documentação Técnica](#10-documentação-técnica-encontrada)
11. [Pontos de Atenção](#11-pontos-de-atenção-e-melhorias)
12. [Divergências Arquiteturais](#12-divergências-arquiteturais)
13. [Checklist de Ações](#13-checklist-de-ações-recomendadas)
14. [Sumário Executivo](#14-sumário-executivo)

---

## 1. Visão Geral da Arquitetura

### 1.1 Tipo de Arquitetura

**Arquitetura Monolítica Full-Stack com Integração de IA**

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

### 1.2 Características da Arquitetura

- **Monolito Modular**: Backend e Frontend separados, mas com acoplamento via API REST
- **Event-Driven (Parcial)**: Webhooks Z-API + CRON jobs
- **Progressive Web App**: Frontend instalável com Service Worker
- **IA Conversacional**: Chatbot WhatsApp com GPT-4o-mini e Function Calling
- **Dual-Channel Notifications**: WhatsApp (clientes) + Web Push (Laura)

---

## 2. Stack Tecnológica Completa

### 2.1 Backend (Node.js)

#### Runtime & Framework
```json
{
  "runtime": "Node.js (ES Modules)",
  "framework": "Express.js 4.19.2",
  "environment": "dotenv-flow 4.1.0 (multi-ambiente)"
}
```

#### Database
```json
{
  "database": "MongoDB 8.1.2",
  "odm": "Mongoose",
  "host": "MongoDB Atlas (Cloud)",
  "database_name": "lauraDB"
}
```

#### IA & LLM
```json
{
  "provider": "OpenAI API 4.26.0",
  "model": "GPT-4o-mini",
  "features": [
    "Function Calling (Tool Use)",
    "Intent Classification",
    "Conversational Agent"
  ],
  "planned": "LangChain (não implementado)"
}
```

#### Comunicação & Webhooks
```json
{
  "http_client": "axios 1.7.2",
  "whatsapp": "Z-API WhatsApp Business API",
  "push_notifications": "web-push 3.6.7"
}
```

#### Agendamento & Utilitários
```json
{
  "cron": "node-cron 3.0.3",
  "datetime": "luxon 3.7.2 (timezone: Europe/Lisbon)",
  "cors": "cors 2.8.5",
  "logger": "morgan 1.10.0",
  "query_parser": "qs 6.12.0"
}
```

#### Testes
```json
{
  "test_framework": "Jest 29.7.0",
  "http_testing": "Supertest 6.3.4",
  "mock_db": "mongodb-memory-server 9.1.6"
}
```

### 2.2 Frontend (React)

#### Framework & Build
```json
{
  "framework": "React 19.0.0",
  "dom": "React DOM 19.0.0",
  "build_tool": "Vite 6.3.5",
  "language": "TypeScript 5.9.2 (parcial)"
}
```

#### Roteamento
```json
{
  "router": "React Router DOM 7.5.2"
}
```

#### UI & Estilo
```json
{
  "css_framework": "TailwindCSS 3.4.3",
  "postcss": "PostCSS 8.5.3",
  "autoprefixer": "Autoprefixer 10.4.21"
}
```

#### PWA (Progressive Web App)
```json
{
  "pwa_plugin": "vite-plugin-pwa 1.1.0",
  "icon_generator": "@vite-pwa/assets-generator 1.0.2",
  "features": [
    "Service Worker customizado",
    "Web Push API",
    "IndexedDB (offline queue - parcial)",
    "Install prompt automático",
    "Manifest.json completo"
  ]
}
```

#### Comunicação & UX
```json
{
  "http_client": "axios 1.9.0",
  "datetime": "luxon 3.7.2",
  "notifications": "react-toastify 11.0.5",
  "analytics": "@vercel/speed-insights 1.2.0"
}
```

#### Qualidade de Código
```json
{
  "linter": "ESLint 9.22.0",
  "plugins": [
    "eslint-plugin-react-hooks 5.2.0",
    "eslint-plugin-react-refresh 0.4.19"
  ]
}
```

---

## 3. Modelos de Dados (MongoDB)

### 3.1 Cliente

**Collection:** `clientes`

```javascript
{
  _id: ObjectId,

  // Dados Básicos
  nome: String,                    // min: 3 chars, required
  telefone: String,                // unique, 9-15 digits, required
  email: String,                   // optional, unique, lowercase
  dataNascimento: Date,            // min age: 16, required

  // Gestão de Sessões
  sessoesRestantes: Number,        // default: 0
  pacote: ObjectId,                // ref: 'Pacote', optional

  // Observações
  observacoes: String,             // max: 500 chars
  ativo: Boolean,                  // default: true

  // ========================================
  // FICHA DE ANAMNESE MÉDICA (LGPD Sensitive)
  // ========================================

  // Hábitos e Alergias
  costumaPermanecerMuitoTempoSentada: Boolean,
  alergias: String,                // enum: 'Sim', 'Não'
  qualAlergia: String,

  // Histórico Médico
  historicoMedico: String,         // enum: 'Sim', 'Não'
  qualHistorico: String,
  medicamentosEmUso: String,       // enum: 'Sim', 'Não'
  qualMedicamento: String,

  // Cirurgias
  antecedentesCirurgicos: String,  // enum: 'Sim', 'Não'
  qualCirurgia: String,

  // Saúde Reprodutiva
  cicloMenstrualRegular: String,   // enum: 'Sim', 'Não', 'N/A'
  usaAnticoncepcional: Boolean,
  qualAnticoncepcional: String,

  // Condições Crônicas
  temHipertensao: Boolean,
  grauHipertensao: String,
  temDiabetes: Boolean,
  tipoDiabetes: String,
  temEpilepsia: Boolean,
  qualEpilepsia: String,

  // Contraindicações
  temMarcapasso: Boolean,
  temMetais: Boolean,              // metais no corpo

  observacoesAdicionaisAnamnese: String,

  // ========================================
  // GESTÃO DE CHATBOT (IA)
  // ========================================

  etapaConversa: String,           // enum: 'inicial', 'aguardando_nome',
                                   //       'aguardando_telefone',
                                   //       'aguardando_data_nascimento',
                                   //       'livre', etc.

  historicoMensagens: [{
    data: Date,
    mensagem: String,              // Mensagem do cliente
    resposta: String,              // Resposta da Laura
    intent: String,                // Intent detectada pela IA
    entidades: Object              // Entidades extraídas (NER)
  }],

  // Timestamps
  createdAt: Date,
  updatedAt: Date,

  // Virtual Fields
  idade: Number                    // Calculado a partir de dataNascimento
}
```

**Índices:**
- `telefone` (unique)
- `email` (unique, sparse)

**Validações:**
- Idade mínima: 16 anos
- Telefone: 9-15 dígitos
- Email: lowercase, valid format

---

### 3.2 Agendamento

**Collection:** `agendamentos`

```javascript
{
  _id: ObjectId,

  // Relações
  cliente: ObjectId,               // ref: 'Cliente', required
  pacote: ObjectId,                // ref: 'Pacote', optional

  // Data e Hora
  dataHora: Date,                  // required, not in past

  // Status do Agendamento
  status: String,                  // enum: [
                                   //   'Agendado',
                                   //   'Confirmado',
                                   //   'Realizado',
                                   //   'Cancelado Pelo Cliente',
                                   //   'Cancelado Pelo Salão',
                                   //   'Não Compareceu'
                                   // ], default: 'Agendado'

  // Observações
  observacoes: String,

  // Serviço Avulso (sem pacote)
  servicoAvulsoNome: String,
  servicoAvulsoValor: Number,

  // Sistema de Confirmação (24h antes)
  confirmacao: {
    tipo: String,                  // enum: 'pendente', 'confirmado', 'rejeitado'
    respondidoEm: Date,
    respondidoPor: String          // enum: 'cliente', 'laura'
  },

  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

**Índices:**
- `dataHora` (ascending)
- `cliente` (ascending)
- `status` (ascending)
- Composto: `cliente + dataHora`

**Validações:**
- `dataHora` não pode ser no passado
- Se `servicoAvulso`, então `servicoAvulsoValor >= 0`

---

### 3.3 Pacote

**Collection:** `pacotes`

```javascript
{
  _id: ObjectId,

  nome: String,                    // required
  categoria: String,               // required (ex: "Drenagem Linfática")
  sessoes: Number,                 // min: 1, required
  valor: Number,                   // min: 0, required
  descricao: String,               // max: 500 chars
  ativo: Boolean,                  // default: true

  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

**Validações:**
- `sessoes >= 1`
- `valor >= 0`

---

### 3.4 Schedule (Disponibilidade)

**Collection:** `schedules`

```javascript
{
  _id: ObjectId,

  dayOfWeek: Number,               // 0-6 (0=Domingo, 6=Sábado), unique
  label: String,                   // ex: "Segunda-feira"
  isActive: Boolean,               // Dia está disponível?

  // Horários
  startTime: String,               // default: '09:00', format: 'HH:mm'
  endTime: String,                 // default: '18:00', format: 'HH:mm'
  breakStartTime: String,          // default: '12:00'
  breakEndTime: String,            // default: '13:00'

  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

**Índices:**
- `dayOfWeek` (unique)

**Timezone:** Europe/Lisbon (configurado em Luxon)

---

### 3.5 Conversa (LLM State Management)

**Collection:** `conversas`

```javascript
{
  _id: ObjectId,

  telefone: String,                // unique, required (key do cliente)

  estado: String,                  // enum: [
                                   //   'iniciando',
                                   //   'aguardando_nome',
                                   //   'aguardando_telefone',
                                   //   'aguardando_data_nascimento',
                                   //   'aguardando_agendamento',
                                   //   'fluxo_concluido'
                                   // ]

  dados: {
    clientId: String,              // MongoDB ObjectId do cliente
    name: String,
    telephone: String,
    dateOfBirth: Date
  },

  ultimaInteracao: Date,           // Auto-atualizado em cada mensagem

  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

**Índices:**
- `telefone` (unique)

**Função:** Gerenciar estado da conversa entre interações do WhatsApp

---

### 3.6 UserSubscription (Web Push)

**Collection:** `usersubscriptions`

```javascript
{
  _id: ObjectId,

  userId: String,                  // ex: 'LAURA' (hardcoded por enquanto)

  // Dados do Subscription (Web Push API)
  endpoint: String,                // unique, required
  keys: {
    auth: String,                  // required
    p256dh: String                 // required
  },

  // Gestão
  createdAt: Date,
  lastSyncAt: Date,
  active: Boolean                  // default: true
}
```

**Índices:**
- `endpoint` (unique)
- `userId` (ascending)

**Uso:** Armazenar subscriptions do navegador para envio de Web Push

---

### 3.7 Mensagem

**Collection:** `mensagens`

```javascript
{
  _id: ObjectId,
  // Schema não totalmente definido
  // Usado para histórico de mensagens WhatsApp
}
```

---

## 4. Estrutura de Rotas e APIs

### 4.1 Backend API Endpoints

**Base URL (Dev):** `http://localhost:5000`
**Base URL (Prod):** `https://[SEU_DOMINIO]/api`

```
┌─────────────────────────────────────────────────────────────┐
│ API ENDPOINTS                                                │
├─────────────────────────────────────────────────────────────┤

📋 CLIENTES (/api/clientes)
  GET    /                        - Listar todos os clientes
  GET    /:id                     - Buscar cliente por ID
  POST   /                        - Criar novo cliente
  PUT    /:id                     - Atualizar cliente
  DELETE /:id                     - Deletar cliente

📦 PACOTES (/api/pacotes)
  GET    /                        - Listar todos os pacotes
  GET    /:id                     - Buscar pacote por ID
  POST   /                        - Criar novo pacote
  PUT    /:id                     - Atualizar pacote
  DELETE /:id                     - Deletar pacote

📅 AGENDAMENTOS (/api/agendamentos)
  GET    /                        - Listar agendamentos (query params: status, data)
  GET    /:id                     - Buscar agendamento por ID
  POST   /                        - Criar agendamento
  PUT    /:id                     - Atualizar agendamento
  DELETE /:id                     - Deletar agendamento
  POST   /:id/enviar-lembrete     - Enviar lembrete manual (WhatsApp)

📊 DASHBOARD (/api/dashboard)
  GET    /agendamentosHoje         - Agendamentos de hoje
  GET    /agendamentosAmanha       - Agendamentos de amanhã
  GET    /contagemAgendamentosAmanha - Contagem de agendamentos amanhã
  GET    /clientesAtendidosSemana  - Clientes atendidos (últimos 7 dias)
  GET    /totais                   - Totais (clientes, pacotes, agendamentos)
  GET    /sessoes-baixas           - Clientes com <= 2 sessões restantes
  GET    /proximos-agendamentos    - Próximos 5 agendamentos

📈 ANALYTICS (/api/analytics)
  [Endpoints planejados, não implementados]

💬 WHATSAPP (/api/whatsapp)
  POST   /notificar-cliente         - Enviar mensagem manual para cliente
  POST   /enviar-mensagem-direta    - Enviar via Z-API diretamente
  POST   /notificar-agendamentos-amanha - Enviar lembretes batch (amanhã)

🤖 AGENTE (/api/agente)
  POST   /processar-resposta        - Processar mensagem do WhatsApp (webhook)
  POST   /enviar-lembretes          - Trigger manual de lembretes (24h)

⏰ SCHEDULES (/api/schedules)
  GET    /                          - Listar disponibilidades (7 dias)
  POST   /                          - Criar disponibilidade
  PUT    /:id                       - Atualizar disponibilidade
  DELETE /:id                       - Deletar disponibilidade

🔔 NOTIFICATIONS (/api/notifications)
  POST   /subscribe                 - Registrar Web Push subscription
  POST   /send                      - Enviar notificação push manual

🔗 WEBHOOKS (/webhook)
  POST   /whatsapp                  - Receber mensagens Z-API

🏠 ROOT (/)
  GET    /                          - Health check
```

---

### 4.2 Frontend Routes

**Base URL:** `https://laura-saas-agenda-mfqt.vercel.app`

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND ROUTES (React Router)                              │
├─────────────────────────────────────────────────────────────┤

🏠 /                              - Dashboard (Home)

📅 AGENDAMENTOS
  /agendamentos                   - Lista de agendamentos
  /criar-agendamento              - Criar novo agendamento
  /agendamentos/editar/:id        - Editar agendamento

👥 CLIENTES
  /clientes                       - Lista de clientes
  /criar-cliente                  - Criar novo cliente
  /clientes/editar/:id            - Editar cliente

📦 PACOTES
  /pacotes                        - Lista de pacotes
  /criar-pacote                   - Criar novo pacote
  /pacotes/editar/:id             - Editar pacote

⏰ GESTÃO
  /disponibilidade                - Configurar horários disponíveis
```

---

## 5. Principais Funcionalidades Implementadas

### 5.1 Gestão de Clientes ✅

- **CRUD Completo**: Create, Read, Update, Delete
- **Validações**:
  - Idade mínima: 16 anos
  - Telefone único (9-15 dígitos)
  - Email único e lowercase
- **Ficha de Anamnese Médica Completa**
  - 20+ campos médicos (alergias, histórico, cirurgias, etc.)
  - Dados sensíveis (LGPD/GDPR)
- **Gestão de Sessões**
  - Controle de sessões restantes
  - Vínculo com pacotes
- **Histórico de Conversas**
  - Armazena mensagens WhatsApp
  - Intents detectadas pela IA
  - Entidades extraídas (NER)

---

### 5.2 Gestão de Agendamentos ✅

- **CRUD Completo**
- **Estados de Agendamento**:
  - Agendado
  - Confirmado
  - Realizado
  - Cancelado Pelo Cliente
  - Cancelado Pelo Salão
  - Não Compareceu
- **Validações**:
  - Data/hora não pode ser no passado
  - Validação de disponibilidade (Schedule)
- **Suporte para**:
  - Pacotes (sessões)
  - Serviços avulsos (nome + valor)
- **Sistema de Confirmação**:
  - Pendente / Confirmado / Rejeitado
  - Rastreamento de quem respondeu (cliente/Laura)
  - Timestamp de resposta
- **Envio Manual de Lembretes**
  - Endpoint: `POST /api/agendamentos/:id/enviar-lembrete`

---

### 5.3 Gestão de Pacotes ✅

- **CRUD Completo**
- **Categorização**: Ex: "Drenagem Linfática", "Massagem", etc.
- **Controle de Sessões**: Número de sessões do pacote
- **Valores**: Preço do pacote
- **Status Ativo/Inativo**: Controle de disponibilidade

---

### 5.4 Dashboard Inteligente ✅

**KPIs Implementados:**

1. **Agendamentos de Hoje**
   - Cards visuais com horário, cliente, status
   - Cores por status (verde, amarelo, vermelho)

2. **Agendamentos de Amanhã**
   - Lista com botão de envio de lembrete batch
   - Contador de agendamentos

3. **Próximos 5 Agendamentos**
   - Ordenados por data/hora
   - Informações de cliente e pacote

4. **Clientes Atendidos na Semana**
   - Últimos 7 dias
   - Agendamentos com status "Realizado"

5. **Alertas de Sessões Baixas**
   - Clientes com <= 2 sessões restantes
   - Call-to-action para renovação

6. **Totais do Sistema**
   - Total de clientes
   - Total de pacotes ativos
   - Total de agendamentos

**Interface:**
- Design responsivo (TailwindCSS)
- Cards coloridos
- Ícones semânticos
- Atualização em tempo real

---

### 5.5 WhatsApp Chatbot com IA (Z-API) ✅

#### 5.5.1 Integração Z-API

- **Webhook Receiver**: `POST /webhook/whatsapp`
- **Envio de Mensagens**:
  - `sendWhatsAppMessage()` (helper)
  - `sendZapiWhatsAppMessage()` (direto)
- **Suporte**:
  - Mensagens de texto
  - Confirmações de agendamento
  - Lembretes automatizados

#### 5.5.2 LLM Agent (GPT-4o-mini)

**Modelo:** GPT-4o-mini
**Prompt:** [systemLaura.md](../src/prompt/systemLaura.md)

**Features:**
- **Function Calling (Tool Use)**:
  - `create_client`
  - `update_client_data`
  - `schedule_appointment`
  - `update_appointment` (reagendar/cancelar)
- **Intent Classification**: GPT-3.5-turbo
- **Context Injection**: Histórico + dados do cliente
- **Conversational Memory**: Estado gerenciado via collection `Conversa`

#### 5.5.3 Fluxo Conversacional

**Estados:**
1. `iniciando` → Boas-vindas
2. `aguardando_nome` → Coletar nome
3. `aguardando_telefone` → Coletar telefone
4. `aguardando_data_nascimento` → Coletar data de nascimento
5. `aguardando_agendamento` → Escolher serviço e horário
6. `fluxo_concluido` → Cliente cadastrado
7. `livre` → Cliente existente, conversação livre

**Personalidade:**
- Tom informal (PT-PT)
- 1 emoji por mensagem
- Empática e profissional
- Nunca menciona concorrentes (Renata França)

**Técnicas Permitidas:**
- Vodder
- Leduc
- Dra. Laura Araujo

---

### 5.6 Sistema de Notificações Dual-Channel ✅

#### 5.6.1 WhatsApp (para CLIENTES)

- **Lembretes de Agendamento**: 24h antes (CRON job)
- **Mensagens de Confirmação**: Após agendamento
- **Notificações de Cancelamento**
- **Mensagens Diretas da Laura**

#### 5.6.2 Web Push (para LAURA)

- **Notificações sobre Novos Agendamentos**
- **Alertas de Sessões Baixas**
- **Updates do Sistema**

**Tecnologia:**
- **VAPID Authentication**: Voluntary Application Server Identification
- **Subscription Management**: Collection `UserSubscription`
- **Payload**:
  ```json
  {
    "notification": {
      "title": "Novo Agendamento",
      "body": "João Silva - 10:00",
      "icon": "/icon-192x192.png",
      "badge": "/badge-72x72.png",
      "tag": "agendamento-123",
      "requireInteraction": true
    },
    "data": {
      "agendamentoId": "507f1f77bcf86cd799439011",
      "clienteNome": "João Silva",
      "tipo": "novo_agendamento"
    }
  }
  ```

---

### 5.7 Progressive Web App (PWA) ✅

#### 5.7.1 Features PWA

- **Instalável**: Android + iOS
- **Service Worker Customizado**: Cache + offline strategy
- **Offline-First Strategy**:
  - Cache de assets estáticos
  - Runtime caching (Google Fonts)
- **Manifest Completo**: `manifest.json`
- **Prompt de Instalação Automático**: Component `InstallPrompt.tsx`
- **Verificação de Updates**: Toast notifications

#### 5.7.2 Ícones PWA

- **192x192**: Android Chrome
- **512x512**: Android Chrome (alta resolução)
- **Maskable Icons**: Android Adaptive Icons
- **Apple Touch Icons**:
  - 180x180
  - 167x167 (iPad)
  - 152x152 (iPad)

#### 5.7.3 Service Worker

**Estratégias de Cache:**
- **Precache**: HTML, CSS, JS, ícones
- **Network First**: API calls
- **Cache First**: Imagens, fontes

**Arquivo:** `public/service-worker.ts`

---

### 5.8 Gestão de Disponibilidade (Schedule) ✅

- **Configuração por Dia da Semana**: 0-6 (Domingo-Sábado)
- **Horário de Funcionamento**:
  - Início (default: 09:00)
  - Fim (default: 18:00)
- **Intervalo de Almoço**:
  - Início (default: 12:00)
  - Fim (default: 13:00)
- **Status Ativo/Inativo**: Dias disponíveis
- **Timezone**: Europe/Lisbon (Luxon)

**Uso:**
- IA consulta Schedule para sugerir horários disponíveis
- Validação de agendamentos

---

### 5.9 CRON Jobs Automatizados ✅

#### Job: Lembretes de Agendamento (24h antes)

**Agendamento:** Todos os dias às 19:00 (Europe/Lisbon)

**Fluxo:**
1. Buscar agendamentos do dia seguinte (status: 'Agendado' ou 'Confirmado')
2. Para cada agendamento:
   - Enviar WhatsApp para CLIENTE: "Olá [Nome], lembrete: você tem agendamento amanhã às [Hora]"
   - Enviar Web Push para LAURA: "Lembrete enviado para [Cliente]"
3. Logar resultados (enviados/falhados)

**Código:** [src/server.js](../src/server.js)

```javascript
// CRON: Todos os dias às 19:00 (timezone Europe/Lisbon)
cron.schedule('0 19 * * *', async () => {
  // Lógica de lembretes
}, {
  timezone: 'Europe/Lisbon'
});
```

---

## 6. Integrações Externas

### 6.1 Z-API WhatsApp Business

**Provedor:** Z-API
**Documentação:** https://developer.z-api.io/

#### 6.1.1 Funcionalidades

- **Webhook Receiver**: Recebe mensagens dos clientes
- **Envio de Mensagens**: API para enviar mensagens
- **Suporte**:
  - Mensagens de texto
  - Emojis
  - Links

#### 6.1.2 Configuração

**Variáveis de Ambiente (.env):**
```bash
ZAPI_INSTANCE_ID=your_instance_id
ZAPI_TOKEN=your_token
ZAPI_BASE_URL=https://api.z-api.io/instances/{instance}/token/{token}
```

**CORS Whitelist:**
```javascript
const allowedOrigins = [
  'https://laura-saas-agenda-mfqt.vercel.app',
  'https://api.z-api.io'  // Z-API webhooks
];
```

#### 6.1.3 Validações

⚠️ **ATENÇÃO**: Webhook validation fraca
- Aceita qualquer POST em `/webhook/whatsapp`
- Sem verificação de assinatura Z-API
- **Recomendação**: Implementar verificação de signature

---

### 6.2 OpenAI API

**Provedor:** OpenAI
**Documentação:** https://platform.openai.com/docs

#### 6.2.1 Modelos Utilizados

1. **GPT-4o-mini**: Chatbot conversacional + Function Calling
2. **GPT-3.5-turbo**: Classificação de intenção (fallback)

#### 6.2.2 Features

- **Function Calling (Tool Use)**
- **System Prompt Customizado**: [systemLaura.md](../src/prompt/systemLaura.md)
- **Context Injection**: Histórico de conversas
- **Tool Outputs Processing**
- **Error Handling Robusto**

#### 6.2.3 Tools Definidas

**Arquivo:** [src/utils/functionsSchema.json](../src/utils/functionsSchema.json)

```json
[
  {
    "name": "create_client",
    "description": "Criar novo cliente",
    "parameters": {
      "name": "string",
      "phone": "string",
      "birthDate": "string (YYYY-MM-DD)"
    }
  },
  {
    "name": "create_appointment",
    "description": "Criar agendamento",
    "parameters": {
      "client_id": "string",
      "slot_id": "string",
      "package_id": "string (optional)"
    }
  },
  {
    "name": "update_appointment",
    "description": "Atualizar/reagendar/cancelar agendamento",
    "parameters": {
      "appointment_id": "string",
      "action": "string (reschedule|cancel)",
      "new_slot_id": "string (se reschedule)"
    }
  }
]
```

#### 6.2.4 Configuração

**Variáveis de Ambiente (.env):**
```bash
OPENAI_API_KEY=sk-proj-...
```

---

### 6.3 Web Push Service

**Protocolo:** VAPID (Voluntary Application Server Identification)
**Providers:** Google FCM, Mozilla Push, Apple Push

#### 6.3.1 Configuração

**Variáveis de Ambiente (.env):**
```bash
VAPID_PUBLIC_KEY=BJ...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:support@laurasaas.com
```

**Geração de VAPID Keys:**
```bash
node generate-vapid.js
```

#### 6.3.2 Payload

```json
{
  "notification": {
    "title": "string",
    "body": "string",
    "icon": "string",
    "badge": "string",
    "tag": "string",
    "requireInteraction": true|false
  },
  "data": {
    "agendamentoId": "string",
    "clienteNome": "string",
    "tipo": "string"
  }
}
```

#### 6.3.3 TTL (Time to Live)

**Default:** Navegador decide
**Recomendação:** Configurar TTL específico (ex: 24h)

---

### 6.4 Vercel (Deploy Frontend)

**Provedor:** Vercel
**URL Produção:** https://laura-saas-agenda-mfqt.vercel.app

#### 6.4.1 Configuração

**Build Command:**
```bash
npm run build
```

**Output Directory:**
```
dist/
```

**Environment Variables:**
```bash
VITE_API_URL=https://[SEU_BACKEND]/api
VITE_VAPID_PUBLIC_KEY=BJ...
```

#### 6.4.2 Analytics

**Speed Insights:** `@vercel/speed-insights 1.2.0`

---

## 7. Fluxos Principais da Aplicação

### 7.1 Fluxo de Agendamento via WhatsApp

```
CLIENTE                    Z-API              BACKEND (LLM)              DATABASE
  │                         │                      │                        │
  │─── "Olá" ──────────────>│                      │                        │
  │                         │                      │                        │
  │                         │── Webhook ───────────>│                        │
  │                         │   POST /webhook/     │                        │
  │                         │   whatsapp           │                        │
  │                         │                      │                        │
  │                         │                      │── Buscar cliente ──────>│
  │                         │                      │   by telefone           │
  │                         │                      │<─ Cliente não existe ───│
  │                         │                      │                        │
  │                         │                      │── Criar Conversa ──────>│
  │                         │                      │   estado: 'iniciando'   │
  │                         │                      │                        │
  │<─ "Bem-vindo! Nome?" ───│<──── Send Message ───│                        │
  │                         │                      │                        │
  │─── "João Silva" ───────>│                      │                        │
  │                         │── Webhook ───────────>│                        │
  │                         │                      │                        │
  │                         │                      │── chatWithLaura() ─────>│
  │                         │                      │   (GPT-4o-mini)         │
  │                         │                      │                        │
  │                         │                      │   [IA processa]         │
  │                         │                      │                        │
  │                         │                      │<─ create_client ────────│
  │                         │                      │   (tool call)           │
  │                         │                      │   {name, phone, dob}    │
  │                         │                      │                        │
  │                         │                      │── dispatch() ──────────>│
  │                         │                      │   functionDispatcher    │
  │                         │                      │                        │
  │                         │                      │── Save Cliente ────────>│
  │                         │                      │<─ clientId ─────────────│
  │                         │                      │                        │
  │                         │                      │── Update Conversa ─────>│
  │                         │                      │   estado: 'livre'       │
  │                         │                      │   dados.clientId        │
  │                         │                      │                        │
  │<─ "Qual serviço?" ──────│<──── Send ───────────│                        │
  │                         │                      │                        │
  │─── "Drenagem" ─────────>│                      │                        │
  │                         │── Webhook ───────────>│                        │
  │                         │                      │                        │
  │                         │                      │── find_packages() ─────>│
  │                         │                      │   categoria: Drenagem   │
  │                         │                      │<─ [Lista pacotes] ──────│
  │                         │                      │                        │
  │                         │                      │── check_schedule() ────>│
  │                         │                      │   dayOfWeek, horários   │
  │                         │                      │<─ Horários disponíveis ─│
  │                         │                      │                        │
  │<─ "Horários: ..." ──────│<──── Send ───────────│                        │
  │   "Sexta 10h"           │                      │                        │
  │   "Sexta 14h"           │                      │                        │
  │                         │                      │                        │
  │─── "Sexta 10h" ────────>│                      │                        │
  │                         │── Webhook ───────────>│                        │
  │                         │                      │                        │
  │                         │                      │── chatWithLaura() ─────>│
  │                         │                      │   (GPT-4o-mini)         │
  │                         │                      │                        │
  │                         │                      │<─ create_appointment ───│
  │                         │                      │   (tool call)           │
  │                         │                      │   {clientId, dateTime}  │
  │                         │                      │                        │
  │                         │                      │── Save Agendamento ────>│
  │                         │                      │   status: 'Agendado'    │
  │                         │                      │<─ appointmentId ────────│
  │                         │                      │                        │
  │                         │                      │── Send Web Push ───────>│
  │                         │                      │   (para LAURA)          │
  │                         │                      │   "Novo agendamento"    │
  │                         │                      │                        │
  │<─ "✅ Confirmado!" ─────│<──── Send ───────────│                        │
  │   "Sexta, 10h"          │                      │                        │
  │                         │                      │                        │
```

---

### 7.2 Fluxo de Lembretes Automatizados (CRON)

```
CRON (19h)              BACKEND              DATABASE           Z-API       WEB PUSH
  │                       │                      │                │              │
  │── Trigger ───────────>│                      │                │              │
  │   (19:00 diário)      │                      │                │              │
  │                       │                      │                │              │
  │                       │── Buscar amanhã ────>│                │              │
  │                       │   date: tomorrow     │                │              │
  │                       │   status: Agendado   │                │              │
  │                       │<─ [3 agendamentos] ──│                │              │
  │                       │                      │                │              │
  │                       │   FOR EACH:          │                │              │
  │                       │                      │                │              │
  │                       │── Buscar cliente ────>│                │              │
  │                       │<─ cliente.nome ──────│                │              │
  │                       │   cliente.telefone   │                │              │
  │                       │                      │                │              │
  │                       │─── WhatsApp ─────────────────────────>│              │
  │                       │    "Olá João, lembrete:               │              │
  │                       │     amanhã 10h"                       │              │
  │                       │                      │                │              │
  │                       │── Buscar subscription ────────────────────────────────>│
  │                       │   userId: 'LAURA'    │                │              │
  │                       │<─ subscription ──────│                │              │
  │                       │                      │                │              │
  │                       │── sendPushNotification() ──────────────────────────────>│
  │                       │    "Lembrete enviado │                │              │
  │                       │     para João"       │                │              │
  │                       │                      │                │              │
  │                       │<─ Enviado ─────────────────────────────────────────────│
  │                       │                      │                │              │
  │<─ Resultado ──────────│                      │                │              │
  │   {sent: 6,           │                      │                │              │
  │    failed: 0}         │                      │                │              │
  │   (log console)       │                      │                │              │
```

---

### 7.3 Fluxo PWA - Instalação e Notificações

```
BROWSER              SERVICE WORKER          FRONTEND            BACKEND
  │                       │                      │                   │
  │─── Visita site ──────>│                      │                   │
  │   (primeira vez)      │                      │                   │
  │                       │                      │                   │
  │                       │── Register SW ──────>│                   │
  │                       │   navigator          │                   │
  │                       │   .serviceWorker     │                   │
  │                       │   .register()        │                   │
  │                       │                      │                   │
  │                       │<─ SW ativado ────────│                   │
  │                       │   (install event)    │                   │
  │                       │   (activate event)   │                   │
  │                       │                      │                   │
  │<─ Prompt instalação ──│──────────────────────│                   │
  │   "Instalar app?"     │   (InstallPrompt)    │                   │
  │                       │                      │                   │
  │─── Aceita ───────────>│                      │                   │
  │                       │                      │                   │
  │                       │── Instala ──────────>│                   │
  │                       │   beforeinstallprompt│                   │
  │                       │                      │                   │
  │                       │── Pede permissão ────>│                   │
  │<─ "Permitir notif?" ──│   Notification       │                   │
  │                       │   .requestPermission()                   │
  │                       │                      │                   │
  │─── Concede ──────────>│                      │                   │
  │   (granted)           │                      │                   │
  │                       │                      │                   │
  │                       │── Subscribe push ────>│                   │
  │                       │   serviceWorker      │                   │
  │                       │   .pushManager       │                   │
  │                       │   .subscribe()       │                   │
  │                       │                      │                   │
  │                       │<─ subscription ───────│                   │
  │                       │   {endpoint, keys}   │                   │
  │                       │                      │                   │
  │                       │                      │── POST /subscribe ─>│
  │                       │                      │   {userId: LAURA,  │
  │                       │                      │    endpoint, keys} │
  │                       │                      │                   │
  │                       │                      │<─ 200 OK ───────────│
  │                       │                      │                   │
  │                       │                      │                   │
  │                       │   [LATER: Novo agendamento]              │
  │                       │                      │                   │
  │                       │<─ Push event ─────────────────────────────│
  │                       │   (agendamento novo) │                   │
  │                       │                      │                   │
  │<─ Notificação ────────│                      │                   │
  │   🔔 "João - 10h"     │                      │                   │
  │                       │                      │                   │
```

---

## 8. Sistema de Autenticação

### ⚠️ STATUS ATUAL: NÃO IMPLEMENTADO

**VULNERABILIDADE CRÍTICA:**

- ❌ Sem sistema de login/autenticação
- ❌ Frontend acessível publicamente
- ❌ APIs backend sem proteção JWT
- ❌ Dados sensíveis de clientes expostos
- ❌ Ficha de anamnese (LGPD) sem controle de acesso

### 🔴 IMPACTO

- Qualquer pessoa com URL pode acessar dados de clientes
- APIs podem ser chamadas sem autorização
- Dados médicos (LGPD) expostos
- Violação de LGPD/GDPR

### ✅ RECOMENDAÇÃO URGENTE

**Implementar autenticação com:**

1. **JWT (JSON Web Tokens)**
   - Login com email/senha
   - Token expiration (15min - 1h)
   - Refresh tokens (7 dias)

2. **Role-Based Access Control (RBAC)**
   - Admin (Laura)
   - Recepcionista
   - Cliente (futuro)

3. **Middlewares de Proteção**
   ```javascript
   // Exemplo
   const protect = async (req, res, next) => {
     const token = req.headers.authorization?.split(' ')[1];
     if (!token) return res.status(401).json({ error: 'Não autorizado' });

     try {
       const decoded = jwt.verify(token, process.env.JWT_SECRET);
       req.user = decoded;
       next();
     } catch (error) {
       return res.status(401).json({ error: 'Token inválido' });
     }
   };

   // Proteger rotas
   router.get('/api/clientes', protect, getClientes);
   ```

4. **Session Management**
   - Redis para sessões (opcional)
   - Logout endpoint

5. **Rate Limiting**
   - express-rate-limit
   - Prevenir brute force

6. **HTTPS Obrigatório**
   - Forçar HTTPS em produção
   - HSTS headers

---

## 9. Estrutura de Pastas Completa

```
laura-saas-agenda/
│
├── .git/                          # Git repository
├── .gitattributes
├── .gitignore
│
├── assets/                        # 📁 ASSETS E DOCUMENTAÇÃO
│   └── docs/
│       ├── ARQUITETURA_PWA.md     # Doc PWA v2
│       ├── CHECKLIST_PWA.md       # Checklist implementação
│       └── PROMPT_GLOBAL.MD       # Prompt arquiteto IA
│
├── docs/                          # 📁 DOCUMENTAÇÃO (NOVA)
│   ├── ANALISE_COMPLETA.md        # Este arquivo
│   ├── ARQUITETURA.md             # Diagramas e fluxos
│   └── API.md                     # (futuro) Documentação API
│
├── laura-saas-frontend/           # 📁 FRONTEND (React + Vite)
│   ├── public/
│   │   ├── icons/                 # PWA icons
│   │   │   ├── icon-192x192.png
│   │   │   ├── icon-512x512.png
│   │   │   ├── icon-maskable-192x192.png
│   │   │   ├── icon-maskable-512x512.png
│   │   │   ├── apple-touch-icon-180x180.png
│   │   │   ├── apple-touch-icon-167x167.png
│   │   │   └── apple-touch-icon-152x152.png
│   │   ├── manifest.json          # PWA manifest
│   │   ├── service-worker.ts      # Service Worker
│   │   └── vite.svg
│   │
│   ├── src/
│   │   ├── assets/                # Imagens, logos
│   │   │
│   │   ├── components/
│   │   │   ├── ErrorBoundary.jsx  # Error handling
│   │   │   ├── Header.jsx
│   │   │   ├── InstallPrompt.tsx  # PWA install
│   │   │   ├── Navbar.jsx
│   │   │   └── Sidebar.jsx
│   │   │
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx      # ⭐ Página principal
│   │   │   ├── Agendamentos.jsx
│   │   │   ├── CriarAgendamento.jsx
│   │   │   ├── EditarAgendamento.jsx
│   │   │   ├── Clientes.jsx
│   │   │   ├── CriarCliente.jsx
│   │   │   ├── EditarCliente.jsx
│   │   │   ├── Pacotes.jsx
│   │   │   ├── CriarPacote.jsx
│   │   │   ├── EditarPacote.jsx
│   │   │   ├── Disponibilidade.tsx
│   │   │   └── Home.jsx
│   │   │
│   │   ├── services/
│   │   │   ├── api.js             # Axios config
│   │   │   ├── notificationService.ts  # Web Push
│   │   │   ├── offlineService.ts       # IndexedDB (parcial)
│   │   │   ├── scheduleService.ts      # Disponibilidade
│   │   │   └── serviceWorkerService.ts # SW lifecycle
│   │   │
│   │   ├── types/
│   │   │   └── pwa.ts             # TypeScript types
│   │   │
│   │   ├── App.css
│   │   ├── App.tsx                # Router principal
│   │   ├── index.css              # TailwindCSS
│   │   ├── main.tsx               # Entry point
│   │   └── vite-env.d.ts
│   │
│   ├── .env                       # Variáveis ambiente (prod)
│   ├── .env.local                 # Variáveis ambiente (local)
│   ├── .eslintrc.cjs
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── postcss.config.cjs
│   ├── README.md
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── tsconfig.worker.json       # TS config SW
│   └── vite.config.ts             # Vite + PWA
│
├── seeds/                         # 📁 SCRIPTS DE SEED
│   └── seedPacotes.js             # Popular pacotes
│
├── src/                           # 📁 BACKEND (Node.js + Express)
│   ├── config/
│   │   └── db.js                  # MongoDB connection
│   │
│   ├── controllers/
│   │   ├── agendamentoController.js
│   │   ├── agenteController.js    # ⭐ LLM + Lembretes
│   │   ├── analyticsController.js # (vazio)
│   │   ├── clienteController.js
│   │   ├── dashboardController.js # ⭐ KPIs
│   │   ├── financeiroController.js # (vazio)
│   │   ├── notificationController.js  # Web Push
│   │   ├── pacoteController.js
│   │   ├── scheduleController.js  # Disponibilidade
│   │   ├── webhookController.js   # ⭐ Z-API webhooks
│   │   └── whatsappController.js  # Envio WhatsApp
│   │
│   ├── middlewares/
│   │   ├── errorHandler.js
│   │   ├── requestLogger.js
│   │   └── validateObjectId.js
│   │
│   ├── models/
│   │   ├── Agendamento.js
│   │   ├── Cliente.js             # + Anamnese
│   │   ├── Conversa.js            # LLM state
│   │   ├── Mensagem.js
│   │   ├── Pacote.js
│   │   ├── Schedule.js
│   │   └── UserSubscription.js    # Web Push
│   │
│   ├── prompt/
│   │   └── systemLaura.md         # ⭐ System prompt GPT
│   │
│   ├── routes/
│   │   ├── agendamentoRoutes.js
│   │   ├── agenteRoutes.js
│   │   ├── analyticsRoutes.js
│   │   ├── clienteRoutes.js
│   │   ├── dashboardRoutes.js
│   │   ├── financeiroRoutes.js
│   │   ├── notificationRoutes.js
│   │   ├── pacoteRoutes.js
│   │   ├── scheduleRoutes.js
│   │   ├── webhook.js
│   │   ├── webhookRoutes.js
│   │   └── whatsappRoutes.js
│   │
│   ├── services/
│   │   ├── analyticsService.js    # (vazio)
│   │   ├── financeiroService.js   # (vazio)
│   │   ├── functionDispatcher.js  # ⭐ Function calling
│   │   └── pushService.js         # Web Push sender
│   │
│   ├── utils/
│   │   ├── functionsSchema.json   # ⭐ OpenAI tools
│   │   ├── notificacaoHelper.js
│   │   ├── openaiHelper.js        # ⭐ LLM integration
│   │   ├── promptLoader.js
│   │   ├── sendZapiWhatsAppMessage.js
│   │   ├── teste_onboarding_cliente.js
│   │   ├── teste_prompt.js
│   │   └── zapi_client.js         # Z-API client
│   │
│   ├── app.js                     # ⭐ Express app
│   └── server.js                  # ⭐ Server + CRON
│
├── tests/                         # 📁 TESTES (Jest)
│   ├── cliente.test.js
│   ├── setup.js
│   └── test_zapi.js
│
├── ajustarEtapaClientes.js        # Script manutenção
├── check-subscriptions.js         # Verificar subscriptions
├── fix-subscriptions.js           # Fix subscriptions
├── generate-vapid.js              # Gerar VAPID keys
├── test-notification.js           # Test push
├── test-push.js                   # Test push 2
├── workflow1.json                 # n8n workflow (não usado)
│
├── .env                           # Variáveis ambiente (main)
├── .env.local                     # Variáveis ambiente (local)
├── .env.development               # Variáveis ambiente (dev)
├── .env.test                      # Variáveis ambiente (test)
├── .gitattributes
├── .gitignore
├── jest.config.js
├── package.json
├── package-lock.json
└── README.md                      # (ausente - criar)
```

---

## 10. Documentação Técnica Encontrada

### 10.1 Documentação Disponível ✅

#### 1. `/assets/docs/ARQUITETURA_PWA.md`
- Visão geral da arquitetura PWA v2
- Diagrama de fluxo completo
- Estrutura de pastas detalhada
- Tipos TypeScript documentados
- Fluxo de lembretes 24h
- Estratégia offline-first
- Integração com backend
- Dependências PWA
- Segurança (VAPID, HTTPS, validation)
- Performance (cache, SW, IndexedDB)

#### 2. `/assets/docs/CHECKLIST_PWA.md`
- Checklist de implementação em 7 fases
- Phase 1: Setup Base + TypeScript
- Phase 3: Service Worker + Offline
- Phase 4: Web Push + Notificações
- Phase 5: Polish + Deploy
- Comandos úteis (VAPID, build, lighthouse)
- Blockers e soluções
- Referências (MDN, web.dev)
- **STATUS:** Implementação parcial

#### 3. `/assets/docs/PROMPT_GLOBAL.MD`
- Prompt do arquiteto `LAURA_SAAS_ARCHITECT v4`
- Missão dual: IA + Financial
- Arquitetura prevista (Python + LangChain + Streamlit)
- Data models (transactions, bookings)
- Tools Python (IA + Financial)
- LangGraph workflow
- Dashboard Streamlit
- Roadmap (S1-S10)
- **NOTA:** Arquitetura divergente do implementado (ver seção 12)

#### 4. `/src/prompt/systemLaura.md`
- System prompt do chatbot WhatsApp
- Personalidade e tom (PT-PT, informal, 1 emoji)
- Técnicas permitidas (Vodder, Leduc, Dra. Laura Araujo)
- Regras de negócio (nunca mencionar Renata França)
- Fluxo de boas-vindas
- Funções declaradas (LLM tools)
- Fluxo de conversa (estados)
- Exemplos few-shot

#### 5. `/laura-saas-frontend/README.md`
- README genérico do Vite + React
- **Não customizado** para o projeto

---

### 10.2 Documentação Faltante ❌

```
❌ README.md principal (raiz do projeto)
❌ CONTRIBUTING.md
❌ CHANGELOG.md
❌ API.md (documentação de endpoints)
❌ DEPLOYMENT.md
❌ ENVIRONMENT.md (variáveis de ambiente)
❌ .env.example (backend e frontend)
❌ SECURITY.md
❌ TESTING.md
❌ ARCHITECTURE.md (geral do projeto)
❌ TROUBLESHOOTING.md
```

---

## 11. Pontos de Atenção e Melhorias

### 11.1 🔴 CRÍTICOS (Alta Prioridade)

#### 1. SEGURANÇA

##### ❌ SEM AUTENTICAÇÃO
**Problema:**
- APIs expostas publicamente
- Dados sensíveis de clientes acessíveis
- Sem controle de acesso

**Impacto:**
- Qualquer pessoa pode acessar dados
- Violação de LGPD/GDPR
- Risco de vazamento de dados médicos

**Solução:**
```javascript
// Implementar JWT
npm install jsonwebtoken bcryptjs

// Middleware de autenticação
const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Proteger rotas
router.get('/api/clientes', protect, getClientes);
```

---

##### ❌ CORS CONFIGURADO MAS NÃO TESTADO
**Problema:**
- Whitelist de 2 domínios
- Não testado em produção
- Pode bloquear requisições legítimas

**Solução:**
- Testar CORS em staging
- Adicionar logs de CORS rejeitados
- Configurar preflight (OPTIONS)

---

##### ❌ DADOS MÉDICOS SENSÍVEIS (LGPD/GDPR)
**Problema:**
- Anamnese com dados de saúde
- Sem criptografia em repouso
- Sem consent management
- Sem trilha de auditoria

**Impacto:**
- Violação de LGPD (Art. 11 - dados sensíveis)
- Multa de até 2% do faturamento (max R$ 50mi)

**Solução:**
```javascript
// 1. Criptografia em repouso
npm install mongoose-field-encryption

// 2. Consent form (frontend)
const consentCheckbox = (
  <Checkbox required>
    Li e aceito a <Link to="/politica-privacidade">
      Política de Privacidade
    </Link> e autorizo o tratamento dos meus dados de saúde
  </Checkbox>
);

// 3. Auditoria (backend)
const AuditoriaSchema = new Schema({
  usuario: String,
  acao: String, // 'create', 'read', 'update', 'delete'
  entidade: String, // 'Cliente', 'Agendamento'
  entidadeId: ObjectId,
  timestamp: Date,
  ip: String
});
```

---

##### ❌ VAPID KEYS EM .env
**Problema:**
- Risco de vazamento via commit
- Sem rotação implementada

**Solução:**
- Secret manager (AWS Secrets Manager, Vercel Env)
- Rotação trimestral de keys
- Adicionar `.env` ao `.gitignore`

---

##### ❌ SEM RATE LIMITING
**Problema:**
- Vulnerável a DDoS e abuse
- Sem proteção contra brute force

**Solução:**
```javascript
npm install express-rate-limit

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests
  message: 'Muitas requisições, tente novamente em 15 minutos'
});

app.use('/api/', limiter);

// Rate limit específico para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 tentativas
  skipSuccessfulRequests: true
});

app.post('/api/auth/login', loginLimiter, login);
```

---

#### 2. ESCALABILIDADE

##### ❌ MONGODB SEM ÍNDICES OTIMIZADOS
**Problema:**
- Apenas 3 índices em Agendamento
- Queries complexas sem índices
- Performance degrada com volume

**Solução:**
```javascript
// Índices compostos
AgendamentoSchema.index({ cliente: 1, dataHora: -1 });
AgendamentoSchema.index({ status: 1, dataHora: 1 });
ClienteSchema.index({ ativo: 1, sessoesRestantes: 1 });

// Verificar índices
db.agendamentos.getIndexes();

// Analyze query performance
db.agendamentos.find({ status: 'Agendado' }).explain('executionStats');
```

---

##### ❌ N+1 QUERIES
**Problema:**
- Populações múltiplas sem `.lean()`
- Queries desnecessárias

**Solução:**
```javascript
// ❌ ANTES (N+1)
const agendamentos = await Agendamento.find()
  .populate('cliente')
  .populate('pacote');

// ✅ DEPOIS (otimizado)
const agendamentos = await Agendamento.find()
  .populate('cliente', 'nome telefone') // Apenas campos necessários
  .populate('pacote', 'nome categoria')
  .lean() // Retorna plain objects (mais rápido)
  .select('dataHora status observacoes'); // Apenas campos necessários
```

---

##### ❌ SEM CACHING
**Problema:**
- Sem Redis/Memcached
- Todas as queries batem MongoDB
- Dashboard KPIs recalculados a cada request

**Solução:**
```javascript
npm install ioredis

const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

// Cache de dashboard KPIs (TTL: 5 min)
const getCachedDashboard = async () => {
  const cached = await redis.get('dashboard:kpis');
  if (cached) return JSON.parse(cached);

  const data = await calcularKPIs();
  await redis.setex('dashboard:kpis', 300, JSON.stringify(data));
  return data;
};

// Invalidar cache ao criar agendamento
const createAgendamento = async (data) => {
  const agendamento = await Agendamento.create(data);
  await redis.del('dashboard:kpis'); // Invalida cache
  return agendamento;
};
```

---

##### ❌ CRON SINGLE-THREADED
**Problema:**
- Bloqueia event loop se houver muitos agendamentos
- Sem retry em caso de falha

**Solução:**
```javascript
npm install bull

const Queue = require('bull');
const lembretesQueue = new Queue('lembretes', process.env.REDIS_URL);

// Producer (CRON)
cron.schedule('0 19 * * *', async () => {
  const agendamentos = await buscarAgendamentosAmanha();

  for (const agendamento of agendamentos) {
    await lembretesQueue.add({ agendamentoId: agendamento._id });
  }
});

// Consumer (worker)
lembretesQueue.process(async (job) => {
  const { agendamentoId } = job.data;
  await enviarLembrete(agendamentoId);
});

// Retry automático
lembretesQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} falhou:`, err);
  // Retry exponencial (3 tentativas)
});
```

---

#### 3. CONFIABILIDADE

##### ❌ ERROR HANDLING BÁSICO
**Problema:**
- Erros genéricos (500)
- Sem logging estruturado
- Difícil debugar em produção

**Solução:**
```javascript
npm install winston pino

const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Usar em controllers
try {
  const cliente = await Cliente.create(data);
  logger.info('Cliente criado', { clienteId: cliente._id, nome: cliente.nome });
} catch (error) {
  logger.error('Erro ao criar cliente', { error: error.message, stack: error.stack });
  throw error;
}
```

**Integração com Sentry:**
```javascript
npm install @sentry/node

const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});

// Error handler
app.use(Sentry.Handlers.errorHandler());
```

---

##### ❌ SEM MONITORAMENTO
**Problema:**
- Sem Prometheus/Grafana
- Sem health checks
- Sem alertas

**Solução:**
```javascript
npm install prom-client

const client = require('prom-client');
const register = new client.Registry();

// Métricas
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

register.registerMetric(httpRequestDuration);

// Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.labels(req.method, req.route?.path, res.statusCode).observe(duration);
  });
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'up' : 'down';
  res.json({
    status: 'ok',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

##### ❌ WEBHOOKS SEM RETRY LOGIC
**Problema:**
- Z-API pode falhar silenciosamente
- Mensagens perdidas

**Solução:**
```javascript
// Bull queue com retry
const whatsappQueue = new Queue('whatsapp', process.env.REDIS_URL);

whatsappQueue.process(async (job) => {
  const { telefone, mensagem } = job.data;
  await sendZapiWhatsAppMessage(telefone, mensagem);
});

// Retry exponencial (3 tentativas)
whatsappQueue.add(
  { telefone, mensagem },
  {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000 // 2s, 4s, 8s
    }
  }
);
```

---

##### ❌ PUSH NOTIFICATIONS SEM FALLBACK
**Problema:**
- Se Web Push falhar, não há WhatsApp backup

**Solução:**
```javascript
const notificarLaura = async (mensagem) => {
  try {
    // Tentar Web Push primeiro
    await sendPushNotification('LAURA', mensagem);
  } catch (error) {
    logger.warn('Web Push falhou, usando WhatsApp fallback', { error });

    // Fallback: WhatsApp
    await sendZapiWhatsAppMessage(
      process.env.LAURA_TELEFONE,
      `[Sistema] ${mensagem}`
    );
  }
};
```

---

### 11.2 ⚠️ IMPORTANTES (Média Prioridade)

#### 4. CÓDIGO & ARQUITETURA

##### ⚠️ CÓDIGO MISTO (JS + TS)
**Problema:**
- Backend 100% JavaScript
- Frontend parcial TypeScript
- Inconsistência de tipos

**Solução:**
- Migrar backend para TypeScript
- Definir tipos compartilhados
- Configurar `tsconfig.json` strict mode

---

##### ⚠️ SEM VALIDAÇÃO DE DADOS (BACKEND)
**Problema:**
- Apenas validação Mongoose
- Sem validação de request body

**Solução:**
```javascript
npm install joi

const Joi = require('joi');

const clienteSchema = Joi.object({
  nome: Joi.string().min(3).required(),
  telefone: Joi.string().pattern(/^\d{9,15}$/).required(),
  email: Joi.string().email().optional(),
  dataNascimento: Joi.date().max('now').required()
});

// Middleware
const validateRequest = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};

// Usar em rotas
router.post('/api/clientes', validateRequest(clienteSchema), createCliente);
```

---

##### ⚠️ FUNCTION DISPATCHER SIMPLES
**Problema:**
- Switch case manual
- Difícil de escalar

**Solução:**
```javascript
// Registry pattern
const functionRegistry = new Map();

functionRegistry.set('create_client', createClientHandler);
functionRegistry.set('create_appointment', createAppointmentHandler);
functionRegistry.set('update_appointment', updateAppointmentHandler);

const dispatchFunction = async (functionName, args) => {
  const handler = functionRegistry.get(functionName);
  if (!handler) throw new Error(`Função ${functionName} não encontrada`);

  return await handler(args);
};
```

---

##### ⚠️ LLM SEM GUARDRAILS
**Problema:**
- GPT-4o-mini pode "alucinar"
- Sem validação de outputs

**Solução:**
```javascript
npm install guardrails-ai

// Validar output do LLM
const validateLLMOutput = (output) => {
  // Verificar se data é válida
  if (output.includes('date') && !isValidDate(output.date)) {
    throw new Error('LLM gerou data inválida');
  }

  // Verificar se telefone é válido
  if (output.includes('phone') && !isValidPhone(output.phone)) {
    throw new Error('LLM gerou telefone inválido');
  }

  return output;
};
```

---

##### ⚠️ TESTES INCOMPLETOS
**Problema:**
- Apenas 3 arquivos de teste
- Sem testes de integração
- Coverage < 20%

**Solução:**
```javascript
// Expandir testes
npm test -- --coverage

// Target: 80%+ coverage
// Adicionar testes E2E com Playwright
npm install -D @playwright/test
```

---

#### 5. UX & FRONTEND

##### ⚠️ SEM LOADING STATES CONSISTENTES
**Solução:**
```jsx
// Loading component global
const LoadingSpinner = () => (
  <div className="flex justify-center items-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
  </div>
);

// Usar em páginas
const [loading, setLoading] = useState(false);

{loading ? <LoadingSpinner /> : <DataTable data={data} />}
```

---

##### ⚠️ SEM ERROR BOUNDARIES
**Solução:**
```jsx
// App.tsx
<ErrorBoundary>
  <BrowserRouter>
    <Routes>
      {/* rotas */}
    </Routes>
  </BrowserRouter>
</ErrorBoundary>
```

---

##### ⚠️ PWA: OFFLINE MODE INCOMPLETO
**Solução:**
- Implementar `offlineService.ts` completo
- IndexedDB queue para requests offline
- Sync ao reconectar

---

##### ⚠️ TOASTS MAL CONFIGURADOS
**Solução:**
```jsx
// Padronizar react-toastify
import { toast } from 'react-toastify';

// Substituir todos alert() por:
toast.success('Operação realizada!');
toast.error('Erro ao processar');
toast.warning('Atenção: sessões baixas');
```

---

##### ⚠️ SEM DARK MODE
**Solução:**
```jsx
// TailwindCSS dark mode
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  // ...
};

// Toggle dark mode
const toggleDarkMode = () => {
  document.documentElement.classList.toggle('dark');
};
```

---

#### 6. INTEGRAÇÃO Z-API

##### ⚠️ WEBHOOK VALIDATION FRACA
**Solução:**
```javascript
// Verificar signature Z-API
const verifyZapiSignature = (req) => {
  const signature = req.headers['x-zapi-signature'];
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', process.env.ZAPI_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return signature === expectedSignature;
};

// Middleware
app.post('/webhook/whatsapp', (req, res, next) => {
  if (!verifyZapiSignature(req)) {
    return res.status(401).json({ error: 'Assinatura inválida' });
  }
  next();
});
```

---

##### ⚠️ SEM QUEUE PARA MENSAGENS
**Solução:**
- Bull queue (ver seção escalabilidade)

---

##### ⚠️ LLM CONTEXT LIMITADO
**Solução:**
```javascript
// Salvar histórico completo em Conversa.historicoMensagens
const salvarHistorico = async (telefone, mensagem, resposta, intent) => {
  await Conversa.findOneAndUpdate(
    { telefone },
    {
      $push: {
        'dados.historicoMensagens': {
          data: new Date(),
          mensagem,
          resposta,
          intent,
          entidades: extrairEntidades(mensagem)
        }
      }
    }
  );
};

// Carregar histórico ao processar mensagem
const historico = await Conversa.findOne({ telefone })
  .select('dados.historicoMensagens')
  .slice('dados.historicoMensagens', -10); // Últimas 10 mensagens
```

---

### 11.3 💡 DESEJÁVEIS (Baixa Prioridade)

#### 7. FEATURES

##### 💡 CALENDÁRIO VISUAL
```javascript
npm install @fullcalendar/react @fullcalendar/daygrid

// Dashboard
<FullCalendar
  plugins={[dayGridPlugin]}
  initialView="dayGridMonth"
  events={agendamentos}
/>
```

---

##### 💡 RELATÓRIOS FINANCEIROS
- Implementar `financeiroController.js`
- KPIs: faturamento mensal, ticket médio, taxa de conversão

---

##### 💡 ANALYTICS
- Implementar `analyticsController.js`
- Métricas: no-show rate, conversão WhatsApp, sessões/cliente

---

##### 💡 MULTI-USUÁRIO
- Sistema single-user (Laura)
- Adicionar roles: recepcionista, terapeuta, admin

---

##### 💡 INTEGRAÇÃO DE PAGAMENTOS
```javascript
npm install stripe

// Stripe Checkout
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{
    price_data: {
      currency: 'eur',
      product_data: { name: pacote.nome },
      unit_amount: pacote.valor * 100
    },
    quantity: 1
  }],
  mode: 'payment',
  success_url: `${process.env.FRONTEND_URL}/sucesso`,
  cancel_url: `${process.env.FRONTEND_URL}/cancelado`
});
```

---

##### 💡 CRM COMPLETO
- Tags
- Segmentação
- Campanhas WhatsApp

---

##### 💡 N8N WORKFLOW
- `workflow1.json` presente mas não usado
- Migrar lógica WhatsApp para n8n

---

#### 8. DOCUMENTAÇÃO & DEVOPS

##### 💡 CI/CD
```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: vercel/vercel-action@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
```

---

##### 💡 ENVIRONMENT MANAGEMENT
- Criar `.env.example`
- Secrets manager

---

##### 💡 API DOCUMENTATION
```javascript
npm install swagger-jsdoc swagger-ui-express

// Swagger auto-gen
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Laura SAAS API',
      version: '1.0.0'
    }
  },
  apis: ['./src/routes/*.js']
};
```

---

##### 💡 DATABASE MIGRATIONS
```javascript
npm install migrate-mongo

// Migrations
migrate-mongo create add-anamnese-fields
```

---

##### 💡 BACKUP STRATEGY
- MongoDB Atlas backups (diários)
- Exportar para S3 (semanal)

---

## 12. Divergências Arquiteturais

### Arquitetura Prevista vs. Implementada

#### Previsto (PROMPT_GLOBAL.MD)

```
┌─────────────────────────────────────────┐
│ STACK PREVISTO                          │
├─────────────────────────────────────────┤
│ Backend:     Python + FastAPI           │
│ Frontend:    Streamlit                  │
│ LLM:         LangChain + LangGraph      │
│ Vectors:     FAISS                      │
│ Financial:   Pandas + NumPy-financial   │
│ Workflow:    n8n orquestração           │
└─────────────────────────────────────────┘
```

#### Implementado (REAL)

```
┌─────────────────────────────────────────┐
│ STACK IMPLEMENTADO                      │
├─────────────────────────────────────────┤
│ Backend:     Node.js + Express          │
│ Frontend:    React + Vite               │
│ LLM:         OpenAI direto              │
│ Vectors:     -                          │
│ Financial:   - (não implementado)       │
│ Workflow:    Z-API direto               │
└─────────────────────────────────────────┘
```

---

### Análise da Divergência

#### Por que a Mudança?

1. **Pragmatismo**: Stack JavaScript full-stack (único ecosistema)
2. **Velocidade**: Menos complexidade, mais rapidez de desenvolvimento
3. **MVP First**: Foco em funcionalidades core
4. **Expertise**: Time com conhecimento JS/React

#### Consequências

**Positivas:**
- ✅ Desenvolvimento mais rápido
- ✅ Menos ferramentas para aprender
- ✅ Ecosistema unificado (npm)
- ✅ Deploy simplificado

**Negativas:**
- ❌ Financeiro não implementado
- ❌ LangGraph não utilizado (orquestração complexa)
- ❌ Sem FAISS (busca vetorial)
- ❌ n8n não integrado

---

### Roadmap de Convergência (Futuro)

#### Fase 1: Manter JavaScript
- Implementar financeiro (Node.js)
- Adicionar LangChain.js
- Integrar n8n via API

#### Fase 2: Migração Gradual (Opcional)
- Migrar LLM para LangChain
- Adicionar FAISS para busca semântica
- Considerar microserviços Python para IA

---

## 13. Checklist de Ações Recomendadas

### 🚀 Próximos 7 Dias (Sprint 1) - CRÍTICO

```
□ Implementar JWT authentication
  └─ Login com email/senha
  └─ Middleware de proteção
  └─ Role-based access control

□ Criar .env.example (backend + frontend)
  └─ Documentar todas as variáveis
  └─ Adicionar ao README

□ Adicionar rate limiting
  └─ express-rate-limit
  └─ Limites por endpoint

□ Configurar Winston logging
  └─ Logs estruturados
  └─ Error tracking

□ Implementar /health endpoint
  └─ Health checks (DB, Redis, etc.)

□ Adicionar testes unitários (coverage 30%+)
  └─ Controllers principais
  └─ Models

□ Documentar API (Swagger básico)
  └─ Endpoints principais
  └─ Request/Response examples
```

---

### 📈 Próximos 30 Dias (Sprint 2-4) - IMPORTANTE

```
□ Migrar backend para TypeScript
  └─ tsconfig.json
  └─ Tipos compartilhados

□ Implementar Redis cache
  └─ Dashboard KPIs
  └─ Queries frequentes

□ Configurar Sentry error tracking
  └─ Integração backend + frontend

□ Implementar Bull queue
  └─ WhatsApp (retry lógica)
  └─ Web Push

□ Completar PWA offline mode
  └─ IndexedDB queue
  └─ Sync ao reconectar

□ Adicionar índices MongoDB otimizados
  └─ Índices compostos
  └─ Analyze query performance

□ Implementar LGPD compliance
  └─ Consent forms
  └─ Criptografia de dados sensíveis
  └─ Auditoria de acesso

□ Testes E2E com Playwright
  └─ Fluxos principais
  └─ Coverage 80%+
```

---

### 🎯 Próximos 90 Dias (Roadmap) - DESEJÁVEL

```
□ Dashboard financeiro completo
  └─ financeiroController.js
  └─ KPIs financeiros

□ Multi-tenant (suporte múltiplas clínicas)
  └─ Schema multi-tenant
  └─ Isolamento de dados

□ Integração pagamentos (Stripe)
  └─ Checkout
  └─ Webhooks

□ CRM avançado
  └─ Tags
  └─ Segmentação
  └─ Campanhas

□ Analytics completo
  └─ Google Analytics 4
  └─ Métricas customizadas

□ Migrar para LangChain/LangGraph
  └─ Orquestração complexa
  └─ Memory management

□ n8n workflow orchestration
  └─ Automações visuais

□ Mobile app nativo (React Native)
  └─ App iOS/Android
```

---

## 14. Sumário Executivo

### ✅ PONTOS FORTES

```
✅ Arquitetura moderna (React + Node.js)
✅ PWA funcional com Web Push
✅ Chatbot WhatsApp com IA (GPT-4o-mini)
✅ CRON jobs automatizados (lembretes 24h)
✅ Dashboard responsivo e funcional
✅ Integração Z-API robusta
✅ Código limpo e organizado
✅ TypeScript parcial no frontend
✅ MongoDB com Mongoose (ODM)
✅ Documentação PWA excelente (assets/docs/)
```

---

### 🔴 VULNERABILIDADES CRÍTICAS

```
❌ SEM AUTENTICAÇÃO (APIs expostas publicamente)
❌ Dados médicos sem criptografia (LGPD)
❌ CORS não testado em produção
❌ Sem rate limiting (vulnerável a abuse)
❌ Sem monitoramento/logging estruturado
```

---

### 📊 STACK ATUAL (Resumo)

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 19 + Vite + TailwindCSS + TypeScript |
| **Backend** | Node.js + Express + MongoDB |
| **IA** | OpenAI GPT-4o-mini + Function Calling |
| **WhatsApp** | Z-API Webhook Integration |
| **PWA** | Service Worker + Web Push + VAPID |
| **CRON** | node-cron (timezone: Europe/Lisbon) |
| **Deploy** | Vercel (frontend) + ? (backend) |

---

### 🎯 RECOMENDAÇÃO FINAL

#### PRIORIDADE 1: SEGURANÇA 🔴
```
→ Implementar autenticação JWT
→ Rate limiting + CORS testing
→ LGPD compliance (consent + encryption)
```

#### PRIORIDADE 2: CONFIABILIDADE ⚠️
```
→ Error tracking (Sentry)
→ Logging estruturado (Winston)
→ Monitoring (/health, /metrics)
```

#### PRIORIDADE 3: ESCALABILIDADE 📈
```
→ Redis cache
→ Bull queue (async jobs)
→ MongoDB índices otimizados
```

#### PRIORIDADE 4: QUALIDADE 💡
```
→ Migrar backend para TypeScript
→ Testes (80%+ coverage)
→ API documentation (Swagger)
```

---

## 📞 Contato e Suporte

**Desenvolvedor:** André dos Reis
**Email:** [seu-email@exemplo.com]
**GitHub:** [seu-github]

---

## 📄 Licença

[Definir licença]

---

## 🙏 Agradecimentos

- OpenAI (GPT-4o-mini)
- Z-API (WhatsApp Business)
- MongoDB Atlas
- Vercel
- Comunidade React/Node.js

---

**FIM DA ANÁLISE COMPLETA**

---

**Última Atualização:** 16 de Novembro de 2025
**Versão:** 1.0.0
**Status:** ✅ Completo
