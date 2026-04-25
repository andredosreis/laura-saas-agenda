# ADR-018: Partilha de Schemas Zod entre Frontend e Backend

**Status:** Proposed — Implementação adiada
**Data:** 2026-04-24
**Módulo:** ARCH
**Autor:** André dos Reis
**Score de Impacto:** 85 (Médio)

---

## Contexto

Após a adopção completa de Zod no backend (2026-04-24), o sistema passou a ter a mesma dependência (`zod@^4.3.x`) em **ambos os lados**:

- **Backend** (`src/modules/<módulo>/<entidade>Schemas.js`) — 47 schemas que validam o input da API em runtime
- **Frontend** (`laura-saas-frontend/src/schemas/validationSchemas.js`) — ~10 schemas que validam formulários antes de submeter

Muitas regras estão **duplicadas literalmente** entre os dois lados:

- Formato de email (`z.string().email()`)
- Formato de telefone (9–15 dígitos, remove não-dígitos)
- Regras de password forte (8 chars, maiúscula, minúscula, número, especial)
- Campos obrigatórios em `registerSchema`, `loginSchema`, etc.

### Problemas concretos da duplicação

1. **Divergência silenciosa:** se alguém actualizar a regra de password no frontend mas esquecer o backend (ou vice-versa), o utilizador tenta submeter → frontend aceita → backend rejeita com 400. **UX má e difícil de diagnosticar.**

2. **Custo de manutenção cresce linearmente:** cada regra muda em dois sítios. Cada novo recurso que tenha form no frontend + endpoint no backend duplica o schema.

3. **Type inference perde-se:** `z.infer<typeof schema>` daria o mesmo tipo nos dois lados se fosse o mesmo schema. Hoje cada lado tem o seu tipo.

4. **Mensagens inconsistentes:** frontend escreve `"Senha deve ter no mínimo 8 caracteres"`, backend escreve `"Senha muito curta"` → utilizador recebe mensagens diferentes consoante o ponto de falha.

### Porque não foi feito na adopção inicial

- Priorização: era mais importante adoptar Zod primeiro em cada lado (risco baixo, ganho imediato) do que atacar já a partilha (decisão arquitectural, risco médio)
- Escopo: partilhar schemas exige decisão sobre **como** partilhar — essa decisão precisa de ADR própria
- Interdependência: partilhar força ambos os lados a manterem a mesma versão de Zod; hoje é assim por coincidência mas sem contrato

---

## Decisão

Adoptar **uma pasta partilhada ao nível do repositório** (`shared/schemas/`) contendo:

1. **Primitivos** partilhados (`email`, `strongPassword`, `telefone`, `objectId`, etc.)
2. **Schemas de domínio** que ambos os lados precisam (auth flows, cliente create/update, etc.)

O backend importa via caminho relativo (`../../shared/schemas/...`). O frontend importa via **alias Vite** (`@shared/schemas/...`).

**Regra fundamental:** apenas **regras de negócio invariantes** ficam no `shared/`. Regras específicas de cada lado continuam no respectivo módulo:

| Tipo de validação | Onde vive |
|---|---|
| `email: z.string().email()` | `shared/` (regra universal) |
| `strongPassword` regex | `shared/` (mesma regra em front/back) |
| `registerSchema` (email + nome + password) | `shared/` |
| `confirmPassword === password` (UX) | Frontend (`registerWithConfirmSchema` compõe o shared) |
| `.strict()` no backend (anti mass assignment) | Backend (compõe o shared) |
| Normalização `telefone.replace(/\D/g, '')` | `shared/` |

```typescript
// shared/schemas/authSchemas.ts
export const email = z.string().trim().toLowerCase().email();
export const strongPassword = z.string().min(8).regex(/[A-Z]/)./*…*/;

export const baseRegisterSchema = z.object({
  nomeEmpresa: z.string().min(2),
  nome: z.string().min(3),
  email,
  password: strongPassword,
  telefone: telefone.optional(),
});

// Backend:
import { baseRegisterSchema } from '../../shared/schemas/authSchemas.js';
export const registerSchema = baseRegisterSchema.strict();

// Frontend:
import { baseRegisterSchema } from '@shared/schemas/authSchemas';
export const registerWithConfirmSchema = baseRegisterSchema
  .extend({ confirmPassword: z.string() })
  .refine(d => d.password === d.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  });
```

---

## Alternativas Consideradas

### 1. Monorepo completo com pnpm workspaces + package `@marcai/schemas`

- **Vantagem:** solução "industrial" — versionamento independente, dependências explícitas, `types` partilhados via package publicado
- **Desvantagem:** conversão significativa (reconfigurar tooling, CI, build); overhead em projecto com 1 app backend + 1 app frontend
- **Descartada** — overkill para 2 pacotes

### 2. Publicar package privado em npm (npm org + workspace)

- **Vantagem:** isolamento total, versionamento semântico entre front/back
- **Desvantagem:** custo operacional (publicar a cada mudança, gerir versões, acesso); npm org privada é paga
- **Descartada** — custo > benefício

### 3. Manter duplicado + extrair primitivos comuns para cada lado

- **Vantagem:** zero mudanças de estrutura
- **Desvantagem:** continua duplicação dos schemas de domínio (registerSchema, loginSchema); mitiga sintoma mas não causa
- **Descartada** — adia o problema

### 4. Pasta `shared/` ao nível do repositório (decisão adoptada)

- **Vantagem:** zero reconfiguração, Vite já suporta aliases, backend já importa relativo; funciona HOJE com o layout actual
- **Desvantagem:** não há enforcement de fronteiras (alguém pode importar `shared/` do frontend via relativo em vez do alias); requer disciplina
- **Adoptada** — menor custo de mudança para obter 80% do valor da solução "correcta"

---

## Consequências

### Positivas

- **Single source of truth** para regras de negócio duplicadas
- **Actualizações atómicas** — mudar regra de password uma vez afecta os dois lados
- **Mensagens consistentes** ao utilizador (mesma string de erro)
- **Preparação para TS:** quando o backend migrar para TypeScript, `z.infer` dá tipos idênticos aos do frontend
- **Facilita futuros clientes** (mobile app, CLI) — reutilizam os mesmos schemas

### Negativas / Trade-offs

- **Versão Zod acoplada** — ambos os lados ficam obrigados a manter a mesma major version de Zod (hoje 4.x); mitigação: pinar versão em `shared/package.json` ou documentar
- **Disciplina de fronteiras** — `shared/` não deve importar código específico de backend (mongoose, express) nem de frontend (react, dom). Apenas dependências universais (`zod`, `luxon` se necessário). Violação partiria builds
- **Refactor de imports** — ao adoptar, todos os schemas que hoje vivem duplicados precisam de ser movidos e importados; esforço pontual mas não trivial (~1 sessão por família de schemas)

---

## Plano de migração (quando implementar)

**Pré-requisitos:**
- Zod em ambos os lados na mesma major version (✅ Zod 4 nos dois hoje)
- Suite de testes verde para detectar regressões (✅ 135/135 pass)

**Passos:**

1. Criar pasta `shared/schemas/` na raiz do repositório
2. Criar `shared/package.json` com `zod` como peer dependency (se quisermos versionar) ou apenas `.js` files importáveis directamente
3. Adicionar alias ao `laura-saas-frontend/vite.config.ts`:
   ```ts
   resolve: { alias: { '@shared': path.resolve(__dirname, '../shared') } }
   ```
4. Migrar por família, começando pela com maior duplicação real (ex: `authSchemas`):
   - Extrair primitivos (`email`, `strongPassword`) para `shared/schemas/primitives.js`
   - Extrair `baseRegisterSchema`, `baseLoginSchema` para `shared/schemas/authSchemas.js`
   - Backend compõe com `.strict()` por cima
   - Frontend compõe com `confirmPassword` e mensagens de UX por cima
5. Correr suite do backend + `npm run build` do frontend entre cada família para detectar regressões cedo
6. Documentar a regra em `.claude/rules/` (nova secção em `express-middlewares.md` + nova regra no frontend sobre como usar alias)

**Ordem sugerida das famílias (do mais ao menos valor):**

1. `authSchemas` — maior sobreposição hoje
2. `clienteSchemas` — telefone e nome são partilhados
3. Primitivos de financeiro (valores monetários, ObjectId) — reutilizáveis em muitas features

---

## Quando reabrir esta decisão

- **Se virarmos microserviços** (ver ADR-011) — cada serviço deixa de aceder a `shared/` por caminho relativo. Passa a ser npm package ou duplicação aceite entre serviços.
- **Se Zod 5 sair com breaking changes** — necessidade de manter versão consistente pode forçar a revisão
- **Se a divergência silenciosa causar o primeiro bug real em produção** — prioridade sobe

---

## Links e Referências

- **Estado actual:** Zod adoptado nos 7 módulos de domínio do backend (2026-04-24)
- **Ficheiros afectados (quando implementar):**
  - Novo: `shared/schemas/*.js`
  - Modificar: todos os `src/modules/<X>/<X>Schemas.js` (backend) e `laura-saas-frontend/src/schemas/validationSchemas.js` (frontend)
  - Modificar: `laura-saas-frontend/vite.config.ts` (alias)
- **ADRs relacionados:**
  - [ADR-011: Modular Monolith](./ADR-011-modular-monolith-agendamento-financeiro.md) — partilha é ortogonal mas importante para consistência dentro do monolith
  - [ADR-010: Express 4 REST Framework](./ADR-010-express-4-rest-framework.md) — contrato de resposta fixo complementa validação partilhada
