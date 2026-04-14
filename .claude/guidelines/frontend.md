# Frontend Guidelines — Laura SaaS Agenda

Lê este ficheiro antes de qualquer alteração em `laura-saas-frontend/src/`.

---

## Design System (Obrigatório)

Não criar novas variantes visuais. Usar exclusivamente as classes e valores abaixo.

```
Primária:   #6366f1  (indigo-500)
Secundária: #8b5cf6  (purple-500)
Fundo:      #0f172a  (slate-900)
Texto:      #f8fafc  (slate-50)
Subtexto:   #94a3b8  (slate-400)
```

**Card glassmorphism (páginas de auth):**
```jsx
<div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-8">
```

**Botão primário:**
```jsx
<button className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200">
```

**Background páginas de auth:**
```jsx
<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
```

---

## Autenticação e Estado

```javascript
import { useAuth } from '../contexts/AuthContext';

const { user, tenant, isAuthenticated, isAdmin } = useAuth();
// user.nome, user.email, user.role
// tenant.plano, tenant.limites.maxClientes, tenant.diasRestantesTrial
```

- Usar sempre `useAuth()` — nunca ler `localStorage` directamente fora do `AuthContext`
- Se 401 persistente → o interceptor do `api.js` já trata o logout automático
- Se 403 por plano → redirecionar para dashboard com banner informativo

---

## Chamadas à API

```javascript
import api from '../services/api';

const { data } = await api.get('/clientes');
const { data } = await api.post('/clientes', { nome, telefone });
const { data } = await api.put(`/clientes/${id}`, updates);
await api.delete(`/clientes/${id}`);
```

- Sempre usar `api.js` — nunca `fetch` directamente
- O interceptor já trata: Bearer token, refresh automático em 401, toasts de erro genérico

---

## Limites de Plano na UI

O frontend reflecte os limites — nunca os substitui:

- Desabilitar botão quando limite atingido (`tenant.limites.maxClientes`)
- Mostrar banner de trial quando `tenant.diasRestantesTrial <= 3`
- Nunca ocultar erros vindos do backend — o backend é a fonte de verdade

---

## Loading, Erro e Feedback

- Sempre mostrar estado de loading — nunca deixar ecrã "congelado" durante chamada API
- Erros de formulário: **inline** (sob o campo), não apenas toast
- Toast para: acções concluídas (criado, guardado, eliminado)
- Nunca usar `alert()` — usar `react-toastify` ou mensagem inline

---

## Estrutura por Camada

| Camada | Responsabilidade |
|---|---|
| `pages/` | Layout + composição + chamadas API directas |
| `components/` | UI pura sem lógica de negócio |
| `contexts/` | Estado global partilhado (auth, tema) |
| `services/api.js` | Toda comunicação HTTP |

Lógica reutilizável vai em custom hooks, não em componentes.

---

## Routing

**Rotas públicas (sem sidebar):**
```
/login, /registrar, /esqueci-senha, /reset-senha/:token, /verificar-email/:token
```

**Rotas protegidas (com `ProtectedLayout` em `App.tsx`):**
```
/dashboard, /clientes, /agendamentos, /pacotes, /financeiro, ...
```

---

## TypeScript — Regras de Migração

- Ficheiros existentes `.jsx` não são convertidos a menos que a tarefa exija explicitamente
- Novos componentes: `.tsx`. Nova lógica pura: `.ts`
- Nunca usar `any` sem comentário que justifique
- Tipar props de componentes e valores retornados por hooks
- Interfaces para responses da API em `src/types/`

---

## Proibido

- Introduzir nova biblioteca de UI sem aprovação explícita
- Usar `alert()` em qualquer situação
- Manipular JWT fora do `AuthContext`
- Usar `fetch` directamente em vez de `api.js`
- Ler `localStorage` fora do `AuthContext`
- Importar dependências de servidor (`nodemailer`, `web-push`, etc.) no frontend

---

## Checklist Antes de Commitar

- [ ] Design system respeitado (cores, glassmorphism, botão primário)
- [ ] Auth continua funcional (useAuth, interceptor, rotas protegidas)
- [ ] Limites do tenant reflectidos na UI
- [ ] Estado de loading tratado em todas as chamadas API
- [ ] Erros tratados (inline nos forms, toast para acções)
- [ ] Nenhum `any` introduzido sem justificação
- [ ] Nenhuma lib de servidor importada no frontend
