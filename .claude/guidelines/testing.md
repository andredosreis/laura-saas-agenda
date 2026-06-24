# Testing Guidelines — Laura SaaS Agenda

Lê este ficheiro ao escrever ou modificar testes em `tests/`.

Os testes vivem em `tests/` (Jest ESM, `NODE_OPTIONS=--experimental-vm-modules`). **Nunca em `src/__tests__/`.**

---

## Stack de Testes

- **Runner:** Jest (ESM)
- **HTTP:** Supertest
- **DB:** `mongodb-memory-server` — nunca usar MongoDB real em testes
- **Mocks obrigatórios:** OpenAI, Evolution API, SMTP/Resend, Web Push

---

## Setup Padrão

`tests/setup.js` exporta helpers; cada ficheiro de teste chama-os nos seus hooks (não há `globalSetup`/`setupFilesAfterEnv`):

```javascript
// tests/setup.js
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

export async function setupTestDB() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = 'test-jwt-secret-key';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(uri);
}

export async function teardownTestDB() {
  await mongoose.disconnect();
  await mongoServer.stop();
}

export async function clearDB() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}
```

Uso num ficheiro de teste:
```javascript
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';

beforeAll(setupTestDB);
afterEach(clearDB);
afterAll(teardownTestDB);
```

`jest.config.js` (ESM, corre com `NODE_OPTIONS=--experimental-vm-modules`):
```javascript
export default {
  testEnvironment: 'node',
  testTimeout: 30000,
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/laura-saas-frontend/'],
  clearMocks: true,
  restoreMocks: true,
};
```

---

## Estrutura de Teste

```javascript
// tests/auth.test.js
import request from 'supertest';
import app from '../src/app.js';

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
- Mockar todos os serviços externos — nunca chamar OpenAI ou Evolution API em testes

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

## CI

Com `mongodb-memory-server` a suite não precisa de um serviço MongoDB no CI — não configurar `MONGO_URI` para apontar a um Mongo externo no `.github/workflows/ci.yml`.

---

## Checklist Antes de Commitar Testes

- [ ] `mongodb-memory-server` usado (nunca MongoDB real)
- [ ] Serviços externos mockados (OpenAI, Evolution API, SMTP/Resend)
- [ ] Teste de isolamento multi-tenant existe para cada recurso novo
- [ ] Cenários negativos cobertos
- [ ] `npm test` passa localmente
