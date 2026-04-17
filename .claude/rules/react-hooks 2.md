# React — Hooks e Estado

## useAuth — fonte de verdade para autenticação

```javascript
import { useAuth } from '../contexts/AuthContext';

const { user, tenant, isAuthenticated, isAdmin } = useAuth();
// user.nome, user.email, user.role
// tenant.plano, tenant.limites.maxClientes, tenant.diasRestantesTrial
```

- Sempre usar `useAuth()` — nunca ler `localStorage` directamente fora do `AuthContext`
- Nunca manipular JWT fora do `AuthContext`
- Se 401 persistente → o interceptor de `api.js` já trata o logout automático

## Chamadas à API — sempre via `api.js`

```javascript
import api from '../services/api';

// dentro de um hook ou página
const [clientes, setClientes] = useState([]);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState(null);

useEffect(() => {
  const fetchClientes = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/clientes');
      setClientes(data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao carregar clientes');
    } finally {
      setIsLoading(false);
    }
  };
  fetchClientes();
}, []);
```

- Sempre usar `api.js` — nunca `fetch` directamente
- O interceptor já trata: Bearer token, refresh automático em 401, toasts de erro genérico

## Custom hooks para lógica reutilizável

```typescript
// src/hooks/useClientes.ts
export function useClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchClientes = async () => { ... };
  const criarCliente = async (dados: CriarClienteDTO) => { ... };

  return { clientes, isLoading, fetchClientes, criarCliente };
}
```

Lógica reutilizável vai em custom hooks, não em componentes nem em páginas directamente.

## Routing

**Rotas públicas (sem sidebar):**
```
/login, /registrar, /esqueci-senha, /reset-senha/:token, /verificar-email/:token
```

**Rotas protegidas (com `ProtectedLayout` em `App.tsx`):**
```
/dashboard, /clientes, /agendamentos, /pacotes, /financeiro, ...
```

## Proibido

- Ler `localStorage` fora do `AuthContext`
- Usar `fetch` directamente em vez de `api.js`
- Manipular JWT fora do `AuthContext`
- Introduzir novo gestor de estado global sem aprovação explícita
