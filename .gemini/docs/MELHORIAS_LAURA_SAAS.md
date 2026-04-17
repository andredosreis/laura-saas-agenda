# 🛠️ Relatório de Melhorias — Laura SaaS Agenda

> **Branch sugerida:** `feature/senior-upgrade`
> **Autor:** André dos Reis
> **Data:** Março 2026
> **Nível actual:** Pleno Sólido → **Objectivo:** Sénior

---

## Índice

1. [Testes](#1-testes)
2. [Observabilidade](#2-observabilidade)
3. [CI/CD](#3-cicd)
4. [Segurança & Robustez da API](#4-segurança--robustez-da-api)
5. [Performance & Escalabilidade](#5-performance--escalabilidade)
6. [Integração IA (GPT-4o-mini)](#6-integração-ia-gpt-4o-mini)
7. [Documentação & README](#7-documentação--readme)
8. [Ordem de Prioridade](#ordem-de-prioridade)

---

## 1. Testes



### O que fazer

#### 1.1 Testes Unitários — Backend
- Instalar `Jest` + `Supertest`
- Testar cada **controller** individualmente com mocks do Mongoose
- Cobrir casos felizes e casos de erro (ex: cliente não encontrado, token expirado)

```bash
npm install --save-dev jest supertest @types/jest
```

**Ficheiros prioritários para testar:**
- `controllers/agendamentosController.js`
- `controllers/clientesController.js`
- `services/whatsappService.js`
- `middlewares/auth.js` (validação de JWT + tenantId)

#### 1.2 Testes de Integração — Rotas da API
- Testar fluxo completo: registo → login → criar agendamento → confirmar
- Usar base de dados de teste separada (`lauraDB_test`)

#### 1.3 Testes de Frontend
- Instalar `Vitest` + `React Testing Library`
- Testar componentes críticos: formulário de agendamento, dashboard KPIs

```bash
npm install --save-dev vitest @testing-library/react @testing-library/user-event
```

#### 1.4 Meta de cobertura
| Área | Cobertura mínima |
|------|-----------------|
| Middlewares | 90% |
| Controllers | 70% |
| Services | 60% |
| Frontend components críticos | 50% |

---

## 2. Observabilidade

> **Impacto no nível:** 🔴 Crítico — em produção com cliente real, tens de saber o que falha

### O que fazer

#### 2.1 Error Tracking — Sentry
- Integrar Sentry no backend e no frontend
- Tier gratuito suficiente para 1 cliente

```bash
npm install @sentry/node @sentry/react
```

Configurar em `app.js`:
```javascript
import * as Sentry from "@sentry/node";
Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
```

#### 2.2 Logs Estruturados
- Substituir `console.log` por `Winston` ou `Pino`
- Logs em formato JSON para facilitar parsing futuro

```bash
npm install pino pino-pretty
```

Formato mínimo por log:
```json
{
  "level": "info",
  "timestamp": "2026-03-27T10:00:00Z",
  "tenantId": "abc123",
  "action": "agendamento_criado",
  "agendamentoId": "xyz789"
}
```

#### 2.3 Health Check endpoint
- Adicionar rota `GET /health` que valida conexão ao MongoDB

```javascript
app.get('/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'ok' : 'error';
  res.json({ status: 'ok', db: dbStatus, timestamp: new Date().toISOString() });
});
```

---

## 3. CI/CD

> **Impacto no nível:** 🟡 Alto — deploy manual em produção é risco

### O que fazer

#### 3.1 GitHub Actions — Pipeline básico
Criar `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, feature/*]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm test
      - run: npm run lint
```

#### 3.2 Lint obrigatório
- Configurar `ESLint` + `Prettier` se ainda não estiver
- Bloquear merge sem lint passar

#### 3.3 Deploy automático (quando estiveres pronto)
- Render, Railway ou Fly.io suportam deploy automático a partir do GitHub
- Variáveis de ambiente geridas pela plataforma, não no `.env` local

---

## 4. Segurança & Robustez da API

> **Impacto no nível:** 🟡 Alto

### O que fazer

#### 4.1 Rate Limiting
- Sem rate limiting, qualquer ataque de força bruta ou spam derruba o sistema

```bash
npm install express-rate-limit
```

```javascript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máx 10 tentativas
  message: 'Demasiadas tentativas. Tenta novamente em 15 minutos.'
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
```

#### 4.2 Queue para Webhooks WhatsApp
- Se chegarem muitas mensagens em simultâneo ao `/webhook/whatsapp`, o processamento síncrono perde mensagens
- Solução simples: `bull` ou `bullmq` com Redis para processar em fila

```bash
npm install bullmq ioredis
```

#### 4.3 Validação de Input
- Verificar se todos os controllers usam validação antes de tocar na base de dados
- Se ainda não usas `Zod` no backend (já usas no frontend), considera adicionar

#### 4.4 Helmet.js
```bash
npm install helmet
```
```javascript
import helmet from 'helmet';
app.use(helmet()); // headers de segurança HTTP em 1 linha
```

---

## 5. Performance & Escalabilidade

> **Impacto no nível:** 🟢 Médio — a base já está bem

### O que fazer

#### 5.1 Índices MongoDB optimizados
Verificar se existem índices para as queries mais frequentes:

```javascript
// No modelo de Agendamentos
AgendamentoSchema.index({ tenantId: 1, data: 1 }); // listagem por data
AgendamentoSchema.index({ tenantId: 1, estado: 1 }); // filtro por estado
AgendamentoSchema.index({ tenantId: 1, clienteId: 1 }); // histórico do cliente

// No modelo de Clientes
ClienteSchema.index({ tenantId: 1, telefone: 1 }, { unique: true }); // já deves ter
ClienteSchema.index({ tenantId: 1, nome: 'text' }); // pesquisa por nome
```

#### 5.2 Caching do Dashboard
- Os KPIs do dashboard calculam dados em tempo real em cada request
- Para 1 cliente não é problema, mas para 10+ tenants activos, é

Solução simples com cache em memória:
```bash
npm install node-cache
```
- Cache de 5 minutos nos endpoints `/api/dashboard`

#### 5.3 Paginação nas listagens
- Verificar se as rotas de clientes e agendamentos têm paginação
- Sem paginação, uma clínica com 500+ clientes carrega tudo de uma vez

```javascript
// Padrão a usar
const { page = 1, limit = 20 } = req.query;
const skip = (page - 1) * limit;
const clientes = await Cliente.find({ tenantId }).skip(skip).limit(Number(limit));
```

---

## 6. Integração IA (GPT-4o-mini)

> **Impacto no nível:** 🟢 Médio — completa o que prometeste

### O que fazer

#### 6.1 Completar o Chatbot WhatsApp
A integração WhatsApp já está activa. O que falta é o layer de IA por cima.

Fluxo a implementar:
```
Mensagem WhatsApp recebida
  → Webhook Z-API
    → Classificar intenção (agendar / consultar / cancelar)
      → Se agendar: GPT-4o-mini com Function Calling
        → Chamar função interna createAgendamento()
          → Confirmar via WhatsApp
```

#### 6.2 Function Calling — funções a expor ao GPT
```javascript
const tools = [
  {
    name: "criar_agendamento",
    description: "Cria um agendamento para um cliente",
    parameters: {
      type: "object",
      properties: {
        clienteNome: { type: "string" },
        data: { type: "string", description: "formato ISO 8601" },
        hora: { type: "string" },
        servico: { type: "string" }
      },
      required: ["clienteNome", "data", "hora"]
    }
  },
  {
    name: "consultar_disponibilidade",
    description: "Verifica horários disponíveis numa data",
    parameters: {
      type: "object",
      properties: {
        data: { type: "string" }
      },
      required: ["data"]
    }
  }
];
```

#### 6.3 Actualizar README
- Quando a IA estiver funcional, actualizar o README para reflectir o estado real
- Adicionar secção "Roadmap" para features futuras em vez de documentar como feito o que não está

---

## 7. Documentação & README

> **Impacto no nível:** 🟢 Médio — o teu portfólio público

### O que fazer

#### 7.1 Adicionar ao README
- Screenshot ou GIF do dashboard (usa [Loom](https://loom.com) ou [ScreenToGif](https://screentogif.com))
- Badge de status: `Em produção ✅`
- Secção "Roadmap" com o que está a ser desenvolvido
- Remover ou mover para Roadmap a funcionalidade de IA que ainda não está completa

#### 7.2 Adicionar ao topo do README
```markdown
> ⚡ **Em produção** — sistema activo com cliente real no sector de estética/saúde
```

---

## Ordem de Prioridade

| # | Melhoria | Impacto no Nível | Esforço | Fazer primeiro? |
|---|----------|-----------------|---------|-----------------|
| 1 | Testes unitários (controllers + middlewares) | 🔴 Crítico | Médio | ✅ Sim |
| 2 | Sentry (error tracking) | 🔴 Crítico | Baixo | ✅ Sim |
| 3 | Rate limiting | 🟡 Alto | Baixo | ✅ Sim |
| 4 | Helmet.js | 🟡 Alto | Muito Baixo | ✅ Sim |
| 5 | Logs estruturados (Pino) | 🟡 Alto | Baixo | ✅ Sim |
| 6 | Health check endpoint | 🟡 Alto | Muito Baixo | ✅ Sim |
| 7 | Índices MongoDB | 🟡 Alto | Baixo | ✅ Sim |
| 8 | GitHub Actions CI | 🟡 Alto | Médio | 🔜 2ª fase |
| 9 | Paginação nas listagens | 🟢 Médio | Baixo | 🔜 2ª fase |
| 10 | Queue WhatsApp (BullMQ) | 🟢 Médio | Alto | 🔜 2ª fase |
| 11 | Completar integração IA | 🟢 Médio | Alto | 🔜 2ª fase |
| 12 | Caching dashboard | 🟢 Médio | Médio | 🔜 3ª fase |
| 13 | README screenshot + badges | 🟢 Médio | Muito Baixo | 🔜 Qualquer hora |

---

## Checklist Rápido para a Branch

```bash
# Criar branch
git checkout -b feature/senior-upgrade

# Fase 1 — Quick wins de segurança (1-2 dias)
[ ] npm install helmet express-rate-limit
[ ] Adicionar helmet() ao app.js
[ ] Adicionar rate limiting ao /api/auth/login e /api/auth/forgot-password
[ ] Adicionar GET /health
[ ] npm install pino pino-pretty → substituir console.log

# Fase 2 — Observabilidade (1 dia)
[ ] Criar conta Sentry (gratuito)
[ ] npm install @sentry/node @sentry/react
[ ] Configurar Sentry no app.js e no main.tsx

# Fase 3 — Testes (3-5 dias)
[ ] npm install --save-dev jest supertest
[ ] Escrever testes para auth middleware
[ ] Escrever testes para agendamentos controller
[ ] Escrever testes para clientes controller
[ ] Configurar script npm test no package.json

# Fase 4 — MongoDB (1 dia)
[ ] Auditar todos os modelos Mongoose
[ ] Adicionar índices compostos em Agendamento e Cliente
[ ] Verificar paginação nas rotas de listagem

# Fase 5 — CI/CD (1 dia)
[ ] Criar .github/workflows/ci.yml
[ ] Testar pipeline no GitHub
```

---

*Relatório gerado com base na análise do código e arquitectura da Laura SaaS Agenda.*
*Foco: elevar o sistema de nível Pleno para Sénior através de disciplina de engenharia.*
