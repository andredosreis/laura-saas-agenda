# Express — Controllers

Controllers ficam em `src/controllers/`. Responsabilidade: validação de input + orquestração de negócio.

## Estrutura base de um controller

```javascript
// src/controllers/clienteController.js
import mongoose from 'mongoose';
import Cliente from '../models/Cliente.js';
import Tenant from '../models/Tenant.js';

export const criar = async (req, res) => {
  try {
    // 1. Validar input — nunca passar req.body directamente ao Model
    const { nome, telefone, email } = req.body;

    if (!nome || !telefone) {
      return res.status(400).json({ success: false, error: 'Nome e telefone são obrigatórios' });
    }

    // 2. Verificar limites de plano antes de criar
    const tenant = await Tenant.findById(req.user.tenantId);
    if (!['ativo', 'trial'].includes(tenant.plano.status)) {
      return res.status(403).json({ success: false, error: 'Plano inactivo' });
    }
    const total = await Cliente.countDocuments({ tenantId: req.user.tenantId });
    if (total >= tenant.limites.maxClientes) {
      return res.status(403).json({ success: false, error: 'Limite de clientes atingido' });
    }

    // 3. Criar com tenantId explícito
    const cliente = await Cliente.create({ nome, telefone, email, tenantId: req.user.tenantId });

    res.status(201).json({ success: true, data: cliente });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'Telefone já registado' });
    }
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
};
```

## Validação de ObjectId obrigatória

```javascript
if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
  return res.status(400).json({ success: false, error: 'ID inválido' });
}
```

## Validação de plano antes de criar/actualizar recursos com limite

```javascript
const tenant = await Tenant.findById(req.user.tenantId);

if (!['ativo', 'trial'].includes(tenant.plano.status)) {
  return res.status(403).json({ success: false, error: 'Plano inactivo' });
}
```

O backend é a fonte de verdade — nunca confiar apenas no frontend para validar limites.

## Nunca passar `req.body` directamente ao Model

```javascript
// correcto
const { nome, telefone, email } = req.body;
await Cliente.create({ nome, telefone, email, tenantId: req.user.tenantId });

// errado — abre mass assignment
await Cliente.create({ ...req.body, tenantId: req.user.tenantId });
```

## Dados sensíveis nunca na resposta

```javascript
// correcto
const user = await User.findOne({ email }).select('-password -refreshToken');

// errado
const user = await User.findOne({ email });
res.json({ success: true, data: user }); // expõe password hash
```
