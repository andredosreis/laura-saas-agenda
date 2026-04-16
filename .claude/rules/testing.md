# Testing

Testes ficam em `src/__tests__/`. Runner: Jest + Supertest + `mongodb-memory-server`.

## Setup padrão

```javascript
// src/__tests__/setup.js
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
```

Nunca usar MongoDB real em testes. Sempre `mongodb-memory-server`.

## Estrutura de teste

```javascript
import request from 'supertest';
import app from '../app.js';

describe('POST /api/auth/login', () => {
  it('rejeita credenciais inválidas com 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nao@existe.com', password: 'errada' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
```

## Teste de isolamento multi-tenant (obrigatório por recurso)

```javascript
describe('Isolamento multi-tenant — Cliente', () => {
  it('Tenant B não consegue ver cliente do Tenant A', async () => {
    const { tokenA } = await criarTenantComToken('a@test.com');
    const { body: { data: clienteA } } = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nome: 'Cliente A', telefone: '910000001' });

    const { tokenB } = await criarTenantComToken('b@test.com');
    const res = await request(app)
      .get(`/api/clientes/${clienteA._id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});
```

A ausência deste teste é 🔴 Crítico.

## Mocks obrigatórios para serviços externos

```javascript
jest.mock('../services/openaiService.js', () => ({
  classificarIntencao: jest.fn().mockResolvedValue('agendar'),
}));

jest.mock('../services/zapiService.js', () => ({
  enviarMensagem: jest.fn().mockResolvedValue({ success: true }),
}));
```

Nunca chamar OpenAI, Z-API ou SMTP reais em testes.

## Prioridade de implementação

1. `authController` — register, login, refresh, verify-email
2. `clienteController` — CRUD + isolamento multi-tenant
3. `agendamentoController` — criação, estado, conflitos
4. Webhook WhatsApp — validação de token, processamento

## Regras

- Testes são determinísticos — sem dependência de ordem ou timing
- Cada teste começa com DB limpa (ver `afterEach`)
- Cobrir cenários negativos: credenciais erradas, limites de plano, bloqueios
- Cobertura mínima em controllers críticos: ≥ 70%

## Checklist antes de commitar testes

- [ ] `mongodb-memory-server` usado (nunca MongoDB real)
- [ ] Serviços externos mockados (OpenAI, Z-API, SMTP)
- [ ] Teste de isolamento multi-tenant existe para cada recurso novo
- [ ] Cenários negativos cobertos
- [ ] `npm test` passa localmente
