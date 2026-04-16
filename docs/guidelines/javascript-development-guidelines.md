# JavaScript Development Guidelines

## Project Stack

**Auto-Populated Essential Tools**:
- **Testing**: Jest (v29.7) - JavaScript testing framework with built-in mocking and coverage - https://jestjs.io
- **Formatting**: Prettier (v3.2) - Opinionated code formatter with zero config - https://prettier.io
- **Linting**: ESLint (v9.x) - Pluggable JavaScript linter - https://eslint.org
- **Logging**: pino (v9.x) - Very low overhead Node.js logger - https://getpino.io
- **Build Tool**: npm (v10) - Node.js package manager, bundled with Node.js

> **Note**: All code examples in this guideline use standard JavaScript or Node.js built-in features.
> Principles apply regardless of framework or library choices.

---

## 1. Core Principles

### 1.1 Philosophy and Style
- Use `strict mode` implicitly via ES Modules (`import`/`export`)
- Prefer `const` over `let`; never use `var`
- Enforce style automatically with ESLint + Prettier — no manual debates
- Prefer async/await over raw Promises; Promises over callbacks

### 1.2 Clarity over Brevity
- Names communicate intent: `getUserById` not `getU` or `fetch`
- Avoid one-letter variables outside of loop counters
- Self-documenting code reduces comment noise
- No clever hacks: prefer obvious over smart

### 1.3 Toolchain Setup
```bash
# Prettier
npm install --save-dev prettier
echo '{ "singleQuote": true, "semi": true, "printWidth": 100 }' > .prettierrc

# ESLint (v9 flat config)
npm install --save-dev eslint @eslint/js
cat > eslint.config.js << 'EOF'
import js from '@eslint/js';
export default [
  js.configs.recommended,
  { rules: { 'no-unused-vars': 'error', 'no-console': 'warn' } },
];
EOF
```

---

## 2. Project Initialization

### 2.1 Creating New Project
```bash
mkdir my-project && cd my-project
npm init -y
npm pkg set type="module"          # enable ES Modules
npm pkg set engines.node=">=20"    # enforce minimum Node.js version
```

### 2.2 Dependency Management
```bash
npm install <package>              # runtime dependency
npm install --save-dev <package>   # dev-only dependency
npm uninstall <package>            # remove package
npm update                         # update within current semver ranges
npm outdated                       # list packages with newer versions
npm audit                          # check known vulnerabilities
npm audit fix                      # auto-fix safe patches
npm ci                             # clean install from lock file (use in CI)
```

---

## 3. Project Structure

```
my-project/
├── src/
│   ├── index.js            # Application entry point
│   ├── routes/             # HTTP route definitions
│   ├── controllers/        # Request/response handling
│   ├── services/           # Business logic (pure, testable)
│   ├── models/             # Data models / DB schemas
│   ├── middlewares/        # HTTP middleware functions
│   ├── utils/              # Pure helper functions without side effects
│   └── config/             # Environment and app configuration
├── tests/
│   ├── unit/               # Unit tests (mirror src/ structure)
│   └── integration/        # Integration tests against real services
├── .env.example            # Environment variable template (committed)
├── .env                    # Actual secrets (gitignored)
├── eslint.config.js
├── .prettierrc
├── jest.config.js
├── package.json
└── README.md
```

---

## 4. Container Development (Docker)

### 4.1 Container Philosophy
Every Node.js project should run in Docker to guarantee a consistent Node.js version
and OS environment across all developers and CI pipelines.

### 4.2 Dockerfile (Development)
```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

CMD ["sleep", "infinity"]
```

### 4.3 docker-compose.yaml
```yaml
services:
  app:
    build: .
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: appdb
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: apppass
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser"]
      interval: 5s
      retries: 5
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### 4.4 .dockerignore
```
node_modules
.git
.env
*.log
coverage/
dist/
```

### 4.5 Essential Commands

| Action | Command |
|--------|---------|
| Start environment | `docker compose up -d` |
| View logs | `docker compose logs -f app` |
| Run application | `docker compose exec app node src/index.js` |
| Run tests | `docker compose exec app npm test` |
| Interactive shell | `docker compose exec app sh` |
| Stop environment | `docker compose down` |
| Rebuild image | `docker compose build --no-cache` |

### 4.6 Best Practices
- Pin the Node.js version (`node:22-alpine`, never `node:latest`)
- Mount `node_modules` as an anonymous volume to prevent host/container conflicts
- Use `env_file` in compose — never hardcode env vars directly
- Use `npm ci` inside containers, not `npm install`

---

## 5. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | `kebab-case` | `user-service.js`, `auth-middleware.js` |
| Variables | `camelCase` | `userId`, `maxRetries` |
| Functions | `camelCase` | `getUserById`, `formatDate` |
| Classes | `PascalCase` | `UserRepository`, `HttpClient` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_RETRIES`, `DB_TIMEOUT_MS` |
| Modules/dirs | `kebab-case` | `user-service/`, `rate-limiter.js` |
| Booleans | `is/has/can` prefix | `isActive`, `hasPermission`, `canEdit` |
| Event handlers | `on` prefix | `onUserCreated`, `onError` |

```javascript
// Good
const MAX_RETRIES = 3;
const isUserActive = user.status === 'active';
function calculateTotalPrice(items) { /* ... */ }
class OrderService { /* ... */ }

// Bad
const x = 3;
const active = user.status === 'active';
function calc(i) { /* ... */ }
class orderservice { /* ... */ }
```

---

## 6. Functions and Methods

### 6.1 Signatures
```javascript
// Named arrow functions for short, pure operations
const formatCurrency = (amount, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

// Named function declarations for complex logic (better stack traces)
async function createUser(name, email, options = {}) {
  const { role = 'user', sendWelcome = true } = options;
  // ...
}

// Destructure when params exceed 3
async function sendEmail({ to, subject, body, attachments = [] }) {
  // ...
}
```

### 6.2 Returns and Errors

```javascript
// Good — explicit return, no hidden side effects, parameterized query
async function findUser(id) {
  if (!id) throw new Error('findUser: id is required');
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// Bad — SQL injection, silent null on failure, no input check
async function findUser(id) {
  const user = await db.query('SELECT * FROM users WHERE id = ' + id);
  return user;
}
```

### 6.3 Best Practices
- One function, one responsibility
- Max 3-4 parameters; use an options object for more
- Functions that modify external state should be clearly named (`updateUser`, not `getUser`)
- Use default parameters instead of `if (!param) param = defaultValue`
- Prefer early returns to reduce nesting

---

## 7. Error Handling

### 7.1 Philosophy
JavaScript uses exceptions and rejected Promises. In async code, always use
try/catch with async/await. Create custom Error subclasses for domain errors.

```javascript
// Custom error hierarchy
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(resource, id) {
    super(`${resource} with id '${id}' not found`, 404, 'NOT_FOUND');
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
```

### 7.2 Conventions

```javascript
// Good — contextual, rethrows known errors, wraps unknowns
async function getOrder(orderId) {
  try {
    const order = await db.findOrder(orderId);
    if (!order) throw new NotFoundError('Order', orderId);
    return order;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(`getOrder failed: ${err.message}`);
  }
}

// Bad — silent failure, caller never knows what happened
async function getOrder(orderId) {
  try {
    return await db.findOrder(orderId);
  } catch (e) {
    return null;
  }
}
```

### 7.3 Best Practices
- Never use empty catch blocks
- Wrap third-party errors with context (operation name, relevant IDs)
- Handle unhandled rejections globally:
```javascript
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled Promise rejection — shutting down');
  process.exit(1);
});
```
- Log errors once at the I/O boundary — not in every layer of the call stack

---

## 8. Concurrency and Parallelism

### 8.1 Concurrency Model
Node.js runs JavaScript on a single thread via an event loop. I/O is non-blocking.
CPU-intensive tasks must be offloaded to Worker Threads to avoid blocking the event loop.

```javascript
// Run independent async operations in parallel
const [user, orders] = await Promise.all([
  userService.findById(userId),
  orderService.findByUser(userId),
]);

// Controlled concurrency — limit to N simultaneous operations
import pLimit from 'p-limit';
const limit = pLimit(5);
const results = await Promise.all(
  ids.map((id) => limit(() => processItem(id)))
);
```

### 8.2 Worker Threads for CPU-Bound Work
```javascript
// main.js
import { Worker } from 'worker_threads';

function runWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { workerData: data });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}

// worker.js
import { workerData, parentPort } from 'worker_threads';
const result = heavyComputation(workerData);
parentPort.postMessage(result);
```

### 8.3 Best Practices
- Use `Promise.all` for parallel I/O; never `await` inside a `for` loop
- Use `Promise.allSettled` when partial failure is acceptable
- Add timeouts to all async operations using `AbortController`
- Offload CPU work (hashing, image processing, large JSON parsing) to Worker Threads
- Drain in-flight requests before shutting down (`SIGTERM` handler)

### 8.4 Common Pitfalls
```javascript
// Bad — sequential when parallel is possible
for (const id of ids) {
  await processItem(id); // one full round-trip per item
}

// Good — parallel
await Promise.all(ids.map((id) => processItem(id)));

// Bad — fire-and-forget drops errors silently
function doWork() {
  saveToDb(data); // unhandled rejection if this fails
}

// Good
async function doWork() {
  await saveToDb(data);
}
```

---

## 9. Unit Tests

### 9.1 Structure
```javascript
// tests/unit/services/user-service.test.js
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createUser } from '../../../src/services/user-service.js';

describe('createUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns created user with generated id', async () => {
    const user = await createUser({ name: 'Alice', email: 'alice@example.com' });
    expect(user).toMatchObject({ name: 'Alice', email: 'alice@example.com' });
    expect(user.id).toBeDefined();
  });

  it('throws ValidationError when email is missing', async () => {
    await expect(createUser({ name: 'Alice' })).rejects.toThrow('email is required');
  });
});
```

### 9.2 Table-Driven Tests
```javascript
describe('formatCurrency', () => {
  it.each([
    [1000,  'USD', '$1,000.00'],
    [0,     'USD', '$0.00'],
    [-50,   'EUR', '-€50.00'],
  ])('formats %d %s as %s', (amount, currency, expected) => {
    expect(formatCurrency(amount, currency)).toBe(expected);
  });
});
```

### 9.3 Assertions
```javascript
expect(value).toBe(42);                          // strict equality (===)
expect(value).toEqual({ id: 1, name: 'Alice' }); // deep equality
expect(arr).toHaveLength(3);
expect(fn).toThrow('error message');
expect(asyncFn()).rejects.toThrow(NotFoundError);
expect(obj).toMatchObject({ name: 'Alice' });    // partial match
expect(spy).toHaveBeenCalledWith('expected-arg');
expect(spy).toHaveBeenCalledTimes(1);
```

### 9.4 Commands
```bash
npm test                                        # run all tests
npm test -- --testPathPattern=user-service      # run by file pattern
npm test -- --coverage                          # run with coverage report
npm test -- --verbose                           # detailed test output
npm test -- --watch                             # watch mode for TDD
npm test -- --testNamePattern="creates user"    # run by test name
```

---

## 10. Mocks and Testability

### 10.1 Mock Strategies
```javascript
// Module mock — replace entire module
jest.mock('../../../src/db/client.js', () => ({
  query: jest.fn(),
}));

// Spy — wrap real implementation, track calls
import * as mailer from '../../../src/services/mailer.js';
jest.spyOn(mailer, 'sendEmail').mockResolvedValue({ messageId: 'test-id' });

// Cleanup between tests
afterEach(() => jest.clearAllMocks());
```

### 10.2 Dependency Injection for Testability
```javascript
// Hard to test — direct import couples to real dependency
import db from '../db/client.js';
export async function getUser(id) {
  return db.query('SELECT * FROM users WHERE id = $1', [id]);
}

// Testable — inject dependency through factory
export function createUserService({ db }) {
  return {
    async getUser(id) {
      const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
      return rows[0] ?? null;
    },
  };
}
// In tests: createUserService({ db: { query: jest.fn().mockResolvedValue({ rows: [] }) } })
```

### 10.3 Test Doubles
```javascript
// Stub — fixed, predictable return value
const dbStub = { query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) };

// Fake — lightweight working in-memory implementation
const fakeCache = new Map();
const cacheService = {
  get: (key) => fakeCache.get(key) ?? null,
  set: (key, val) => fakeCache.set(key, val),
};

// Spy — capture calls without altering behavior
const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
```

---

## 11. Integration Tests

### 11.1 Structure and Organization
```javascript
// tests/integration/user-api.test.js
describe('[integration] POST /api/users', () => {
  let server;
  beforeAll(async () => { server = await startTestServer(); });
  afterAll(async () => { await server.close(); });
  beforeEach(async () => { await db.query('DELETE FROM users'); });

  it('creates a user and returns 201', async () => {
    const res = await fetch('http://localhost:3001/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', email: 'alice@test.com' }),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ name: 'Alice' });
  });
});
```

### 11.2 Selective Execution
```javascript
// jest.config.js
export default {
  projects: [
    { displayName: 'unit',        testMatch: ['**/tests/unit/**/*.test.js'] },
    { displayName: 'integration', testMatch: ['**/tests/integration/**/*.test.js'] },
  ],
};
```
```bash
npx jest --selectProjects unit          # unit tests only
npx jest --selectProjects integration   # integration tests only
```

### 11.3 Real Dependencies with Testcontainers
```bash
npm install --save-dev @testcontainers/postgresql
```
```javascript
import { PostgreSqlContainer } from '@testcontainers/postgresql';

let container;
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  process.env.DATABASE_URL = container.getConnectionUri();
  await runMigrations();
}, 30_000);

afterAll(() => container.stop());
```

---

## 12. Load and Stress Tests

### 12.1 Tools
- **k6** — scriptable load testing (JavaScript syntax, runs as standalone binary)
- **autocannon** — HTTP/1.1 benchmarking tool built for Node.js
- **artillery** — YAML/JS-defined scenarios, supports HTTP and WebSockets

```bash
npm install -g autocannon
autocannon -c 100 -d 30 http://localhost:3000/api/users
```

### 12.2 k6 Load Script
```javascript
// load-tests/users.js — runs with k6 binary, not Node.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m',  target: 100 },
    { duration: '20s', target: 0 },
  ],
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500'] },
};

export default function () {
  const res = http.get('http://localhost:3000/api/users');
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
```
```bash
k6 run load-tests/users.js
```

### 12.3 Concurrency Tests
```javascript
it('handles 50 concurrent requests without data corruption', async () => {
  const requests = Array.from({ length: 50 }, (_, i) =>
    createUser({ name: `User${i}`, email: `user${i}@test.com` })
  );
  const results = await Promise.allSettled(requests);
  const failures = results.filter((r) => r.status === 'rejected');
  expect(failures).toHaveLength(0);
});
```

---

## 13. Profiling and Diagnostics

### 13.1 CPU and Memory Profiling
```bash
# Built-in CPU profiler
node --prof src/index.js
node --prof-process isolate-*.log > profile.txt

# clinic.js — visual profiling suite
npm install -g clinic
clinic doctor -- node src/index.js      # event loop lag diagnosis
clinic flame -- node src/index.js       # CPU flame graph
clinic heapprofiler -- node src/index.js  # memory allocation tracking
```

### 13.2 Diagnostic Tools
```bash
# Chrome DevTools inspector
node --inspect src/index.js
# Open chrome://inspect in Chrome browser

# Heap snapshot for memory leak investigation
node --expose-gc --inspect src/index.js

# Flamegraph profiler
npm install -g 0x
0x -- node src/index.js
```

### 13.3 Performance Measurement
```javascript
import { performance, PerformanceObserver } from 'perf_hooks';

const obs = new PerformanceObserver((list) => {
  list.getEntries().forEach((e) => console.log(`${e.name}: ${e.duration.toFixed(2)}ms`));
});
obs.observe({ entryTypes: ['measure'] });

performance.mark('op:start');
await heavyOperation();
performance.mark('op:end');
performance.measure('heavyOperation', 'op:start', 'op:end');
```

---

## 14. Benchmarks

### 14.1 Writing Benchmarks
```javascript
import { performance } from 'perf_hooks';

function benchmark(name, fn, iterations = 10_000) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  console.log(`${name}: ${(elapsed / iterations).toFixed(4)}ms/op`);
}

benchmark('JSON.parse small', () => JSON.parse('{"id":1,"name":"Alice"}'));
benchmark('Object spread',    () => ({ ...baseObj, extra: true }));
```

### 14.2 Structured Benchmarks with tinybench
```bash
npm install --save-dev tinybench
```
```javascript
import { Bench } from 'tinybench';
const bench = new Bench({ time: 1000 });

bench
  .add('Array.push loop', () => {
    const arr = [];
    for (let i = 0; i < 100; i++) arr.push(i);
  })
  .add('Array.from', () => Array.from({ length: 100 }, (_, i) => i));

await bench.run();
console.table(bench.table());
```

### 14.3 Execution and Comparison
```bash
node benchmarks/string-ops.js

# Compare across Node.js versions with nvm
nvm use 20 && node benchmarks/string-ops.js
nvm use 22 && node benchmarks/string-ops.js
```

---

## 15. Optimization

### 15.1 Principles
- Profile first — never optimize based on intuition
- Bottleneck order: I/O latency > algorithmic complexity > memory > micro-opts
- Document performance trade-offs in comments when code sacrifices readability

### 15.2 Common Optimizations
```javascript
// Pre-allocate arrays when size is known
const results = new Array(items.length);
for (let i = 0; i < items.length; i++) results[i] = transform(items[i]);

// Memoize expensive pure functions
const memo = new Map();
function expensiveOp(key) {
  if (memo.has(key)) return memo.get(key);
  const result = compute(key);
  memo.set(key, result);
  return result;
}
```

### 15.3 Memory Optimization
```javascript
// Process large files with streams — constant memory regardless of file size
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const rl = createInterface({ input: createReadStream('large.csv') });
for await (const line of rl) {
  processLine(line);
}

// WeakMap for object-keyed caches — entries GC'd with their keys
const cache = new WeakMap();
```

### 15.4 String and JSON Performance
```javascript
// Template literals for string building
const url = `${baseUrl}/api/v1/${resource}/${id}`;

// Cache repeated deep property lookups in hot loops
const { length } = arr;
const { status } = user;
for (let i = 0; i < length; i++) { /* use status, not user.status each iteration */ }
```

---

## 16. Security

### 16.1 Essential Practices
- Load secrets from environment variables; never hardcode them in source
- Validate and sanitize all external input before processing
- Use `helmet` middleware for HTTP security headers
- Configure CORS explicitly; never use `origin: '*'` in production
- Rate limit public endpoints to prevent brute force and DoS
- Run `npm audit` before every production release

### 16.2 Tools
```bash
npm audit                          # check known vulnerabilities
npm audit fix                      # auto-apply safe fixes
npx snyk test                      # deeper vulnerability analysis
npm audit --audit-level=high       # fail CI on high+ severity CVEs
```

### 16.3 Security at API Boundaries
```javascript
// Explicit destructure ignores unexpected fields (prevents mass assignment)
function parseCreateUserInput(body) {
  const { name, email } = body;
  if (typeof name !== 'string' || name.trim().length < 2) {
    throw new ValidationError('name must be at least 2 characters');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('invalid email format');
  }
  return { name: name.trim(), email: email.toLowerCase().trim() };
}
// Never eval() user input
// Never pass user data to child_process.exec() or shell commands
// Always use parameterized queries — never concatenate user input into SQL
```

---

## 17. Code Patterns

### 17.1 Early Return
```javascript
// Good — flat and readable
function processOrder(order) {
  if (!order) return null;
  if (order.status === 'cancelled') return { skipped: true };
  if (!order.items.length) throw new ValidationError('Order has no items');
  return calculateTotal(order.items);
}

// Bad — deeply nested
function processOrder(order) {
  if (order) {
    if (order.status !== 'cancelled') {
      if (order.items.length) {
        return calculateTotal(order.items);
      }
    }
  }
}
```

### 17.2 Separation of Concerns
```javascript
// Pure function — no I/O, fully testable in isolation
function calculateDiscount(price, memberType) {
  if (memberType === 'premium') return price * 0.2;
  return price * 0.05;
}

// Orchestrator — manages I/O, delegates logic to pure functions
async function applyDiscount(orderId, memberType) {
  const order = await db.findOrder(orderId);
  const discount = calculateDiscount(order.price, memberType);
  return db.updateOrder(orderId, { discount });
}
```

### 17.3 DRY and Variable Scope
```javascript
// Extract only when same logic appears 3+ times with clear semantics
const toISODate = (d) => new Date(d).toISOString().split('T')[0];

// Declare variables close to use; const by default
for (const item of items) {
  const processed = transform(item); // scoped to loop body
  results.push(processed);
}
```

---

## 18. Dependency Management

### 18.1 Principles
- Prefer Node.js built-ins over third-party when capability is equivalent
- Evaluate by: maintenance activity, weekly downloads, open CVEs, bundle size
- Pin exact versions in applications; use semver ranges only in published libraries
- Always commit `package-lock.json`

### 18.2 Commands
```bash
npm outdated                       # list packages with newer versions
npm update                         # update within current semver ranges
npx npm-check-updates              # preview available major bumps
npx depcheck                       # find declared but unused dependencies
npm prune                          # remove unlisted packages
npm audit --audit-level=high       # fail on high/critical vulnerabilities
```

---

## 19. Comments and Documentation

### 19.1 Code Comments
```javascript
// Good — explains WHY, not WHAT
// Bypass cache here: user.status changes on every login and stale reads
// caused billing errors in production (incident #2024-041)
cache.bypass = true;

// Bad — restates the code
cache.bypass = true; // set bypass to true
```

### 19.2 JSDoc
```javascript
/**
 * Calculates the discounted price for a given membership tier.
 *
 * @param {number} price - Original price in cents (positive integer)
 * @param {'standard'|'premium'|'vip'} memberType - Customer membership tier
 * @returns {number} Discount amount in cents
 * @throws {ValidationError} When price is negative or memberType is unknown
 */
function calculateDiscount(price, memberType) { /* ... */ }
```

### 19.3 Module Documentation
```javascript
/**
 * @module user-service
 * @description Handles user lifecycle: creation, authentication, profile updates.
 * Business rules: emails unique per tenant; passwords stored as bcrypt hashes.
 * All methods require a valid tenantId from the authenticated session.
 */
```

---

## 20. Database

### 20.1 Approach
Node.js supports three database access patterns:
- **Raw SQL drivers** (`mysql2`, `pg`) — full control, best performance, manual schema management
- **Query builders** (Knex.js) — composable SQL, migration support, no model abstraction overhead
- **ORMs** (Sequelize, Prisma) — model-centric, higher abstraction cost, auto-migrations

For most projects, a raw driver with a migration tool provides the best balance of control and safety.

### 20.2 Connection and Driver
```javascript
// Connection pool with native pg driver
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
```

```javascript
// Parameterized query — prevents SQL injection
async function getUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, name, email FROM users WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return rows[0] ?? null;
}

// Explicit transaction management
async function transferFunds(fromId, toId, amount) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromId]
    );
    await client.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release(); // always release back to pool
  }
}
```

### 20.3 Migrations
Manage schema changes with versioned, sequential migration files.
Never alter schema manually in production. Popular tools: `node-pg-migrate`, `db-migrate`, `Knex migrations`.

```bash
npm install db-migrate db-migrate-pg
npx db-migrate create add-users-table --sql-file  # scaffold migration file
npx db-migrate up                                  # apply pending migrations
npx db-migrate down                                # rollback last migration
```

### 20.4 Best Practices
- Always use parameterized queries — never concatenate user input into SQL strings
- Use connection pooling — never open and close a connection per request
- Always release connections in `finally` blocks to prevent pool exhaustion
- Index columns used in `WHERE`, `JOIN`, and `ORDER BY`
- Test transactions: verify rollback on failure, not only the success path

---

## 21. Logs and Observability

### 21.1 Log Levels

| Level | When to use |
|-------|-------------|
| `trace` | Fine-grained diagnostics — loop iterations, low-level I/O |
| `debug` | Developer diagnostics — request payloads, resolved values |
| `info`  | Normal operations — service started, request completed |
| `warn`  | Degraded but continuing — retry attempted, fallback used |
| `error` | Operation failed — exception caught, action not completed |
| `fatal` | Process cannot continue — will exit after logging |

### 21.2 Structured Logging Setup
```javascript
// src/logger.js — structured JSON logger using Node.js built-ins
const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
const MIN = LEVELS[process.env.LOG_LEVEL ?? 'info'];

function log(level, data, message) {
  if (LEVELS[level] < MIN) return;
  process.stdout.write(
    JSON.stringify({
      level,
      time: new Date().toISOString(),
      pid: process.pid,
      msg: message,
      ...(data && typeof data === 'object' ? data : { data }),
    }) + '\n'
  );
}

export const logger = {
  trace: (d, m) => log('trace', d, m),
  debug: (d, m) => log('debug', d, m),
  info:  (d, m) => log('info',  d, m),
  warn:  (d, m) => log('warn',  d, m),
  error: (d, m) => log('error', d, m),
  fatal: (d, m) => log('fatal', d, m),
};
```

### 21.3 Logging Implementation
```javascript
import { logger } from './logger.js';

// Structured context — never interpolate into strings
logger.info({ userId, orderId, amount }, 'Order payment processed');
logger.error({ err, userId, action: 'processPayment' }, 'Payment failed');

// Request logger middleware
export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      path:   req.path,
      status: res.statusCode,
      ms:     Date.now() - start,
      reqId:  req.headers['x-request-id'] ?? 'none',
    }, 'HTTP request completed');
  });
  next();
}
```

### 21.4 Metrics and Observability
```javascript
// Expose health and metrics via a dedicated port
import { createServer } from 'http';

const metrics = { requests: 0, errors: 0, latencyTotal: 0 };

createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  }
  if (req.url === '/metrics') {
    const mem = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ...metrics,
      avgLatencyMs: metrics.requests
        ? (metrics.latencyTotal / metrics.requests).toFixed(2)
        : 0,
      heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(2),
    }));
  }
  res.writeHead(404); res.end();
}).listen(9090);
```

---

## 22. Golden Rules

1. **Never block the event loop** — async I/O always; Worker Threads for CPU-bound work
2. **Handle every error explicitly** — no empty catch blocks, no silent failures
3. **Validate at every boundary** — all incoming HTTP data, all consumed external API responses
4. **Parameterized queries without exception** — SQL injection is prevented at the driver level
5. **Measure before optimizing** — profile with clinic.js or `--prof`; intuition wastes time
6. **Dependencies are liabilities** — minimize count, audit regularly, prefer Node.js built-ins
7. **Tests are not optional** — unhandled async edge cases fail silently in production

---

## 23. Pre-Commit Checklist

### Code
- [ ] `npx prettier --check .` passes without formatting errors
- [ ] `npx eslint src/` passes with no critical errors
- [ ] Application starts cleanly: `node src/index.js`

### Tests
- [ ] All unit tests pass: `npx jest --selectProjects unit`
- [ ] Coverage >= 70% on critical service and utility modules
- [ ] Integration tests pass against a real database
- [ ] No `.only` or `.skip` left in any test file

### Quality
- [ ] All async functions handle errors explicitly (try/catch or `.catch`)
- [ ] No `console.log` in `src/` — structured logger used throughout
- [ ] No hardcoded secrets, API keys, passwords, or IP addresses
- [ ] `npm audit` shows no high or critical vulnerabilities

### Documentation
- [ ] Public functions and modules have JSDoc comments
- [ ] `.env.example` reflects all required environment variables
- [ ] README updated if setup or deployment steps changed

### Docker
- [ ] `docker compose build` completes without errors
- [ ] `docker compose up -d` starts all services cleanly
- [ ] Application responds correctly when accessed from inside the container

---

## 24. References

### Official Documentation
- [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide)
- [MDN JavaScript Code Style Guide](https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Code_style_guide/JavaScript)
- [Node.js Official Documentation](https://nodejs.org/en/docs/)
- [Node.js Security Best Practices](https://nodejs.org/learn/getting-started/security-best-practices)
- [Node.js — Don't Block the Event Loop](https://nodejs.org/en/docs/guides/dont-block-the-event-loop)
- [Node.js Event Loop Guide](https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick)

### Style Guides
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [Node.js Best Practices — goldbergyoni](https://github.com/goldbergyoni/nodebestpractices)
- [JavaScript Testing Best Practices — goldbergyoni](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [JavaScript Standard Style](https://standardjs.com/)

### Essential Tools
- [ESLint v9](https://eslint.org/) — Pluggable JavaScript linter
- [Prettier](https://prettier.io/) — Opinionated code formatter
- [Jest v29](https://jestjs.io/) — JavaScript testing framework with built-in mocking
- [pino](https://getpino.io) — Very low overhead Node.js logger
- [Testcontainers for Node.js](https://node.testcontainers.org/)
- [tinybench](https://github.com/tinylibs/tinybench) — Lightweight benchmarking

### Testing and Performance
- [k6 Load Testing](https://k6.io/docs/)
- [autocannon](https://github.com/mcollina/autocannon)
- [clinic.js](https://clinicjs.org/)
- [0x Flamegraph Profiler](https://github.com/davidmarkclements/0x)

### Community
- [awesome-nodejs](https://github.com/sindresorhus/awesome-nodejs)
- [Node Weekly Newsletter](https://nodeweekly.com/)
