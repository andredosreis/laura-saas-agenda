# JavaScript Development Guidelines

## Project Stack

**User-Specified Libraries**:
- **Web Framework**: Express (v4.19) - Minimal HTTP framework for Node.js - https://expressjs.com
- **ODM**: Mongoose (v8.x) - MongoDB object modeling for Node.js - https://mongoosejs.com
- **Testing**: Jest (v29.x) - JavaScript testing framework with built-in mocking - https://jestjs.io
- **Logging**: Pino (v9.x) - Low-overhead structured JSON logger - https://getpino.io
- **HTTP Client**: Axios (v1.x) - Promise-based HTTP client - https://axios-http.com
- **Validation**: Joi (v17.x) - Schema validation library - https://joi.dev

**Auto-Populated Essential Tools**:
- **Formatting**: Prettier (v3.x) - Opinionated code formatter - https://prettier.io
- **Linting**: ESLint (v9.x) - Pluggable JavaScript linter - https://eslint.org
- **Build Tool**: npm (v10.x) - Node.js package manager - https://npmjs.com

> All code examples use Node.js standard library or language-native features.
> Principles apply regardless of framework choices.

---

## 1. Core Principles

### 1.1 Philosophy and Style
- Prefer `const` over `let`; never use `var`
- Use ES Modules (`import`/`export`) over CommonJS when possible
- Async/await over raw Promises or callbacks
- Fail fast: validate inputs at system boundaries
- One file, one responsibility

```js
// Ferramentas obrigatórias em todo projeto
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "es5"
}

// .eslintrc.json
{
  "env": { "node": true, "es2022": true },
  "extends": ["eslint:recommended"],
  "parserOptions": { "ecmaVersion": "latest", "sourceType": "module" },
  "rules": {
    "no-unused-vars": "error",
    "no-console": "warn",
    "prefer-const": "error"
  }
}
```

### 1.2 Clarity Over Brevity
- Names communicate intent: `getUserById` not `getU`
- Avoid clever one-liners when a clear multi-line version exists
- Extract magic numbers to named constants
- Keep functions under 30 lines; if longer, extract

---

## 2. Project Initialization

### 2.1 Creating New Project
```bash
mkdir my-project && cd my-project
npm init -y
node --version   # verify >= 18.x LTS
npm pkg set type="module"
npm pkg set engines.node=">=18.0.0"

# Configurar ferramentas essenciais
npm install --save-dev prettier eslint
npx eslint --init
echo '{}' > .prettierrc
```

### 2.2 Dependency Management
```bash
npm install <package>             # dependency
npm install --save-dev <package>  # dev dependency
npm uninstall <package>
npm update
npm outdated                      # listar pacotes desatualizados
npm audit                         # verificar vulnerabilidades
npm audit fix                     # corrigir automaticamente
npm ci                            # install determinístico (CI/CD)
```

---

## 3. Project Structure

```
my-project/
├── src/
│   ├── server.js           # entry point
│   ├── app.js              # Express setup / framework bootstrap
│   ├── controllers/        # request handlers
│   ├── services/           # business logic
│   ├── models/             # data models / schemas
│   ├── middlewares/        # Express middlewares
│   ├── routes/             # route definitions
│   ├── config/             # configuration loaders
│   └── utils/              # pure helper functions
├── tests/
│   ├── unit/
│   └── integration/
├── scripts/
│   ├── maintenance/
│   └── tools/
├── docs/
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── jest.config.js
├── package.json
└── README.md
```

**Rules**:
- `controllers/` never contain business logic — delegate to `services/`
- `services/` never import from `controllers/` or `routes/`
- `utils/` contains only pure functions with no side effects
- Configuration is loaded once in `config/` and injected

---

## 4. Container Development (Docker)

### 4.1 Dockerfile (Development)
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["node", "--watch", "src/server.js"]
```

### 4.2 Docker Compose
```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
    depends_on:
      mongo:
        condition: service_healthy

  mongo:
    image: mongo:7-jammy
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mongo_data:
```

### 4.3 .dockerignore
```
node_modules
npm-debug.log
.env
.git
.gitignore
coverage/
dist/
*.md
```

### 4.4 Essential Commands
| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start all services |
| `docker compose logs -f app` | Follow app logs |
| `docker compose exec app node src/server.js` | Run app manually |
| `docker compose exec app npm test` | Run tests |
| `docker compose exec app sh` | Interactive shell |
| `docker compose down -v` | Stop and remove volumes |

---

## 5. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `user-service.js` |
| Variables | camelCase | `userId`, `totalAmount` |
| Functions | camelCase | `getUserById()` |
| Classes | PascalCase | `UserService` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Modules/Packages | kebab-case | `auth-middleware` |
| Env vars | UPPER_SNAKE_CASE | `MONGO_URI` |
| Test files | `*.test.js` | `user.test.js` |

```js
// Bom
const MAX_LOGIN_ATTEMPTS = 5;
const userId = req.params.id;
async function findUserByEmail(email) { ... }
class AuthService { ... }

// Mau
const x = 5;
const USERID = req.params.id;
async function FINDuser(e) { ... }
```

---

## 6. Functions and Methods

### 6.1 Signatures
```js
// Parâmetros claros, sem mais de 3-4 positional args
async function createAppointment(clientId, date, serviceId) {
  const client = await Client.findById(clientId);
  if (!client) throw new NotFoundError(`Client ${clientId} not found`);
  // ...
}

// Quando há muitos parâmetros, usar objeto
async function sendNotification({ userId, message, channel = 'push', priority = 'normal' }) {
  // ...
}
```

### 6.2 Returns and Errors

**Bom:**
```js
async function getUserById(id) {
  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError(`User not found: ${id}`);
  }
  return user;
}
```

**Mau:**
```js
async function getUser(id) {
  try {
    const user = await User.findById(id);
    return user; // retorna null silenciosamente sem aviso
  } catch (err) {
    // ignora erro completamente
  }
}
```

### 6.3 Best Practices
- Funções com uma única responsabilidade
- Máximo 3-4 parâmetros posicionais; usar objeto para mais
- Sem side effects escondidos (mutação de argumentos, variáveis globais)
- Preferir funções puras para lógica de negócio; isolar I/O
- Arrow functions para callbacks curtos; `function` para top-level e métodos

---

## 7. Error Handling

### 7.1 Philosophy
JavaScript usa exceções (`throw`/`catch`) como mecanismo principal. O padrão recomendado é criar classes de erro customizadas para domínio de negócio.

```js
// classes de erro customizadas
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
```

### 7.2 Conventions

**Bom:**
```js
async function processPayment(tenantId, amount) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new NotFoundError(`Tenant not found: ${tenantId}`);
  }
  if (amount <= 0) {
    throw new ValidationError(`Invalid amount: ${amount}`);
  }
  // ...
}

// Global error handler (Express)
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  logger.error({ err, path: req.path }, err.message);
  // Contrato fixo: { success, error } — nunca expor stack trace ao cliente
  res.status(status).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message,
  });
});
```

**Mau:**
```js
async function processPayment(tenantId, amount) {
  try {
    const tenant = await Tenant.findById(tenantId);
    // continua mesmo se tenant for null
    const result = await charge(tenant.stripeId, amount);
  } catch (e) {
    console.log(e); // engole erro sem propagar
  }
}
```

### 7.3 Best Practices
- Nunca ignorar erros em `catch` silenciosamente
- Adicionar contexto: IDs, valores, operação que falhou
- Erros de domínio com `statusCode` para facilitar respostas HTTP
- Logar erros apenas nas fronteiras de I/O (controllers, não em services)
- Usar `process.on('unhandledRejection')` para capturar Promises não tratadas

```js
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason }, 'Unhandled promise rejection — shutting down');
  process.exit(1);
});
```

---

## 8. Concurrency and Parallelism

### 8.1 Concurrency Model
JavaScript usa um único thread com Event Loop. Concorrência é obtida via `async`/`await` e Promises — operações I/O são não-bloqueantes; CPU-intensive deve ser delegado a `worker_threads`.

```js
// Execução sequencial (lenta)
const user = await User.findById(id);
const orders = await Order.find({ userId: id });

// Execução paralela (rápida)
const [user, orders] = await Promise.all([
  User.findById(id),
  Order.find({ userId: id }),
]);

// Promise.allSettled — quando falhas parciais são aceitáveis
const results = await Promise.allSettled([
  sendEmail(user.email),
  sendPush(user.deviceToken),
]);
results.forEach((r) => {
  if (r.status === 'rejected') logger.warn({ reason: r.reason }, 'Notification failed');
});
```

### 8.2 Timeouts e Cancellation
```js
// Timeout com AbortController (Node.js 18+)
async function fetchWithTimeout(url, ms = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

### 8.3 Common Pitfalls
```js
// Mau: await dentro de loop (sequencial)
for (const id of ids) {
  await processItem(id); // processa um de cada vez
}

// Bom: paralelo com limite de concorrência
import pLimit from 'p-limit';
const limit = pLimit(5); // máximo 5 simultâneos
await Promise.all(ids.map((id) => limit(() => processItem(id))));

// Mau: não aguardar Promise em event handler
emitter.on('data', async (data) => {
  await save(data); // erro não capturado
});

// Bom: capturar erros em handlers assíncronos
emitter.on('data', (data) => {
  save(data).catch((err) => logger.error({ err }, 'Save failed'));
});
```

---

## 9. Unit Tests

### 9.1 Structure
```js
// tests/unit/user-service.test.js
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UserService } from '../../src/services/user-service.js';

describe('UserService', () => {
  let service;

  beforeEach(() => {
    service = new UserService();
  });

  describe('getUserById', () => {
    it('returns user when found', async () => {
      // arrange
      const mockUser = { id: '1', name: 'André' };
      jest.spyOn(service.repo, 'findById').mockResolvedValue(mockUser);

      // act
      const result = await service.getUserById('1');

      // assert
      expect(result).toEqual(mockUser);
    });

    it('throws NotFoundError when user does not exist', async () => {
      jest.spyOn(service.repo, 'findById').mockResolvedValue(null);
      await expect(service.getUserById('999')).rejects.toThrow('User not found: 999');
    });
  });
});
```

### 9.2 Table-Driven Tests
```js
describe('validateAmount', () => {
  const cases = [
    { input: 100,  expected: true,  label: 'valid positive amount' },
    { input: 0,    expected: false, label: 'zero is invalid' },
    { input: -50,  expected: false, label: 'negative is invalid' },
    { input: null, expected: false, label: 'null is invalid' },
  ];

  it.each(cases)('$label', ({ input, expected }) => {
    expect(validateAmount(input)).toBe(expected);
  });
});
```

### 9.3 Assertions
```js
expect(value).toBe(42);                      // igualdade primitiva
expect(obj).toEqual({ name: 'André' });       // igualdade profunda
expect(arr).toHaveLength(3);
expect(fn).toThrow('error message');
expect(asyncFn).rejects.toThrow(NotFoundError);
expect(mock).toHaveBeenCalledWith('arg1');
expect(mock).toHaveBeenCalledTimes(1);
```

### 9.4 Commands
```bash
npm test                               # todos os testes
npm test -- --testPathPattern=user     # testes de um ficheiro
npm test -- --coverage                 # com cobertura
npm test -- --verbose                  # output detalhado
npm test -- --watch                    # modo watch
npm test -- --testNamePattern="login"  # por nome de teste
```

---

## 10. Mocks and Testability

### 10.1 Mock Strategies
```js
// jest.fn() — mock de função simples
const mockSend = jest.fn().mockResolvedValue({ messageId: 'abc' });

// jest.spyOn() — espiar método real
jest.spyOn(console, 'error').mockImplementation(() => {});

// jest.mock() — mock de módulo inteiro
jest.mock('../../src/services/email-service.js', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));
```

### 10.2 Dependency Injection para Testabilidade
```js
// Estruturar com injeção em vez de imports diretos
export class AppointmentService {
  constructor({ appointmentRepo, notificationService }) {
    this.appointmentRepo = appointmentRepo;
    this.notificationService = notificationService;
  }

  async create(data) {
    const appt = await this.appointmentRepo.create(data);
    await this.notificationService.send(appt);
    return appt;
  }
}

// No teste: injectar dependências falsas
const service = new AppointmentService({
  appointmentRepo: { create: jest.fn().mockResolvedValue(mockAppt) },
  notificationService: { send: jest.fn() },
});
```

### 10.3 Limpar Mocks
```js
afterEach(() => {
  jest.clearAllMocks();  // limpa calls e instances
});

afterAll(() => {
  jest.restoreAllMocks(); // restaura implementações originais
});
```

---

## 11. Integration Tests

### 11.1 Structure and Organization
```js
// jest.config.js
export default {
  projects: [
    { displayName: 'unit',        testMatch: ['**/tests/unit/**/*.test.js'] },
    { displayName: 'integration', testMatch: ['**/tests/integration/**/*.test.js'] },
  ],
};
```

```js
// tests/integration/auth.test.js
import request from 'supertest';
import { app } from '../../src/app.js';
import { connectTestDB, disconnectTestDB } from '../setup.js';

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());

describe('POST /api/auth/login', () => {
  it('returns 200 and token on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'secret' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });
});
```

### 11.2 Selective Execution
```bash
npm test -- --selectProjects unit         # só unit tests
npm test -- --selectProjects integration  # só integration tests
NODE_ENV=test npm test                    # com env de test
```

### 11.3 Real Dependencies com mongodb-memory-server
```js
// tests/setup.js
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer;

export async function connectTestDB() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

export async function disconnectTestDB() {
  await mongoose.disconnect();
  await mongoServer.stop();
}
```

---

## 12. Load and Stress Tests

### 12.1 Tools
| Tool | Use Case | Install |
|------|----------|---------|
| Artillery | HTTP load testing | `npm install -g artillery` |
| k6 | Scripted load tests | `brew install k6` |
| autocannon | Quick Node.js benchmarks | `npm install -g autocannon` |

### 12.2 Artillery Config
```yaml
# artillery.yml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Load"

scenarios:
  - name: "Create appointment"
    flow:
      - post:
          url: "/api/agendamentos"
          json:
            clientId: "{{ $randomString() }}"
            date: "2026-05-01"
```

```bash
artillery run artillery.yml
artillery run --output results.json artillery.yml
artillery report results.json
```

### 12.3 Quick Benchmark
```bash
autocannon -c 10 -d 30 http://localhost:3000/api/health
# -c: connections simultâneas
# -d: duração em segundos
```

---

## 13. Profiling and Diagnostics

### 13.1 CPU e Memory Profiling
```bash
# CPU profile com Node.js built-in
node --prof src/server.js
node --prof-process isolate-*.log > profile.txt

# clinic.js — profiling visual
npm install -g clinic
clinic doctor -- node src/server.js
clinic flame -- node src/server.js  # flamegraph
```

### 13.2 Memory Leaks
```bash
# Heap snapshot via Chrome DevTools
node --inspect src/server.js
# Abrir chrome://inspect no Chrome

# Verificar memory ao longo do tempo
node --expose-gc src/server.js
# Chamar global.gc() em intervalos e monitorar process.memoryUsage()
```

### 13.3 Análise de Performance
```js
// Instrumentação básica
const start = performance.now();
await heavyOperation();
const ms = performance.now() - start;
logger.info({ durationMs: ms }, 'heavyOperation completed');
```

---

## 14. Benchmarks

### 14.1 Benchmark com benchmark.js
```bash
npm install --save-dev benchmark
```

```js
// benchmarks/string-concat.bench.js
import Benchmark from 'benchmark';

const suite = new Benchmark.Suite();

suite
  .add('Array join', () => {
    const parts = ['Hello', ' ', 'World'];
    parts.join('');
  })
  .add('Template literal', () => {
    const a = 'Hello', b = 'World';
    `${a} ${b}`;
  })
  .on('cycle', (event) => console.log(String(event.target)))
  .on('complete', function () {
    console.log('Fastest: ' + this.filter('fastest').map('name'));
  })
  .run();
```

```bash
node benchmarks/string-concat.bench.js
```

### 14.2 Micro-benchmarks com `performance.timerify`
```js
import { performance, PerformanceObserver } from 'node:perf_hooks';

const obs = new PerformanceObserver((list) => {
  list.getEntries().forEach((e) => console.log(e.name, e.duration));
});
obs.observe({ entryTypes: ['function'] });

const wrapped = performance.timerify(myFunction);
wrapped('arg');
```

---

## 15. Optimization

### 15.1 Principles
Medir antes de otimizar. Usar `performance.now()` ou `clinic.js` para identificar gargalos reais.

```js
// Mau: otimizar sem medir
// Bom: instrumentar primeiro
const t0 = performance.now();
const result = await expensiveQuery();
logger.debug({ durationMs: performance.now() - t0 }, 'expensiveQuery');
```

### 15.2 Common Optimizations
```js
// Cache de resultados frequentes (in-memory)
const cache = new Map();
async function getCachedUser(id) {
  if (cache.has(id)) return cache.get(id);
  const user = await User.findById(id);
  cache.set(id, user);
  return user;
}

// Lazy loading de módulos pesados
async function generateReport() {
  const { default: PDFKit } = await import('pdfkit');
  // só carrega quando necessário
}

// Evitar serialização desnecessária
// Mau: JSON.parse(JSON.stringify(obj)) para clonar
// Bom: structuredClone(obj) — nativo no Node 17+
const copy = structuredClone(original);
```

### 15.3 Event Loop
```js
// Operações CPU-intensas bloqueiam o Event Loop
// Delegar a worker_threads
import { Worker } from 'node:worker_threads';

function runInWorker(script, data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(script, { workerData: data });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}
```

---

## 16. Security

### 16.1 Essential Practices
- Nunca hardcodar secrets — usar variáveis de ambiente
- Validar e sanitizar todo input externo
- Usar HTTPS em produção (HSTS)
- Rate limiting em rotas públicas
- Atualizar dependências regularmente (`npm audit`)
- Princípio do menor privilégio para credenciais de banco

```js
// Nunca fazer isto
const query = `SELECT * FROM users WHERE id = ${req.params.id}`; // SQL injection

// Sempre usar queries parametrizadas ou ODM com sanitização
const user = await User.findById(req.params.id); // Mongoose sanitiza automaticamente
```

### 16.2 Tools
```bash
npm audit                  # vulnerabilidades conhecidas
npm audit fix              # corrigir automaticamente
npx snyk test              # análise avançada (Snyk)
npx retire                 # verificar bibliotecas obsoletas
```

### 16.3 Security at API Boundaries
```js
// Validar input antes de processar
import Joi from 'joi';

const schema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

const { error, value } = schema.validate(req.body);
if (error) throw new ValidationError(error.details[0].message);

// Sanitizar output — nunca expor campos sensíveis
const safeUser = { id: user.id, name: user.name, email: user.email };
// Não: res.json(user) — pode expor passwordHash, tokens, etc.
res.json(safeUser);
```

---

## 17. Code Patterns

### 17.1 Early Return
```js
// Mau: nesting profundo
async function processOrder(order) {
  if (order) {
    if (order.status === 'pending') {
      if (order.items.length > 0) {
        await charge(order);
      }
    }
  }
}

// Bom: early return
async function processOrder(order) {
  if (!order) throw new ValidationError('Order required');
  if (order.status !== 'pending') return;
  if (order.items.length === 0) return;
  await charge(order);
}
```

### 17.2 Separation of Concerns
```js
// Mau: lógica de negócio no controller
app.post('/api/appointments', async (req, res) => {
  const conflict = await Appointment.findOne({ date: req.body.date });
  if (conflict) return res.status(409).json({ success: false, error: 'Conflict' });
  const appt = await Appointment.create(req.body);
  await sendWhatsAppConfirmation(appt);
  res.json(appt);
});

// Bom: controller delega para service
app.post('/api/appointments', async (req, res, next) => {
  try {
    const appt = await appointmentService.create(req.body);
    res.json(appt);
  } catch (err) {
    next(err);
  }
});
```

### 17.3 DRY e Variable Scope
```js
// Extrair duplicação para utilitários
const paginate = (query, { page = 1, limit = 20 }) =>
  query.skip((page - 1) * limit).limit(limit);

// Minimizar escopo de variáveis
// Mau: declarar fora do bloco necessário
let result;
if (condition) { result = await fetch(); }

// Bom: declarar no escopo mínimo
const result = condition ? await fetch() : null;
```

---

## 18. Dependency Management

### 18.1 Principles
- Standard library primeiro: Node.js tem `fetch`, `crypto`, `path`, `fs/promises`
- Preferir dependências bem mantidas com histórico ativo
- Minimizar dependências: cada pacote é superfície de ataque
- Fixar versões com `package-lock.json` em produção

### 18.2 Commands
```bash
npm outdated                    # listar desatualizados
npm update                      # atualizar dentro do semver
npx npm-check-updates           # ver todas as atualizações disponíveis
npx npm-check-updates -u        # aplicar todas
npm audit                       # vulnerabilidades
npm audit fix --force           # forçar correção (testar depois)
npm prune                       # remover pacotes não usados
npm dedupe                      # deduplicar dependências
```

---

## 19. Comments and Documentation

### 19.1 Code Comments
```js
// Mau: comentar o óbvio
// Incrementa i
i++;

// Bom: comentar o porquê
// Rate limit é 5/15min por IP — ver ADR-004 para contexto de segurança
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

// Documentar decisões não-óbvias
// useDb() em vez de conexões separadas para reutilizar o connection pool
// Ver docs/adrs/generated/ADR-001 para contexto completo
const db = mongoose.connection.useDb(tenantId, { useCache: true });
```

### 19.2 JSDoc para APIs Públicas
```js
/**
 * Cria um agendamento e envia confirmação via WhatsApp.
 * @param {Object} data - Dados do agendamento
 * @param {string} data.clientId - ID do cliente
 * @param {Date}   data.date - Data e hora do agendamento
 * @param {string} data.serviceId - ID do serviço
 * @returns {Promise<Appointment>} Agendamento criado
 * @throws {NotFoundError} Se cliente ou serviço não existir
 * @throws {ConflictError} Se horário já estiver ocupado
 */
export async function createAppointment(data) { ... }
```

### 19.3 Module Documentation
```js
/**
 * @module appointment-service
 * @description Business logic for appointment lifecycle management.
 * Depends on: appointment-repo, notification-service, whatsapp-service.
 * Does NOT handle HTTP concerns — see controllers/appointment.js.
 */
```

---

## 20. Database

### 20.1 Approach
Node.js suporta três abordagens:
- **ODM** (Mongoose): schema + validação + middleware — ideal para MongoDB
- **Query Builder** (Knex): flexibilidade com SQL sem ORM pesado
- **Raw Driver** (pg, mongodb): máximo controlo, mais verboso

### 20.2 Connection and Driver
```js
// Conexão MongoDB com driver nativo
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGO_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

let db;

export async function connectDB() {
  await client.connect();
  db = client.db(process.env.DB_NAME);
  return db;
}

export async function disconnectDB() {
  await client.close();
}

// Query com parâmetros seguros — nunca concatenar strings
const userId = req.params.id;
const user = await db.collection('users').findOne(
  { _id: new ObjectId(userId) },   // ObjectId valida o formato
  { projection: { passwordHash: 0 } } // excluir campos sensíveis
);
```

### 20.3 Migrations
MongoDB/Mongoose não tem migrations nativas. Padrões comuns:
- **migrate-mongo**: framework de migrations por ficheiro versionado
- **Scripts ad-hoc**: em `scripts/maintenance/` — documentar e registar execução
- **On-the-fly**: defaults em schema Mongoose para campos novos

```bash
# migrate-mongo
npm install migrate-mongo
npx migrate-mongo init
npx migrate-mongo create add-etapa-conversa-to-clientes
npx migrate-mongo up      # aplicar migrations pendentes
npx migrate-mongo status  # ver estado
```

### 20.4 Best Practices
- Queries parametrizadas/sanitizadas — nunca interpolação de strings
- Índices para campos usados em `find`, `sort`, `where` frequentes
- Connection pooling — não criar nova conexão por request
- Fechar conexão gracefully no `SIGTERM`
- Timeout explícito em operações longas

```js
// Graceful shutdown
process.on('SIGTERM', async () => {
  await disconnectDB();
  process.exit(0);
});
```

---

## 21. Logs and Observability

### 21.1 Log Levels
| Level | Quando usar |
|-------|-------------|
| `fatal` | Processo vai terminar |
| `error` | Erro recuperável, operação falhou |
| `warn` | Situação anormal mas operação continuou |
| `info` | Eventos de negócio importantes (login, pagamento) |
| `debug` | Detalhe para debugging (só em desenvolvimento) |
| `trace` | Máximo detalhe (raramente em produção) |

### 21.2 Structured Logs
```js
// Configuração com console nativo (stdlib)
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const levels = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };
const currentLevel = levels[LOG_LEVEL];

function log(level, obj, msg) {
  if (levels[level] > currentLevel) return;
  const entry = {
    level,
    time: new Date().toISOString(),
    ...(typeof obj === 'string' ? { msg: obj } : { ...obj, msg }),
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  fatal: (obj, msg) => log('fatal', obj, msg),
  error: (obj, msg) => log('error', obj, msg),
  warn:  (obj, msg) => log('warn',  obj, msg),
  info:  (obj, msg) => log('info',  obj, msg),
  debug: (obj, msg) => log('debug', obj, msg),
};
```

### 21.3 Logging com Contexto
```js
// Adicionar contexto a cada log
logger.info({ userId, tenantId, action: 'appointment.created' }, 'Appointment created');
logger.error({ err, appointmentId }, 'Failed to send WhatsApp confirmation');

// Request ID em cada request (middleware)
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  req.log = logger.child({ requestId: req.requestId, path: req.path });
  next();
});

// Usar no controller
req.log.info({ clientId }, 'Processing appointment');
```

### 21.4 Metrics and Observability
```js
// Health endpoint obrigatório
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});

// Medir latência de operações críticas
async function withMetrics(name, fn) {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    logger.debug({ operation: name, durationMs: performance.now() - start }, 'Operation completed');
  }
}

const result = await withMetrics('db.findUser', () => User.findById(id));
```

---

## 22. Golden Rules

1. **Simplicidade**: código simples é mais fácil de testar, debugar e manter — resistir à tentação de abstrações prematuras
2. **Erros explícitos**: nunca engolir erros; sempre propagar com contexto ou logar na fronteira de I/O
3. **Testes primeiro**: se é difícil de testar, o design está errado — refatorar para injectabilidade
4. **Async correto**: preferir `Promise.all` para operações paralelas; nunca `await` dentro de `forEach`
5. **Performance medida**: `performance.now()` e `clinic.js` antes de qualquer otimização
6. **Dependências mínimas**: cada `npm install` é responsabilidade — avaliar tamanho, manutenção e segurança
7. **Segredos no ambiente**: nunca em código, nunca em git — `.env` no `.gitignore`, `.env.example` documentado

---

## 23. Pre-Commit Checklist

### Code
- [ ] `npx prettier --check .` sem erros
- [ ] `npx eslint src/` sem erros críticos
- [ ] `node src/server.js` inicia sem erros
- [ ] Sem `console.log` de debug esquecidos

### Tests
- [ ] `npm test` — todos os testes passam
- [ ] Cobertura >= 70% em código crítico (`npm test -- --coverage`)
- [ ] Testes de integração executados
- [ ] Novos endpoints têm pelo menos 1 teste de integração

### Quality
- [ ] Erros tratados explicitamente (sem `catch` vazio)
- [ ] Recursos fechados (conexões, streams, timers)
- [ ] Sem secrets hardcoded
- [ ] `npm audit` — sem vulnerabilidades críticas
- [ ] Variáveis de ambiente novas documentadas no `.env.example`

### Documentation
- [ ] Funções públicas com JSDoc
- [ ] README atualizado se API mudou
- [ ] Decisões não-óbvias comentadas com contexto (referência a ADR se aplicável)

### Docker (se aplicável)
- [ ] `docker compose build` sem erros
- [ ] `docker compose up` — aplicação inicia
- [ ] `docker compose exec app npm test` — testes passam no container

---

## 24. References

### Official Documentation
- Node.js Docs: https://nodejs.org/en/docs
- MDN JavaScript: https://developer.mozilla.org/en-US/docs/Web/JavaScript
- ECMAScript Spec: https://tc39.es/ecma262/
- Node.js Best Practices: https://github.com/goldbergyoni/nodebestpractices

### Style Guides
- Airbnb JavaScript Style Guide: https://github.com/airbnb/javascript
- Google JavaScript Style Guide: https://google.github.io/styleguide/jsguide.html
- ESLint Rules: https://eslint.org/docs/rules/

### Essential Tools
- npm: https://docs.npmjs.com
- Prettier: https://prettier.io/docs/en/
- ESLint: https://eslint.org/docs/user-guide/
- Jest: https://jestjs.io/docs/getting-started

### Testing and Performance
- Supertest: https://github.com/ladjs/supertest
- mongodb-memory-server: https://github.com/nodkz/mongodb-memory-server
- Artillery: https://www.artillery.io/docs
- clinic.js: https://clinicjs.org

### Community
- Node.js Discussions: https://github.com/nodejs/node/discussions
- Awesome Node.js: https://github.com/sindresorhus/awesome-nodejs
- Node Weekly: https://nodeweekly.com
