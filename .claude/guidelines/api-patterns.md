# API Patterns — Laura SaaS Agenda

Lê este ficheiro ao adicionar ou modificar rotas em `src/routes/`.

Base URL: `http://localhost:5000/api`

---

## Estrutura de Rota

```javascript
// routes/clienteRoutes.js — só routing, sem lógica
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requirePlan } from '../middlewares/requirePlan.js';
import * as ctrl from '../controllers/clienteController.js';

const router = Router();
router.use(authenticate);                    // todas as rotas protegidas

router.get('/',          ctrl.listar);
router.post('/',         requirePlan, ctrl.criar);
router.get('/:id',       ctrl.obter);
router.put('/:id',       ctrl.actualizar);
router.delete('/:id',    ctrl.remover);

export default router;
```

---

## Contrato de Resposta (fixo — nunca alterar)

```javascript
// Sucesso
res.json({ success: true, data: { ... } });
res.status(201).json({ success: true, data: { ... } });

// Sucesso com paginação
res.json({ success: true, data: [...], pagination: { total, page, pages, limit } });

// Erro
res.status(400).json({ success: false, error: 'Mensagem clara para o utilizador' });
```

Nunca retornar stack trace. Nunca retornar campos como `message`, `msg`, ou `result` — sempre `data` ou `error`.

---

## Códigos de Erro

| Código | Quando usar |
|---|---|
| 400 | Dados inválidos, ObjectId inválido, regra de negócio violada |
| 401 | Token ausente, expirado ou inválido |
| 403 | Sem permissão por role ou plano — nunca por tenant (ver 404) |
| 404 | Recurso não encontrado — incluindo acesso a recurso de outro tenant |
| 409 | Conflito — registo duplicado (telefone, email) |
| 423 | Conta bloqueada (5 tentativas falhadas → 2h) |
| 500 | Erro interno — mensagem genérica em produção |

**Nota crítica:** acesso cruzado entre tenants → `404`, nunca `403`. Não revelar que o recurso existe.

---

## Auth Header

```
Authorization: Bearer <accessToken>
```

Todas as rotas excepto auth e webhook requerem este header.

---

## Paginação — Query Params

```
GET /api/clientes?page=1&limit=20&search=joao&ativo=true
```

- `page` default: 1
- `limit` default: 20, máximo: 100
- Sempre retornar `pagination` na resposta de listagem

---

## Rotas Públicas (sem auth)

```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET  /api/auth/verify-reset-token/:token
GET  /api/auth/verify-email/:token
POST /api/webhook/whatsapp        ← protegido por x-api-token, não JWT
```

Todas as outras rotas exigem `authenticate` middleware.

---

## Nomeação de Rotas

- Recursos em português e plural: `/clientes`, `/agendamentos`, `/pacotes`
- Acções não-CRUD como sub-recursos: `POST /agendamentos/:id/enviar-lembrete`
- IDs sempre em `:id` — nunca query param para identificar recurso único

---

## Adicionar Nova Rota — Checklist

- [ ] Rota criada em `routes/` (só routing)
- [ ] Lógica em `controllers/` (validação + orquestração)
- [ ] Middleware `authenticate` aplicado
- [ ] Middleware `requirePlan` aplicado se consome limite
- [ ] Resposta segue contrato `{ success, data/error }`
- [ ] Paginação incluída se é listagem
- [ ] Rota adicionada à referência em `.claude/docs/API.md`
