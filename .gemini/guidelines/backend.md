# Backend Guidelines — Laura SaaS Agenda

Lê este ficheiro antes de qualquer alteração em `src/`.
As regras universais (multi-tenancy, response format, ESM imports) estão em `CLAUDE.md` — não repetidas aqui.

---

## Validação de Plano

Antes de criar/actualizar recursos que consomem limites (cliente, agendamento):

```javascript
const tenant = await Tenant.findById(req.user.tenantId);

if (!['ativo', 'trial'].includes(tenant.plano.status)) {
  return res.status(403).json({ success: false, error: 'Plano inactivo' });
}

const total = await Cliente.countDocuments({ tenantId: req.user.tenantId });
if (total >= tenant.limites.maxClientes) {
  return res.status(403).json({ success: false, error: 'Limite de clientes atingido' });
}
```

O backend é a fonte de verdade — nunca confiar apenas no frontend para validar limites.

---

## Validação de Input

```javascript
import mongoose from 'mongoose';

// Validar ObjectId antes de qualquer query por _id
if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
  return res.status(400).json({ success: false, error: 'ID inválido' });
}

// Nunca passar req.body directamente ao Model — desestruturar sempre
const { nome, telefone, email } = req.body;
await Cliente.create({ nome, telefone, email, tenantId: req.user.tenantId });
```

---

## Paginação

Padrão obrigatório em todas as listagens:

```javascript
const page  = Math.max(1, parseInt(req.query.page)  || 1);
const limit = Math.min(100, parseInt(req.query.limit) || 20);
const skip  = (page - 1) * limit;

const [data, total] = await Promise.all([
  Model.find({ tenantId: req.user.tenantId })
    .skip(skip).limit(limit).sort({ createdAt: -1 }),
  Model.countDocuments({ tenantId: req.user.tenantId })
]);

res.json({
  success: true,
  data,
  pagination: { total, page, pages: Math.ceil(total / limit), limit }
});
```

Máximo 100 por página. Sempre ordenar explicitamente.

---

## Transacções MongoDB

Obrigatório quando criar/actualizar múltiplos documentos relacionados (ex: registo Tenant+User, compra de pacote):

```javascript
const session = await mongoose.startSession();
session.startTransaction();
try {
  const tenant = await Tenant.create([{ ... }], { session });
  const user   = await User.create([{ ... }], { session });
  await session.commitTransaction();
} catch (err) {
  await session.abortTransaction();
  throw err;
} finally {
  session.endSession();
}
```

---

## Datas

```javascript
import { DateTime } from 'luxon';

const agora  = DateTime.now().setZone('Europe/Lisbon');
const amanha = agora.plus({ days: 1 }).startOf('day');
```

Nunca usar `new Date()` em lógica de negócio. Nunca hardcodar string de timezone — usar constante ou env var.

---

## Performance

- `.populate()` só quando o campo populado é usado na resposta. Nunca populate para aceder a um único campo — usar `.select()`.
- Queries novas precisam de índice correspondente. Verificar antes de criar.

---

## Índices Críticos (não remover)

```javascript
clienteSchema.index({ tenantId: 1, telefone: 1 }, { unique: true });
clienteSchema.index({ tenantId: 1, ativo: 1 });
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
agendamentoSchema.index({ tenantId: 1, data: 1 });
agendamentoSchema.index({ tenantId: 1, clienteId: 1 });
```

---

## Estrutura por Camada

| Camada | Responsabilidade |
|---|---|
| `routes/` | Só routing — sem lógica |
| `controllers/` | Validação de input + orquestração |
| `services/` | Integrações externas + regra de negócio complexa |
| `models/` | Schema + índices |
| `middlewares/` | Auth, validação, rate limit |
| `utils/` | Helpers puros sem side effects |

---

## Checklist Antes de Commitar

- [ ] Todas as queries incluem `tenantId`
- [ ] Nenhum `findById` isolado (substituído por `findOne` com `tenantId`)
- [ ] Plano e limites validados onde necessário
- [ ] Input desestruturado — nunca `Model.create(req.body)`
- [ ] ObjectIds validados antes de queries por `_id`
- [ ] Nenhum `await` em loop
- [ ] Nenhum dado sensível (password, token) na resposta ou em logs
- [ ] Imports com extensão `.js`
