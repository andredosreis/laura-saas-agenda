# Testing Guidelines — Laura SaaS Agenda

Lê este ficheiro ao escrever ou modificar testes em `src/__tests__/`.

---

## Stack de Testes

- **Runner:** Jest
- **HTTP:** Supertest
- **DB:** `mongodb-memory-server` — nunca usar MongoDB real em testes
- **Mocks obrigatórios:** OpenAI, Z-API, SMTP (nodemailer), Web Push

---

## Setup Padrão

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
  // limpar todas as collections entre testes
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

Configurar em `jest.config.js`:
```javascript
export default {
  globalSetup: './src/__tests__/setup.js',
  testEnvironment: 'node',
};
```

---

## Estrutura de Teste

```javascript
// src/__tests__/auth.test.js
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

---

## Teste de Isolamento Multi-Tenant (Obrigatório)

Este teste deve existir para cada recurso principal. A sua ausência é 🔴 Crítico.

```javascript
describe('Isolamento multi-tenant — Cliente', () => {
  it('Tenant B não consegue ver cliente do Tenant A', async () => {
    // criar e autenticar Tenant A
    const { tokenA, tenantAId } = await criarTenantComToken('a@test.com');
    // criar cliente pertencente ao Tenant A
    const { body: { data: clienteA } } = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nome: 'Cliente A', telefone: '910000001' });

    // criar e autenticar Tenant B
    const { tokenB } = await criarTenantComToken('b@test.com');

    // Tenant B tenta ler o cliente do Tenant A
    const res = await request(app)
      .get(`/api/clientes/${clienteA._id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    // deve ser 404 — não revela que o recurso existe
    expect(res.status).toBe(404);
  });
});
```

---

## Prioridade de Implementação

1. `authController` — register, login, refresh, verify-email
2. `clienteController` — CRUD + isolamento multi-tenant
3. `agendamentoController` — criação, estado, conflitos
4. Webhook WhatsApp — validação de token, processamento

---

## Regras

- Testes são determinísticos — sem dependência de ordem ou timing
- Cada teste começa com DB limpa (ver `afterEach` acima)
- Cobrir obrigatoriamente cenários negativos: credenciais erradas, limites de plano, bloqueios
- Mockar todos os serviços externos — nunca chamar OpenAI ou Z-API em testes

```javascript
// Mock de serviço externo
jest.mock('../services/openaiService.js', () => ({
  classificarIntencao: jest.fn().mockResolvedValue('agendar'),
}));
```

---

## Cobertura Mínima

- Controllers críticos (auth, clientes, agendamentos): ≥ 70%
- Todos os fluxos de erro testados
- Bloqueios e limites de plano testados

---

## CI — Correcção Pendente

O `.github/workflows/ci.yml` usa `MONGO_URI: mongodb://localhost:27017/test` mas não configura serviço MongoDB.
Com `mongodb-memory-server` essa env var deixa de ser necessária — remover do CI ao implementar a suite de testes.

---

## Checklist Antes de Commitar Testes

- [ ] `mongodb-memory-server` usado (nunca MongoDB real)
- [ ] Serviços externos mockados (OpenAI, Z-API, SMTP)
- [ ] Teste de isolamento multi-tenant existe para cada recurso novo
- [ ] Cenários negativos cobertos
- [ ] `npm test` passa localmente
