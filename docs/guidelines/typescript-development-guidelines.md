# TypeScript Development Guidelines

## Project Stack

**User-Specified Libraries**:
- **Framework**: React (v18.x) - UI component library - https://react.dev
- **Build Tool**: Vite (v5.x) - Frontend build tool and dev server - https://vitejs.dev
- **Testing**: Jest (v29.x) + React Testing Library - https://jestjs.io / https://testing-library.com
- **Validation**: Zod (v3.x) - TypeScript-first schema validation - https://zod.dev
- **HTTP Client**: Axios (v1.x) - Promise-based HTTP client - https://axios-http.com

**Auto-Populated Essential Tools**:
- **Formatting**: Prettier (v3.x) - https://prettier.io
- **Linting**: ESLint (v9.x) + typescript-eslint - https://typescript-eslint.io
- **Type Checking**: TypeScript (v5.x) - https://typescriptlang.org
- **Build**: npm / Vite CLI

> All code examples use TypeScript standard features only.
> Principles apply regardless of UI framework choices.

---

## 1. Core Principles

### 1.1 Philosophy and Style
- `strict: true` no `tsconfig.json` — sempre
- Prefer tipos explícitos em interfaces públicas; deixar inferência para variáveis locais
- `unknown` em vez de `any` quando o tipo não é conhecido
- Tipos de domínio comunicam intenção melhor que primitivos (`UserId` vs `string`)

```json
// tsconfig.json — configuração base obrigatória
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

### 1.2 Clarity Over Brevity
- Nomear tipos de retorno em funções públicas e hooks
- Evitar `as` casting — investigar a causa raiz do erro de tipo
- `satisfies` em vez de `as` para validar conformidade sem perder tipo

---

## 2. Project Initialization

### 2.1 Creating New Project
```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install

# Configurar TypeScript strict
npx tsc --init

# Instalar ferramentas de desenvolvimento
npm install --save-dev prettier eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install --save-dev @testing-library/react @testing-library/jest-dom jest jest-environment-jsdom
```

### 2.2 Dependency Management
```bash
npm install <package>
npm install --save-dev @types/<package>   # types separados quando necessário
npm uninstall <package>
npm outdated
npm audit
npm ci                                    # install determinístico (CI/CD)
npx tsc --noEmit                          # type-check sem gerar ficheiros
```

---

## 3. Project Structure

```
src/
├── main.tsx              # entry point
├── App.tsx               # root component
├── components/           # componentes reutilizáveis
│   └── Button/
│       ├── Button.tsx
│       ├── Button.test.tsx
│       └── index.ts      # barrel export
├── pages/                # componentes de página (roteamento)
├── hooks/                # custom hooks (use*)
├── services/             # chamadas de API
├── contexts/             # React Contexts
├── types/                # tipos e interfaces globais
├── utils/                # funções puras auxiliares
└── __mocks__/            # mocks globais para Jest
tests/
├── unit/
└── integration/
public/
vite.config.ts
tsconfig.json
.eslintrc.json
.prettierrc
jest.config.ts
```

**Rules**:
- Cada componente em pasta própria com `index.ts` como barrel
- `hooks/` exporta apenas custom hooks (prefixo `use`)
- `types/` contém apenas definições de tipos — sem lógica
- `services/` é puro: sem estado React, sem side effects não relacionados com HTTP

---

## 4. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Ficheiros de componente | PascalCase | `UserCard.tsx` |
| Ficheiros utilitários | kebab-case | `format-date.ts` |
| Componentes | PascalCase | `UserCard`, `AppointmentList` |
| Hooks | camelCase com `use` | `useAppointments`, `useAuth` |
| Types/Interfaces | PascalCase | `User`, `AppointmentDTO` |
| Variáveis/funções | camelCase | `userId`, `fetchUser` |
| Constantes | UPPER_SNAKE_CASE | `MAX_RETRIES`, `API_BASE_URL` |
| Enums | PascalCase (membros PascalCase) | `AppointmentStatus.Confirmed` |

```ts
// Bom
interface AppointmentCardProps {
  appointment: Appointment;
  onConfirm: (id: AppointmentId) => void;
}

// Mau
interface props {
  apt: any;
  onClick: Function;
}
```

---

## 5. Types and Type System

### 5.1 Type Declaration
```ts
// Branded types para primitivos de domínio
type UserId = string & { readonly brand: unique symbol };
type TenantId = string & { readonly brand: unique symbol };

// Prefer interfaces para shapes de objetos (extensíveis)
interface User {
  id: UserId;
  name: string;
  email: string;
  role: UserRole;
}

// Type aliases para unions, intersections e utilitários
type UserRole = 'admin' | 'gerente' | 'terapeuta';
type CreateUserInput = Omit<User, 'id'>;
type PartialUser = Partial<Pick<User, 'name' | 'email'>>;

// Enums — preferir union types para melhor tree-shaking
type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
```

### 5.2 Type Safety
```ts
// Nunca usar any — usar unknown e narrowing
function parseJSON(input: string): unknown {
  return JSON.parse(input);
}

function processData(data: unknown): string {
  if (typeof data === 'string') return data;
  if (typeof data === 'object' && data !== null && 'name' in data) {
    return String((data as { name: unknown }).name);
  }
  throw new TypeError('Unexpected data shape');
}

// satisfies — validar conformidade sem perder tipo específico
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
} satisfies Record<string, string | number>;

// config.timeout é number (não string | number)
```

### 5.3 Generics e Utilitários
```ts
// Generic para respostas de API
interface ApiResponse<T> {
  data: T;
  error: string | null;
  timestamp: string;
}

// Discriminated unions para estado
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
```

---

## 6. Functions and Methods

### 6.1 Signatures
```ts
// Tipos de retorno explícitos em funções públicas
async function fetchAppointments(tenantId: TenantId): Promise<Appointment[]> {
  const response = await fetch(`/api/agendamentos?tenantId=${tenantId}`);
  if (!response.ok) throw new ApiError('Failed to fetch appointments', response.status);
  return response.json() as Promise<Appointment[]>;
}

// Parâmetros com objeto quando há mais de 3
function createNotification({
  userId,
  message,
  channel = 'push',
}: {
  userId: UserId;
  message: string;
  channel?: NotificationChannel;
}): Notification { ... }
```

### 6.2 Returns and Errors

**Bom:**
```ts
async function getUserById(id: UserId): Promise<User> {
  const user = await userRepository.findById(id);
  if (!user) throw new NotFoundError(`User not found: ${id}`);
  return user;
}
```

**Mau:**
```ts
async function getUser(id: any) {
  try {
    return await userRepository.findById(id);
  } catch {
    return null; // engole erro, retorna null silenciosamente
  }
}
```

### 6.3 Best Practices
- Anotar tipos de retorno em hooks e funções de serviço
- Evitar `as Type` — usar type guards ou `satisfies`
- Arrow functions para callbacks; `function` para funções top-level
- Máximo 3-4 parâmetros posicionais

---

## 7. Error Handling

### 7.1 Philosophy
TypeScript usa exceções como JavaScript, mas o sistema de tipos permite erros mais expressivos. Padrão recomendado: classes de erro customizadas com discriminated unions para erros de domínio.

```ts
// Hierarquia de erros tipada
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly fields?: Record<string, string>) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

// Type guard para erros de domínio
function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
```

### 7.2 Conventions

**Bom:**
```ts
async function submitAppointment(data: CreateAppointmentInput): Promise<void> {
  try {
    await appointmentService.create(data);
  } catch (err) {
    if (isAppError(err)) {
      showToast({ type: 'error', message: err.message });
      return;
    }
    console.error('Unexpected error submitting appointment', err);
    showToast({ type: 'error', message: 'Erro inesperado. Tente novamente.' });
  }
}
```

**Mau:**
```ts
async function submitAppointment(data: any) {
  try {
    await appointmentService.create(data);
  } catch (e) {
    // ignora completamente
  }
}
```

### 7.3 Best Practices
- `catch (err: unknown)` — TypeScript 4.0+ não assume `any`
- Usar type guards antes de aceder a propriedades do erro
- Nunca suprimir erros em React sem feedback ao utilizador
- Boundary de erro: `ErrorBoundary` component para erros de render

```tsx
// ErrorBoundary global
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error('Render error:', err); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}
```

---

## 8. Concurrency and Parallelism

### 8.1 Concurrency Model
TypeScript/JavaScript usa Event Loop com async/await. Em React, o estado assíncrono é gerido via hooks (`useState`, `useEffect`, `useReducer`) ou libs de data fetching.

```ts
// Chamadas paralelas com Promise.all
async function loadDashboardData(tenantId: TenantId) {
  const [appointments, clients, revenue] = await Promise.all([
    fetchAppointments(tenantId),
    fetchClients(tenantId),
    fetchRevenue(tenantId),
  ]);
  return { appointments, clients, revenue };
}

// Promise.allSettled para falhas parciais aceitáveis
async function sendNotifications(userIds: UserId[]): Promise<void> {
  const results = await Promise.allSettled(
    userIds.map((id) => sendPushNotification(id))
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`Notification failed for user ${userIds[i]}`, r.reason);
    }
  });
}
```

### 8.2 Cancelamento com AbortController
```ts
// Cancelar fetch quando componente desmonta
function useAppointments(tenantId: TenantId) {
  const [data, setData] = React.useState<Appointment[]>([]);

  React.useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/agendamentos?tenantId=${tenantId}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then(setData)
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      });

    return () => controller.abort(); // cleanup ao desmontar
  }, [tenantId]);

  return data;
}
```

### 8.3 Common Pitfalls
```ts
// Mau: atualizar estado após desmontagem
useEffect(() => {
  fetchData().then((data) => setState(data)); // memory leak se componente desmontar
}, []);

// Bom: verificar com AbortController ou flag
useEffect(() => {
  let cancelled = false;
  fetchData().then((data) => { if (!cancelled) setState(data); });
  return () => { cancelled = true; };
}, []);
```

---

## 9. Interfaces and Abstractions

### 9.1 Interface Design
```ts
// Interfaces pequenas e coesas (Interface Segregation)
interface Readable<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
}

interface Writable<T, CreateInput> {
  create(data: CreateInput): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

// Composição em vez de herança
interface AppointmentRepository extends Readable<Appointment>, Writable<Appointment, CreateAppointmentInput> {}
```

### 9.2 Type Guards como Contratos
```ts
// Type guards documentam e enforçam contratos
function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'email' in value &&
    typeof (value as User).email === 'string'
  );
}

// Narrowing em runtime
function processApiResponse(data: unknown): User {
  if (!isUser(data)) throw new ValidationError('Invalid user data from API');
  return data;
}
```

### 9.3 Generics para Abstrações Reutilizáveis
```ts
// Hook genérico para dados assíncronos
function useAsync<T>(fn: () => Promise<T>): AsyncState<T> {
  const [state, setState] = React.useState<AsyncState<T>>({ status: 'idle' });

  const execute = React.useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await fn();
      setState({ status: 'success', data });
    } catch (err) {
      setState({ status: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [fn]);

  return state;
}
```

---

## 10. Unit Tests

### 10.1 Structure
```tsx
// components/Button/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders label correctly', () => {
    render(<Button label="Confirmar" onClick={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button label="Confirmar" onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when loading', () => {
    render(<Button label="Salvar" onClick={jest.fn()} loading />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### 10.2 Table-Driven Tests
```ts
// utils/format-date.test.ts
describe('formatDate', () => {
  const cases: Array<{ input: string; expected: string; label: string }> = [
    { input: '2026-04-08', expected: '08/04/2026', label: 'standard date' },
    { input: '2026-01-01', expected: '01/01/2026', label: 'new year' },
    { input: '2026-12-31', expected: '31/12/2026', label: 'year end' },
  ];

  it.each(cases)('$label', ({ input, expected }) => {
    expect(formatDate(input)).toBe(expected);
  });
});
```

### 10.3 Hook Testing
```ts
import { renderHook, act } from '@testing-library/react';

it('useCounter increments correctly', () => {
  const { result } = renderHook(() => useCounter(0));
  act(() => result.current.increment());
  expect(result.current.count).toBe(1);
});
```

### 10.4 Commands
```bash
npm test                                    # todos os testes
npm test -- --testPathPattern=Button        # ficheiro específico
npm test -- --coverage                      # com cobertura
npm test -- --watch                         # modo watch
npm test -- --testNamePattern="renders"     # por nome de teste
npx tsc --noEmit                            # type-check apenas
```

---

## 11. Mocks and Testability

### 11.1 Mock Strategies
```ts
// Mock de módulo de serviço
jest.mock('../services/appointment-service', () => ({
  fetchAppointments: jest.fn().mockResolvedValue([]),
  createAppointment: jest.fn().mockResolvedValue({ id: '1' }),
}));

// Mock de fetch nativo
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: [] }),
} as Response);

// Limpar entre testes
afterEach(() => jest.clearAllMocks());
```

### 11.2 Dependency Injection
```tsx
// Injectar dependências via props para testabilidade
interface AppointmentListProps {
  fetchFn?: (tenantId: string) => Promise<Appointment[]>;
}

function AppointmentList({ fetchFn = defaultFetchAppointments }: AppointmentListProps) {
  // ...
}

// No teste: injectar mock
render(<AppointmentList fetchFn={jest.fn().mockResolvedValue(mockData)} />);
```

### 11.3 MSW para Mocks de API
```ts
// Mocking de endpoints com MSW (Mock Service Worker)
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.get('/api/agendamentos', () => HttpResponse.json(mockAppointments)),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## 12. Integration Tests

### 12.1 Structure
```tsx
// tests/integration/appointment-flow.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentPage } from '../../src/pages/Agendamentos';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';

describe('Appointment flow', () => {
  it('displays appointments after load', async () => {
    render(<AppointmentPage />);
    await waitFor(() => {
      expect(screen.getByText('Consulta às 14h')).toBeInTheDocument();
    });
  });

  it('shows error when API fails', async () => {
    server.use(
      http.get('/api/agendamentos', () => HttpResponse.error()),
    );
    render(<AppointmentPage />);
    await waitFor(() => {
      expect(screen.getByText(/erro ao carregar/i)).toBeInTheDocument();
    });
  });
});
```

### 12.2 Selective Execution
```bash
npm test -- --selectProjects unit
npm test -- --selectProjects integration
npm test -- --testPathPattern=integration
```

### 12.3 Setup Global
```ts
// jest.setup.ts
import '@testing-library/jest-dom';
import { server } from './src/__mocks__/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## 13. Profiling and Diagnostics

### 13.1 React DevTools
```bash
# Instalar React DevTools no browser (Chrome/Firefox extension)
# React Profiler: gravar renders e identificar componentes lentos

# Lighthouse — performance audit
npx lighthouse http://localhost:5173 --view

# Bundle analysis
npm run build
npx vite-bundle-visualizer  # ou
npx source-map-explorer dist/assets/*.js
```

### 13.2 Performance no Código
```tsx
// Identificar renders desnecessários
import { Profiler } from 'react';

function onRender(id: string, phase: string, actualDuration: number) {
  if (actualDuration > 16) { // > 1 frame (60fps)
    console.warn(`Slow render: ${id} (${phase}) — ${actualDuration.toFixed(1)}ms`);
  }
}

<Profiler id="AppointmentList" onRender={onRender}>
  <AppointmentList />
</Profiler>
```

### 13.3 Web Vitals
```ts
// Monitorar Core Web Vitals
import { onCLS, onINP, onLCP } from 'web-vitals';

onCLS(console.log);   // Cumulative Layout Shift
onINP(console.log);   // Interaction to Next Paint
onLCP(console.log);   // Largest Contentful Paint
```

---

## 14. Optimization

### 14.1 React.memo e Callbacks
```tsx
// BAD — recria função a cada render, quebrando memo do filho
function Parent() {
  const handleClick = () => doSomething(); // nova referência sempre
  return <Child onClick={handleClick} />;
}

// GOOD — referência estável
function Parent() {
  const handleClick = useCallback(() => doSomething(), []);
  return <Child onClick={handleClick} />;
}

// Memo só faz sentido quando props são estáveis
const AppointmentCard = React.memo(({ appointment }: Props) => (
  <div>{appointment.clientName}</div>
));
```

### 14.2 useMemo para Cálculos Pesados
```tsx
// BAD — recalcula em todo render
function FinancialSummary({ transactions }: Props) {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  return <span>R$ {total.toFixed(2)}</span>;
}

// GOOD — memoiza resultado
function FinancialSummary({ transactions }: Props) {
  const total = useMemo(
    () => transactions.reduce((sum, t) => sum + t.amount, 0),
    [transactions]
  );
  return <span>R$ {total.toFixed(2)}</span>;
}
```

### 14.3 Code Splitting com lazy/Suspense
```tsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

// Cada página carregada sob demanda
const Financeiro = lazy(() => import('./pages/Financeiro'));
const CalendarView = lazy(() => import('./pages/CalendarView'));
const VenderPacote = lazy(() => import('./pages/VenderPacote'));

function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/calendario" element={<CalendarView />} />
        <Route path="/vender-pacote" element={<VenderPacote />} />
      </Routes>
    </Suspense>
  );
}
```

### 14.4 Virtualização de Listas
```tsx
// Para listas > 100 itens — usar virtualização
import { useVirtualizer } from '@tanstack/react-virtual';

function AppointmentList({ items }: { items: Appointment[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(item => (
          <div key={item.key} style={{ transform: `translateY(${item.start}px)` }}>
            <AppointmentCard appointment={items[item.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 15. Security

### 15.1 XSS — Evitar dangerouslySetInnerHTML
```tsx
// BAD — vulnerável a XSS
function Note({ content }: { content: string }) {
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}

// GOOD — renderizar como texto
function Note({ content }: { content: string }) {
  return <div>{content}</div>; // React escapa automaticamente
}

// Se HTML é necessário (conteúdo confiável/sanitizado):
import DOMPurify from 'dompurify';
function SafeHtml({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

### 15.2 Variáveis de Ambiente
```ts
// BAD — hardcoded ou acessado sem validação
const apiUrl = 'https://api.marcai.app';
const secret = process.env.REACT_APP_SECRET; // pode ser undefined

// GOOD — validado em startup (src/config/env.ts)
const requiredEnvVars = ['VITE_API_URL'] as const;

for (const key of requiredEnvVars) {
  if (!import.meta.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

export const config = {
  apiUrl: import.meta.env.VITE_API_URL as string,
} as const;
```

### 15.3 Tokens e Dados Sensíveis
```ts
// BAD — token em localStorage (vulnerável a XSS)
localStorage.setItem('token', jwt);

// BETTER — httpOnly cookie (gerido pelo servidor)
// O servidor seta: Set-Cookie: token=...; HttpOnly; Secure; SameSite=Strict

// Se necessário usar localStorage: nunca guardar dados sensíveis
// Usar apenas para preferências de UI
localStorage.setItem('theme', 'dark');
localStorage.setItem('language', 'pt-BR');
```

### 15.4 CSRF com Axios
```ts
// Incluir CSRF token em mutações (se API requer)
import axios from 'axios';

const api = axios.create({ baseURL: config.apiUrl });

api.interceptors.request.use(config => {
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('csrf='))
    ?.split('=')[1];

  if (csrfToken && ['post', 'put', 'patch', 'delete'].includes(config.method ?? '')) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});
```

---

## 16. Code Patterns

### 16.1 Early Return
```tsx
// BAD — nesting profundo
function AppointmentDetail({ id }: { id: string }) {
  const { data } = useAppointment(id);
  if (data) {
    if (data.status !== 'cancelled') {
      return <Detail appointment={data} />;
    } else {
      return <Cancelled />;
    }
  } else {
    return <Loading />;
  }
}

// GOOD — early returns
function AppointmentDetail({ id }: { id: string }) {
  const { data, isLoading } = useAppointment(id);

  if (isLoading) return <Loading />;
  if (!data) return <NotFound />;
  if (data.status === 'cancelled') return <Cancelled />;

  return <Detail appointment={data} />;
}
```

### 16.2 Custom Hooks para Lógica de Negócio
```tsx
// BAD — lógica misturada com UI
function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/clientes?q=${search}`)
      .then(r => r.json())
      .then(data => { setClientes(data); setLoading(false); });
  }, [search]);

  // ... 100 linhas de UI
}

// GOOD — separação clara
function useClientes(search: string) {
  return useQuery({
    queryKey: ['clientes', search],
    queryFn: () => clientesService.list({ search }),
  });
}

function Clientes() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useClientes(search);

  if (isLoading) return <Loading />;
  return <ClientesList clientes={data ?? []} onSearch={setSearch} />;
}
```

### 16.3 Compound Components para UI Complexa
```tsx
// Compound components — contexto interno, API limpa
const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="card">{children}</div>
);
Card.Header = ({ title }: { title: string }) => (
  <div className="card-header">{title}</div>
);
Card.Body = ({ children }: { children: React.ReactNode }) => (
  <div className="card-body">{children}</div>
);

// Uso
<Card>
  <Card.Header title="Agendamento" />
  <Card.Body>...</Card.Body>
</Card>
```

---

## 17. Dependency Management

```bash
# Instalar dependência de produção
npm install react-query
npm install @tanstack/react-query  # versão moderna

# Instalar dependência de desenvolvimento
npm install -D @types/node vitest

# Atualizar dependências (interativo)
npx npm-check-updates -i

# Verificar vulnerabilidades
npm audit
npm audit fix

# Verificar bundle size antes de adicionar dep
npx bundlephobia react-pdf

# Listar dependências desatualizadas
npm outdated

# Remover dependência não utilizada
npm uninstall unused-package
npx depcheck  # detecta imports não utilizados
```

### Regras de Dependências
```
- Preferir bibliotecas com < 10 dependências transitivas
- Verificar bundle size no bundlephobia.com antes de instalar
- @types/* sempre em devDependencies
- Pinnar versões críticas (auth, crypto) — evitar ^ em produção
- Máximo 1 biblioteca por categoria (1 HTTP client, 1 state manager)
```

---

## 18. Comments and Documentation

### 18.1 JSDoc para Tipos e Funções Públicas
```ts
/**
 * Formata número de telefone brasileiro para exibição.
 * @param phone - Número com ou sem formatação (10-11 dígitos)
 * @returns Formato (XX) XXXXX-XXXX ou string original se inválido
 * @example
 * formatPhone('11999999999') // '(11) 99999-9999'
 * formatPhone('invalid')     // 'invalid'
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  }
  return phone;
}
```

### 18.2 Comentários em Código
```ts
// BAD — comentário que repete o código
const total = price * quantity; // multiplica preço pela quantidade

// GOOD — comentário explica o "porquê", não o "o quê"
// Z-API cobra por sessão ativa, não por mensagem
// Reutilizar instância evita custo duplo em requests concorrentes
const whatsappInstance = WhatsAppService.getInstance();

// BAD — código comentado
// const oldImplementation = ...

// GOOD — remover código morto; git history preserva o histórico
```

### 18.3 TODO Rastreáveis
```ts
// BAD — TODO sem contexto
// TODO: fix this

// GOOD — TODO com contexto e issue rastreável
// TODO(ADR-006): migrar para Evolution API self-hosted
// Ref: docs/adrs/generated/ADR-006-z-api-whatsapp-integration.md
// Planned: Fase 2
```

---

## 19. API Calls and Data Fetching

### 19.1 Service Layer Tipado
```ts
// src/services/agendamentosService.ts
import { api } from './api';
import type { Agendamento, CreateAgendamentoDto, PaginatedResponse } from '../types';

export const agendamentosService = {
  list: (params: { start: string; end: string }): Promise<Agendamento[]> =>
    api.get('/agendamentos', { params }).then(r => r.data),

  getById: (id: string): Promise<Agendamento> =>
    api.get(`/agendamentos/${id}`).then(r => r.data),

  create: (dto: CreateAgendamentoDto): Promise<Agendamento> =>
    api.post('/agendamentos', dto).then(r => r.data),

  update: (id: string, dto: Partial<CreateAgendamentoDto>): Promise<Agendamento> =>
    api.put(`/agendamentos/${id}`, dto).then(r => r.data),

  cancel: (id: string, motivo: string): Promise<void> =>
    api.patch(`/agendamentos/${id}/cancelar`, { motivo }).then(() => undefined),
};
```

### 19.2 Interceptor de Auth e Erros
```ts
// src/services/api.ts
import axios from 'axios';
import { config } from '../config/env';

export const api = axios.create({ baseURL: config.apiUrl });

api.interceptors.request.use(cfg => {
  const token = sessionStorage.getItem('accessToken');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('accessToken');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);
```

### 19.3 React Query para Server State
```tsx
// Separar server state (React Query) de client state (useState/Context)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useAgendamentos(range: DateRange) {
  return useQuery({
    queryKey: ['agendamentos', range],
    queryFn: () => agendamentosService.list(range),
    staleTime: 1000 * 60 * 5, // 5 min
  });
}

export function useCancelAgendamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      agendamentosService.cancel(id, motivo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agendamentos'] }),
  });
}
```

---

## 20. Logs and Observability

### 20.1 Structured Logging no Frontend
```ts
// src/lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = { level, message, context, timestamp: new Date().toISOString() };

  if (import.meta.env.DEV) {
    console[level](message, context ?? '');
    return;
  }

  // Em produção: enviar para serviço de monitoramento
  if (level === 'error') {
    // Sentry.captureException / LogRocket / Datadog
    sendToMonitoring(entry);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
};
```

### 20.2 Captura de Erros de Runtime
```tsx
// Integrar ErrorBoundary com logger
class ErrorBoundary extends React.Component<Props, State> {
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('React render error', {
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      route: window.location.pathname,
    });
  }
}
```

### 20.3 Performance Tracking
```ts
// Medir operações críticas
export function measureAsync<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  return fn().finally(() => {
    const duration = performance.now() - start;
    if (duration > 1000) {
      logger.warn('Slow operation detected', { name, durationMs: Math.round(duration) });
    }
  });
}

// Uso
const agendamentos = await measureAsync('fetch-agendamentos', () =>
  agendamentosService.list({ start, end })
);
```

---

## 21. Golden Rules

1. **TypeScript strict sempre** — sem `any`, sem `@ts-ignore` não justificado
2. **Componente = UI only** — lógica vai em custom hooks
3. **Server state = React Query** — client state = useState/Context
4. **Cada arquivo tem uma razão de existir** — sem ficheiros "utils" genéricos
5. **Props tipadas explicitamente** — sem `Record<string, any>` como tipo de props
6. **Erros são tratados, não ignorados** — todo `catch` faz algo útil
7. **Console.log não entra em produção** — usar `logger`
8. **Não optimizar prematuramente** — só memoizar quando há evidência de problema
9. **Dependências externas passam por service layer** — nunca fetch direto no componente
10. **Testes testam comportamento, não implementação** — não testar estado interno

---

## 22. Pre-Commit Checklist

```
TYPESCRIPT
  [ ] Sem erros TypeScript (tsc --noEmit)
  [ ] Sem uso de any explícito ou implícito
  [ ] Props de componentes tipadas com interface/type
  [ ] Retornos de funções tipados

REACT
  [ ] Componentes com < 150 linhas (decompor se maior)
  [ ] Lógica em custom hooks, não em componentes
  [ ] useEffect com cleanup quando necessário
  [ ] Key prop em listas (nunca usar index se lista mutável)

QUALIDADE
  [ ] ESLint sem erros (npm run lint)
  [ ] Prettier aplicado (npm run format)
  [ ] Sem console.log remanescente

TESTES
  [ ] Componentes críticos testados com RTL
  [ ] Handlers de API mockados com MSW
  [ ] npm test passa localmente

SEGURANÇA
  [ ] Sem secrets em código (.env apenas)
  [ ] Sem dangerouslySetInnerHTML com input de utilizador
  [ ] Axios interceptor de 401 configurado

PERFORMANCE
  [ ] Lazy loading em todas as rotas
  [ ] Sem imports desnecessários que aumentem bundle
  [ ] Imagens com dimensões e lazy loading
```

---

## 23. References

### Documentação Oficial
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

### Guias de Style
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [Microsoft TypeScript Do's and Don'ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [Airbnb React Style Guide](https://github.com/airbnb/javascript/tree/master/react)

### Ferramentas do Stack
- [@tanstack/react-query v5](https://tanstack.com/query/latest) — Server state management
- [axios v1](https://axios-http.com/) — HTTP client tipado
- [MSW v2](https://mswjs.io/) — API mocking para testes
- [Vitest](https://vitest.dev/) — Test runner nativo do Vite
- [web-vitals](https://github.com/GoogleChrome/web-vitals) — Core Web Vitals

### Padrões e Arquitectura
- [ADR-009: Split Deploy Render/Vercel](../adrs/generated/ADR-009-split-deploy-render-vercel.md)
- [ADR-008: Web Push + PWA](../adrs/generated/ADR-008-web-push-pwa-notification-strategy.md)
- [ADR-004: JWT Authentication](../adrs/generated/ADR-004-jwt-authentication-strategy.md)
- [ADR-011: Modular Monolith](../adrs/generated/ADR-011-modular-monolith-agendamento-financeiro.md)

---

*Gerado para o projecto Laura SaaS Agenda — Frontend React + TypeScript + Vite*  
*Última actualização: 2026-04-14*
