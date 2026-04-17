# Mongoose — Models

Models ficam em `src/models/`. Responsabilidade: schema + índices.

## Estrutura padrão

```javascript
// src/models/Cliente.js
import mongoose from 'mongoose';

const clienteSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  nome:     { type: String, required: true, trim: true },
  telefone: { type: String, required: true },
  email:    { type: String, lowercase: true, trim: true },
  ativo:    { type: Boolean, default: true },
}, { timestamps: true });

// Índices obrigatórios para isolamento e performance
clienteSchema.index({ tenantId: 1, telefone: 1 }, { unique: true });
clienteSchema.index({ tenantId: 1, ativo: 1 });

export default mongoose.model('Cliente', clienteSchema);
```

## Índices críticos (não remover)

```javascript
clienteSchema.index({ tenantId: 1, telefone: 1 }, { unique: true });
clienteSchema.index({ tenantId: 1, ativo: 1 });
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
agendamentoSchema.index({ tenantId: 1, data: 1 });
agendamentoSchema.index({ tenantId: 1, clienteId: 1 });
```

## Regras

- `tenantId` é **obrigatório** em todos os schemas de dados de tenant
- Queries novas precisam de índice correspondente — verificar antes de criar
- `.populate()` só quando o campo é usado na resposta; nunca populate para aceder a um único campo — usar `.select()` em alternativa
- Novas queries sem índice correspondente devem ser acompanhadas do índice no schema

## Transacções (múltiplos documentos relacionados)

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

Obrigatório ao criar/actualizar múltiplos documentos relacionados (ex: registo Tenant+User, compra de pacote).
