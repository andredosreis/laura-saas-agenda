# Express — Convenções Gerais

## ESM: extensão `.js` obrigatória em todos os imports

```javascript
// correcto
import Cliente from '../models/Cliente.js';
import { authenticate } from '../middlewares/auth.js';

// errado — falha silenciosamente em Node ESM
import Cliente from '../models/Cliente';
```

## Sem secrets hardcoded

Todos os segredos, URLs e credenciais vêm de `process.env.*`.

```javascript
// correcto
const secret = process.env.JWT_SECRET;

// errado
const secret = 'minha-chave-secreta';
```

Excepção aceitável: `'Europe/Lisbon'` como constante nomeada.

## Sem `await` em loop

```javascript
// correcto — paralelo
await Promise.all(ids.map(id => process(id)));

// proibido — bloqueia event loop
for (const id of ids) { await process(id); }
```

## Contrato de resposta fixo (nunca alterar)

```javascript
// sucesso
res.json({ success: true, data: { ... } });
res.status(201).json({ success: true, data: { ... } });

// sucesso com paginação
res.json({ success: true, data: [...], pagination: { total, page, pages, limit } });

// erro
res.status(4xx).json({ success: false, error: 'Mensagem clara' });
```

Nunca usar `message`, `msg`, `result`. Nunca enviar stack trace ao cliente.

## Paginação obrigatória em listagens

```javascript
const page  = Math.max(1, parseInt(req.query.page)  || 1);
const limit = Math.min(100, parseInt(req.query.limit) || 20);
const skip  = (page - 1) * limit;

const [data, total] = await Promise.all([
  Model.find({ tenantId: req.user.tenantId }).skip(skip).limit(limit).sort({ createdAt: -1 }),
  Model.countDocuments({ tenantId: req.user.tenantId })
]);
```

Máximo 100 por página. Sempre ordenar explicitamente.

## Datas com Luxon

```javascript
import { DateTime } from 'luxon';

const agora  = DateTime.now().setZone('Europe/Lisbon');
const amanha = agora.plus({ days: 1 }).startOf('day');
```

Nunca usar `new Date()` em lógica de negócio.

## Códigos de erro

| Código | Quando usar |
|---|---|
| 400 | Dados inválidos, ObjectId inválido, regra de negócio violada |
| 401 | Token ausente, expirado ou inválido |
| 403 | Sem permissão por role ou plano — nunca por tenant (usar 404) |
| 404 | Recurso não encontrado — incluindo acesso a recurso de outro tenant |
| 409 | Conflito — registo duplicado (telefone, email) |
| 423 | Conta bloqueada (5 tentativas → 2h) |
| 500 | Erro interno — mensagem genérica em produção |
