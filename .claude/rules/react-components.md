# React — Components

Componentes ficam em `laura-saas-frontend/src/components/`. Extensão: `.tsx` para novos ficheiros.

## Responsabilidade

- `components/` → UI pura sem lógica de negócio
- `pages/` → layout + composição + chamadas API directas
- Lógica reutilizável vai em custom hooks, não em componentes

## Design system (obrigatório)

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

Não criar novas variantes visuais fora deste sistema.

## Loading, erro e feedback

```tsx
// sempre mostrar estado de loading
{isLoading && <Spinner />}

// erros de formulário: inline sob o campo (não apenas toast)
{errors.nome && <p className="text-red-400 text-sm mt-1">{errors.nome.message}</p>}

// toast para acções concluídas (criar, guardar, eliminar)
toast.success('Cliente criado com sucesso');
```

- Nunca usar `alert()` — usar `react-toastify` ou mensagem inline
- Nunca deixar ecrã "congelado" durante chamada API

## Limites de plano na UI

```tsx
const { tenant } = useAuth();

// desabilitar quando limite atingido
<button disabled={clientes.length >= tenant.limites.maxClientes}>
  Novo Cliente
</button>

// banner de trial a expirar
{tenant.diasRestantesTrial <= 3 && <BannerTrial dias={tenant.diasRestantesTrial} />}
```

O frontend reflecte os limites — nunca os substitui. O backend é a fonte de verdade.

## TypeScript

- Tipar props de todos os componentes
- Nunca usar `any` sem comentário que justifique
- Interfaces para responses da API em `src/types/`

```tsx
// correcto
interface ClienteCardProps {
  nome: string;
  telefone: string;
  onEditar: (id: string) => void;
}

export function ClienteCard({ nome, telefone, onEditar }: ClienteCardProps) { ... }
```

## Proibido

- Introduzir nova biblioteca de UI sem aprovação explícita
- Usar `alert()` em qualquer situação
- Importar dependências de servidor (`nodemailer`, `web-push`, etc.) no frontend
- Ficheiros `.jsx` existentes convertidos a `.tsx` sem necessidade explícita
