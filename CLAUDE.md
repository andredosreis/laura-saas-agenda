# Laura SaaS Agenda

Sistema SaaS multi-tenant de gestão de agendamentos para profissionais de saúde/estética.
Produto comercial: **Marcai** (nome fantasia). Backend Node.js/Express + microserviço IA Python (FastAPI/LangChain) num VPS Contabo (Docker + nginx), frontend React/Vite PWA no Vercel.

## Library Documentation Lookup

Before implementing any feature, you MUST use the **context7** MCP tool to look up the relevant library APIs and official documentation.

**Always:**

* Check the installed library version in the project manifest
* Retrieve the corresponding documentation using context7
* Cross-reference APIs to avoid deprecated or incompatible patterns
* Follow the official documentation over training data

**Skip documentation lookup only for trivial operations such as:**

* Variable declarations
* Basic control flow
* Simple CRUD using established project patterns

If a library  is involved and ther is uncertainty, documentation lookup is mandatory.
If the documatation returned does not match the installed version, flag the discrepacncy before proceeding.

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 18+ ESM, Express 4, MongoDB/Mongoose 8 |
| Frontend | React 19, TypeScript (migração em curso), Vite 6, Tailwind CSS 3 |
| Auth | JWT access 1h + refresh 7d |
| Timezone | Europe/Lisbon via luxon |
| Notificações | Web Push VAPID |
| Integrações | WhatsApp via Evolution API webhook, OpenAI GPT-4o-mini |
| IA Service | Python 3.12+, FastAPI, LangChain (OpenAI/Gemini/Anthropic), uv, pytest, Ruff |
| Infra | Docker + docker-compose, nginx (TLS Let's Encrypt), VPS Contabo; CI via GitHub Actions |

## Environment

```bash
# Backend
npm run dev          # nodemon src/server.js (porta 5001 em dev — PORT no .env; default do código é 5000)
npm start            # node src/server.js (produção)
# Verificar: GET http://localhost:5001/api/auth/me → 401 (API activa)

# Frontend
cd laura-saas-frontend && npm run dev   # Vite (porta 5173)
# Verificar: http://localhost:5173 → ecrã de login Marcai

# IA Service (Python)
cd ia-service && uv sync                          # instala deps no .venv
PYTHONPATH=src .venv/bin/uvicorn ia_service.main:app --port 8000
# Verificar: GET http://localhost:8000/health → 200
```

## Base de Dados — Acesso e Convenções

Arquitectura **database-per-tenant** (ADR-001) num cluster **MongoDB Atlas**:

- **BD partilhada `laura-saas`**: `Tenant`, `User`, `LidCapture` (crosscutting).
- **BD por tenant `tenant_<tenantId>`**: todos os modelos de negócio, via `getModels(getTenantDB(id))` (`src/models/registry.js`, `src/config/tenantDB.js`).

⚠️ **Nomes de coleção pluralizam à INGLESA** (Mongoose), não em português. Em queries/scripts manuais ao Mongo usar:
`mensagems` (não `mensagens`), `transacaos`, `fechamentomensals`, `comprapacotes`, `historicoatendimentos`, `pagamentos`, `agendamentos`, `clientes`, `leads`, `conversas`, `pacotes`, `schedules`.

⚠️ **O `.env` local aponta para o cluster Atlas de PRODUÇÃO** (o mesmo que o backend no Contabo usa). Qualquer script corrido com `MONGODB_URI` do `.env` lê/escreve **dados reais de produção** — usar só-leitura e confirmar o cluster antes. Backend de produção: container `marcai-backend` no VPS Contabo.

## Folder Structure

```
laura-saas-agenda/
├── src/                         # Backend Node.js ESM
│   ├── server.js                # Entry point — DB + Express startup
│   ├── app.js                   # Express setup — middlewares, rotas, errorHandler
│   ├── modules/                 # Modular monolith (ADR-011) — controller+routes+services por módulo
│   │   ├── auth/                # 11 módulos migrados: auth, clientes, agendamento, ia,
│   │   ├── clientes/            #   financeiro, leads, historico, notificacoes, users,
│   │   └── ...                  #   messaging, admin (ver .claude/rules/express-routes.md)
│   ├── controllers/             # Não migrados: dashboard, analytics, migration, schedule
│   ├── routes/                  # Routers dos controllers não migrados
│   ├── services/                # Shared: emailService, pushService, analyticsService
│   ├── models/                  # Mongoose schemas + índices compostos (crosscutting)
│   ├── middlewares/             # auth.js, rateLimiter.js, errorHandler.js (crosscutting)
│   ├── utils/                   # Helpers puros sem side effects
│   ├── config/                  # Helpers de configuração
│   ├── jobs/                    # Definições de jobs BullMQ
│   ├── queues/                  # Setup de filas BullMQ (Redis)
│   ├── workers/                 # Processos worker (lembretes, etc.)
│   └── migrations/              # Scripts de migração de dados
├── ia-service/                  # Microserviço IA Python (FastAPI/LangChain)
│   ├── src/ia_service/
│   │   ├── main.py              # FastAPI app entry
│   │   ├── config.py            # Config via pydantic-settings
│   │   ├── routers/             # health, transcribe, process
│   │   ├── agents/              # client_agent, lead_agent (LangChain)
│   │   ├── services/            # evolution_client, mongo_reader, tenant_knowledge, ...
│   │   ├── tools/               # lead_tools, client_tools
│   │   └── prompts/             # Templates de prompt
│   ├── tests/                   # pytest (+ tests/evals/ — avaliações LangSmith)
│   ├── pyproject.toml           # Deps (uv) + config Ruff + pytest
│   └── Dockerfile
├── laura-saas-frontend/         # Frontend React (migração TypeScript em curso)
│   └── src/
│       ├── pages/               # Uma página por rota (.jsx existente / .tsx novo)
│       ├── components/          # Componentes reutilizáveis
│       ├── contexts/            # AuthContext.jsx, ThemeContext.jsx
│       ├── services/            # api.js — axios com interceptors
│       ├── schemas/             # Zod schemas de formulários
│       └── types/               # TypeScript type definitions
├── nginx/                       # Config nginx (reverse proxy + TLS) — stack Docker
├── deploy/                      # Tooling de deploy para o VPS Contabo
├── docker-compose.prod.yml      # Stack de produção (backend + ia-service + evolution + redis)
├── Dockerfile                   # Imagem do backend Node.js
├── scripts/
│   ├── maintenance/             # Scripts de correcção de dados (execução manual)
│   └── tools/                   # Scripts utilitários e de teste manual
├── docs/
│   ├── adrs/generated/          # Architecture Decision Records (ADR-001+)
│   └── guidelines/              # Guias de desenvolvimento JS e TS
└── .claude/
    ├── rules/                   # Regras por tópico (multi-tenant, express, mongoose, react...)
    ├── guidelines/              # Contexto específico por tipo de tarefa
    ├── agents/                  # Definições de subagentes especializados
    ├── skills/                  # Skills locais Marcai
    └── docs/                    # Referência técnica (API.md, ARQUITETURA.md)
```

## Build & Tests

```bash
# Backend
npm test                                     # Jest — todos os testes
npm test -- --testPathPattern=auth           # Ficheiro específico
# Testes em tests/ (Jest ESM, NODE_OPTIONS=--experimental-vm-modules). Nunca src/__tests__/.

# Frontend
cd laura-saas-frontend
npm run build                                # TypeScript check + build Vite
npm run lint                                 # ESLint

# IA Service (Python) — a partir de ia-service/
ruff check .                                  # lint (regras E, F, I)
ruff format .                                 # formatação
pytest                                        # testes (asyncio mode, dir tests/)
```

## Universal Rules

Aplicam-se a qualquer tarefa, independentemente do ficheiro ou contexto.

### 1. Isolamento multi-tenant é inviolável

Toda query Mongoose em dados de tenant deve incluir `{ tenantId: req.user.tenantId }`.

```javascript
// CORRECTO
Cliente.findOne({ _id: id, tenantId: req.user.tenantId })

// ERRADO — findById sem tenantId é sempre uma vulnerabilidade
Cliente.findById(id)
```

Acesso a recurso de outro tenant retorna `404`, nunca `403` (não revelar que o recurso existe).

### 2. Contrato de resposta da API é fixo

```javascript
res.json({ success: true, data: { ... } });             // sucesso
res.status(4xx).json({ success: false, error: '...' }); // erro
```

Nunca alterar este contrato. Nunca enviar stack trace ao cliente.

### 3. Sem secrets hardcoded

Segredos, URLs e credenciais vêm exclusivamente de env vars (`process.env.*`).
Excepção aceitável: `'Europe/Lisbon'` como constante nomeada.

### 4. Backend ESM: extensão `.js` obrigatória nos imports

```javascript
import Cliente from '../models/Cliente.js'; // correcto
import Cliente from '../models/Cliente';    // falha silenciosamente em Node ESM
```

### 5. Nunca await em loop

```javascript
// CORRECTO — paralelo
await Promise.all(ids.map(id => process(id)));

// PROIBIDO — serial, bloqueia
for (const id of ids) { await process(id); }
```

### 6. Regra de convivência TypeScript/JavaScript

Ficheiros existentes `.jsx` e `.js` não são convertidos a menos que a tarefa exija explicitamente.
Novos ficheiros: `.tsx` para componentes React, `.ts` para lógica pura.

### 7. TypeScript: tipos de domínio expressivos

Em `.ts`/`.tsx`, preferir tipos que codificam invariantes em vez de `string | null` soltos:

- **Discriminated unions** quando um campo discriminante determina a forma do resto (ex.: `ScheduleException.tipo`: `fechado` sem janela vs `horas-extra`/`horario-especial` com `inicio`/`fim`). Dá narrowing automático.
- Union de literais + `Record<Union, …>` em vez de `string`; `unknown` em vez de `any`; evitar `as` (usar narrowing / type guards `x is T`).
- **Não sobre-engenheirar:** para CRUD simples, tipos simples chegam. Evitar builders/generics pesados e conditional/mapped types complexos (a própria referência avisa que tipos demasiado complexos degradam a compilação).

Referência aprofundada: skill `typescript-advanced-types` (`.claude/skills/typescript-advanced-types`).

---
## Segurança
- Sempre validar isolamento de tenantId
- Webhooks do Evolution API devem validar origem
- Dados pessoais seguem GDPR — região UE obrigatória

## Quando Ler os Guidelines

| Tarefa | Ler antes de começar |
|---|---|
| Qualquer alteração backend em `src/` | `.claude/guidelines/backend.md` |
| Qualquer alteração frontend em `laura-saas-frontend/` | `.claude/guidelines/frontend.md` |
| Adicionar ou modificar rota de API | `.claude/guidelines/api-patterns.md` |
| Escrever ou modificar testes | `.claude/guidelines/testing.md` |
| Auth, middlewares ou rotas públicas | `.claude/guidelines/security.md` |
| Commits ou pull requests | `.claude/guidelines/git-workflow.md` |

Referência de arquitectura: `.claude/docs/ARQUITETURA.md`
Referência de API: `.claude/docs/API.md`
