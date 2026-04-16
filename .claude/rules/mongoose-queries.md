# Mongoose — Queries

## Regra fundamental: `tenantId` em todas as queries

```javascript
// correcto
Cliente.findOne({ _id: id, tenantId: req.user.tenantId })
Cliente.find({ tenantId: req.user.tenantId, ativo: true })

// errado — vulnerabilidade de isolamento multi-tenant
Cliente.findById(id)
Cliente.find({ ativo: true })
```

`findById` isolado é sempre uma vulnerabilidade — substituir por `findOne` com `tenantId`.

## Acesso cruzado entre tenants → 404

```javascript
const cliente = await Cliente.findOne({ _id: id, tenantId: req.user.tenantId });

if (!cliente) {
  // Tanto "não existe" como "pertence a outro tenant" retornam 404
  // Nunca retornar 403 — não revelar que o recurso existe
  return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
}
```

## Validar ObjectId antes de qualquer query por `_id`

```javascript
import mongoose from 'mongoose';

if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
  return res.status(400).json({ success: false, error: 'ID inválido' });
}
```

## Populate com critério

```javascript
// correcto — populate só do que é necessário
const agendamento = await Agendamento
  .findOne({ _id: id, tenantId: req.user.tenantId })
  .populate('clienteId', 'nome telefone');

// errado — populate desnecessário apenas para aceder a um campo
const agendamento = await Agendamento
  .findOne({ _id: id, tenantId: req.user.tenantId })
  .populate('clienteId'); // populate completo quando só se precisava do nome
```

## Queries paralelas

```javascript
// correcto — paralelo
const [data, total] = await Promise.all([
  Model.find({ tenantId: req.user.tenantId }).skip(skip).limit(limit),
  Model.countDocuments({ tenantId: req.user.tenantId })
]);

// errado — serial desnecessário
const data  = await Model.find({ tenantId: req.user.tenantId });
const total = await Model.countDocuments({ tenantId: req.user.tenantId });
```

## Nunca `req.body` directamente em updates

```javascript
// correcto
const { nome, telefone, email } = req.body;
await Cliente.findOneAndUpdate(
  { _id: id, tenantId: req.user.tenantId },
  { nome, telefone, email },
  { new: true, runValidators: true }
);

// errado — mass assignment
await Cliente.findOneAndUpdate(
  { _id: id, tenantId: req.user.tenantId },
  req.body
);
```
