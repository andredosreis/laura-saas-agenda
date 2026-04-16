# Multi-Tenant — Isolamento

O isolamento multi-tenant é inviolável. Uma falha aqui é uma vulnerabilidade de segurança crítica.

## Regra fundamental

Toda query Mongoose em dados de tenant deve incluir `{ tenantId: req.user.tenantId }`.

```javascript
// correcto
Cliente.findOne({ _id: id, tenantId: req.user.tenantId })
Agendamento.find({ tenantId: req.user.tenantId, data: hoje })

// errado — findById sem tenantId é sempre vulnerabilidade
Cliente.findById(id)
```

## Resposta a acesso cruzado

Acesso a recurso de outro tenant → `404`, nunca `403`.

```javascript
const cliente = await Cliente.findOne({ _id: id, tenantId: req.user.tenantId });
if (!cliente) {
  return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
  // nunca: return res.status(403) — não revelar que o recurso existe
}
```

## Criação de recursos: tenantId sempre explícito

```javascript
// correcto — tenantId injectado no servidor, nunca vindo do cliente
const cliente = await Cliente.create({
  nome, telefone, email,
  tenantId: req.user.tenantId   // do JWT, não do req.body
});

// errado — o cliente poderia enviar tenantId de outro tenant
const cliente = await Cliente.create({ ...req.body });
```

## Limites de plano por tenant

```javascript
const tenant = await Tenant.findById(req.user.tenantId);

// verificar estado do plano
if (!['ativo', 'trial'].includes(tenant.plano.status)) {
  return res.status(403).json({ success: false, error: 'Plano inactivo' });
}

// verificar limite de recursos
const total = await Cliente.countDocuments({ tenantId: req.user.tenantId });
if (total >= tenant.limites.maxClientes) {
  return res.status(403).json({ success: false, error: 'Limite de clientes atingido' });
}
```

O backend é a fonte de verdade — nunca confiar apenas no frontend para validar limites.

## Teste de isolamento obrigatório

Para cada recurso principal deve existir um teste de isolamento:

```javascript
it('Tenant B não consegue ver recurso do Tenant A', async () => {
  // resultado: 404 — não 403, não 200
  expect(res.status).toBe(404);
});
```

A ausência deste teste é considerada 🔴 Crítico.
