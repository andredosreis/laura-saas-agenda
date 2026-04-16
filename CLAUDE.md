# Laura SaaS Agenda

Sistema SaaS multi-tenant de gestão de agendamentos para profissionais de saúde/estética.
Produto comercial: **Marcai** (nome fantasia). Backend Node.js/Express no Render, frontend React/Vite PWA no Vercel.

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
| Integrações | WhatsApp via Z-API webhook, OpenAI GPT-4o-mini |

## Environment

```bash
# Backend
npm run dev          # nodemon src/server.js (porta 5000)
npm start            # node src/server.js (produção)
# Verificar: GET http://localhost:5000/api/auth/me → 401 (API activa)

# Frontend
cd laura-saas-frontend && npm run dev   # Vite (porta 5173)
# Verificar: http://localhost:5173 → ecrã de login Marcai
```

## Folder Structure

```
laura-saas-agenda/
├── src/                         # Backend Node.js ESM
│   ├── server.js                # Entry point — DB + Express startup
│   ├── app.js                   # Express setup — middlewares, rotas, errorHandler
│   ├── controllers/             # Validação de input + orquestração de negócio
│   ├── models/                  # Mongoose schemas + índices compostos
│   ├── routes/                  # Express routers (só routing, sem lógica)
│   ├── middlewares/             # auth.js, rateLimiter.js, errorHandler.js
│   ├── services/                # Integrações externas: email, push, openai, zapi
│   └── utils/                   # Helpers puros sem side effects
├── laura-saas-frontend/         # Frontend React (migração TypeScript em curso)
│   └── src/
│       ├── pages/               # Uma página por rota (.jsx existente / .tsx novo)
│       ├── components/          # Componentes reutilizáveis
│       ├── contexts/            # AuthContext.jsx, ThemeContext.jsx
│       ├── services/            # api.js — axios com interceptors
│       ├── schemas/             # Zod schemas de formulários
│       └── types/               # TypeScript type definitions
├── scripts/
│   ├── maintenance/             # Scripts de correcção de dados (execução manual)
│   └── tools/                   # Scripts utilitários e de teste manual
├── docs/
│   ├── adrs/generated/          # Architecture Decision Records (ADR-001 a ADR-013)
│   └── guidelines/              # Guias de desenvolvimento JS e TS
└── .claude/
    ├── CLAUDE.md                # Este ficheiro — regras universais + triggers
    ├── guidelines/              # Contexto específico por tipo de tarefa
    ├── agents/                  # Definições de subagentes especializados
    └── docs/                    # Referência técnica (API.md, ARQUITETURA.md)
```

## Build & Tests

```bash
# Backend
npm test                                     # Jest — todos os testes
npm test -- --testPathPattern=auth           # Ficheiro específico

# Frontend
cd laura-saas-frontend
npm run build                                # TypeScript check + build Vite
npm run lint                                 # ESLint
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

---

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
