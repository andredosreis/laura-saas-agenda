# ADR-020: Limite Explícito de 100 em Listagens de Clientes — Trajectória até Busca Server-Side

**Status:** ✅ Accepted — Implementação Fase 1 concluída
**Data:** 2026-04-27
**Módulo:** API
**Autor:** André dos Reis
**Score de Impacto:** 80 (Médio)

---

## Contexto

O endpoint `GET /api/clientes` (ver `src/modules/clientes/clienteController.js:5-7`) tem paginação Mongoose com defaults conservadores:

```javascript
const page = Math.max(1, parseInt(req.query.page) || 1);          // default 1
const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)); // default 20, máximo 100
const skip = (page - 1) * limit;
```

Ordem: `.sort({ createdAt: -1 })` — mais recentes primeiro.

### Bug que motivou esta ADR

Em **2026-04-27**, a Laura reportou que clientes antigos (ex: "Célia Gomes") **não apareciam na lista** de `/clientes`, mas ao tentar registá-los novamente o backend respondia 409 (telefone duplicado).

**Causa raiz:**
- Frontend chamava `api.get('/clientes')` sem `?limit=...`
- Backend devolvia os 20 mais recentes (`createdAt desc`)
- Clientes cadastrados há mais tempo ficavam fora dessa janela
- A validação de duplicado (`Cliente.findOne({ tenantId, telefone })`) corre sobre **toda** a coleção → consistência preservada no servidor mas invisível ao utilizador

**Impacto secundário:** o mesmo problema afectava **dropdowns** em `VenderPacote.jsx`, `CriarAgendamento.jsx` e `EditarAgendamento.jsx` — clientes antigos não eram seleccionáveis para venda ou agendamento.

### Porque o default de 20 existe e é correcto

- Optimiza tempo de resposta para use-case mais comum (consulta paginada)
- Reduz payload em redes lentas (mobile, web push, etc.)
- Está alinhado com `.claude/rules/express-common-conventions.md` ("Máximo 100 por página")
- **Não deve ser aumentado no servidor** — esse limite protege contra clientes maliciosos pedirem `?limit=99999`

### Volume actual e crescimento esperado

- Tenant da Laura tem ~30–50 clientes (Abril 2026)
- Crescimento estimado: +10/mês conforme leads convertem
- Horizonte de 1 ano: 100–200 clientes

---

## Decisão

Adoptar uma **trajectória em três fases** para o problema de listagens grandes:

| Fase | Quando | Solução | Custo |
|---|---|---|---|
| **1 — agora** | Resolver o bug imediato (volume <100) | Frontend pede explicitamente `?limit=100` em todas as listagens "para escolher" (lista de clientes + dropdowns). Banner amarelo se total no DB > carregados | 1 sessão (já implementado) |
| **2 — quando passar dos 100 clientes** | Quando o banner começar a aparecer regularmente | Subir o limit do **backend** de 100 → **500** numa linha (ainda dentro de zona segura para Mongo + JSON) e actualizar `?limit=500` no frontend | <1 hora |
| **3 — quando passar dos 500 clientes OU latência aumentar** | Acima de ~500 ou quando p95 de carregamento subir | Implementar **busca server-side**: campo `search` no controller (`{ $or: [{ nome: regex }, { telefone: regex }] }`) + index de texto. Frontend muda para input com debounce e listagem paginada real | 1–2 sessões |

**Fase actual:** 1 (concluída)

### Implementação Fase 1 (já feita)

**Frontend** — passar `?limit=100` em todos os pontos onde o utilizador escolhe um cliente de uma lista completa:

| Ficheiro | Endpoint chamado |
|---|---|
| `laura-saas-frontend/src/pages/Clientes.jsx` | `GET /clientes?limit=100` |
| `laura-saas-frontend/src/pages/VenderPacote.jsx` | `GET /clientes?limit=100` + `GET /pacotes?limit=100` |
| `laura-saas-frontend/src/pages/CriarAgendamento.jsx` | `GET /clientes?limit=100` |
| `laura-saas-frontend/src/pages/EditarAgendamento.jsx` | `GET /clientes?limit=100` + `GET /pacotes?limit=100` |

**Banner de aviso** em `Clientes.jsx`: mostra "A mostrar X de Y clientes. Para encontrar um cliente específico, usa a pesquisa abaixo." sempre que `pagination.total > clientes.length`. A pesquisa client-side já filtra sobre os 100 carregados.

**Backend** — sem mudança nesta fase. O limit `Math.min(100, ...)` mantém-se como guarda-rail.

### Quando avançar para Fase 2 (limit 500)

**Critério de gatilho** — qualquer um destes:
- O banner amarelo aparece em uso normal (não só edge case)
- Total de clientes do tenant > 100
- Reportes de "cliente X não aparece"

**Como executar a Fase 2:**

1. Em `src/modules/clientes/clienteController.js:6`, mudar:
   ```javascript
   const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
   ```
   para:
   ```javascript
   const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 20));
   ```

2. Verificar se outras listagens usadas em dropdowns têm o mesmo defaut (Pacote `getAllPacotes`, Agendamento `getAllAgendamentos` se aparecer em dropdown). Aplicar o mesmo limit cap.

3. Frontend: substituir `?limit=100` por `?limit=500` nos 4 ficheiros listados acima.

4. **Validar performance**: medir p95 de `GET /clientes?limit=500` no Render — esperado <500ms para tenant com 500 clientes (índice `tenantId` resolve a query rapidamente). Se exceder 800ms, saltar directamente para Fase 3.

5. Documentar no commit message: "chore: bump clientes listing limit to 500 (ADR-020 Fase 2)".

### Quando avançar para Fase 3 (busca server-side)

**Critério de gatilho:**
- Total > 500 clientes (qualquer tenant)
- p95 de listagem > 800ms
- Utilizadores reportam "tenho de fazer scroll/abrir uma página inteira para encontrar um cliente"

**Esboço da Fase 3** (mais detalhe em ADR futura quando implementar):

1. **Backend** (`getAllClientes`) — aceitar `?search=string`:
   ```javascript
   const filter = { tenantId: req.tenantId };
   if (req.query.search) {
     const regex = new RegExp(req.query.search, 'i');
     filter.$or = [{ nome: regex }, { telefone: regex }];
   }
   ```
   E adicionar índice de texto se o volume justificar:
   ```javascript
   clienteSchema.index({ tenantId: 1, nome: 'text' });
   ```

2. **Frontend** — input de pesquisa com debounce (300ms) que faz fetch ao backend, em vez de filtrar localmente.

3. **Pagination UI** real (botões anterior/próxima ou scroll infinito), em vez de carregar tudo.

---

## Alternativas Consideradas

### 1. Aumentar o **default** de 20 para 100 no backend

- **Vantagem:** zero mudanças no frontend
- **Desvantagem:** afecta TODAS as chamadas a `/clientes` (incluindo APIs públicas, integrações, scripts), aumentando payload sem justificação para use cases que só precisam de poucos. Quebra a convenção `.claude/rules/express-common-conventions.md` ("default 20")
- **Descartada** — risco de regressão noutros consumidores

### 2. Frontend faz **paginação infinita** (carrega 20, scroll carrega +20…)

- **Vantagem:** escala bem para qualquer volume
- **Desvantagem:** custo de UI elevado nesta fase do produto (ainda <100 clientes); UX confusa para listas curtas; para os dropdowns (Vender Pacote, etc.) **não funciona** — utilizador precisa de ver TODOS para escolher
- **Descartada por agora** — solução boa mas desproporcionada para o volume actual

### 3. Implementar **busca server-side directamente** (saltar para Fase 3)

- **Vantagem:** solução definitiva
- **Desvantagem:** custo de 1–2 sessões; mudança em 4 ficheiros frontend + controller + index Mongo + testes; útil mas urgência baixa enquanto volume <500
- **Adiada para Fase 3** — quando o critério de gatilho for atingido

### 4. Solução adoptada — Fase 1 + escalada gradual

- **Vantagem:** resolve o bug imediato com mudança mínima (4 ficheiros, 1 query string); banner avisa quando precisamos da próxima fase; escalada documentada
- **Desvantagem:** não é solução definitiva — teremos de tocar nestes ficheiros novamente em Fase 2 e 3
- **Adoptada** — entregar valor agora, escalar quando necessário

---

## Consequências

### Positivas

- **Bug resolvido sem risco**: 4 ficheiros tocados, mudança trivial, build verde
- **Visibilidade**: banner amarelo torna o limite explícito ao utilizador (não há "magic limit")
- **Trajectória clara**: Fase 2 e 3 documentadas, com critérios de gatilho objectivos
- **Backend protegido**: o cap `Math.min(100, ...)` continua a defender contra `?limit=99999`
- **Convenção respeitada**: `.claude/rules/express-common-conventions.md` (default 20, máximo 100) mantém-se válida; o frontend é que pede explicitamente o que quer

### Negativas / Trade-offs

- **Limite de 100 ainda é hard cap actualmente**: tenants que excederem 100 clientes verão o banner e não conseguirão ver todos sem busca
- **Mais 4 ficheiros tocados em cada fase**: a próxima vez que mexermos isto (Fase 2 → 500), são as mesmas 4 query strings; em Fase 3 são reescritas para usar `?search=`
- **Banner só aparece em `/clientes`** — os dropdowns (Vender Pacote, etc.) não têm banner; um cliente fora dos 100 não dá feedback visual ao utilizador. Mitigação: em Fase 3 a busca server-side resolve isto naturalmente

### Riscos monitorizados

- **Crescimento súbito de leads → clientes** (ex: campanha de marketing) pode levar à Fase 2 mais cedo do que esperado. Mitigação: Sentry alerta se mais de 5 banners por sessão (telemetria a adicionar quando relevante)
- **Tenants enterprise** (futuro multi-clínica) podem ter >500 clientes desde o início. Mitigação: quando este caso de uso surgir, ir directo à Fase 3

---

## Plano de validação (já executado para Fase 1)

1. ✅ `npm run build` no frontend — sem erros
2. ✅ Verificação manual: `/clientes` carrega 100 (em vez de 20); Célia Gomes aparece
3. ⏳ Verificação dos dropdowns: utilizador deve confirmar que Vender Pacote, Criar Agendamento e Editar Agendamento mostram clientes antigos
4. ⏳ Verificação do banner: criar 101 clientes em ambiente de teste e confirmar que o banner amarelo aparece com a contagem correcta

---

## Recomendações operacionais

### Para developers que adicionem novas listagens "para escolher"

Sempre que adicionares uma chamada a uma listagem que o **utilizador usa para seleccionar** (dropdown, lista completa de clientes, lista de pacotes para escolher), passar **explicitamente** `?limit=100` (ou o limit cap actual). Não confiar no default de 20.

```javascript
// ❌ errado — só recebe 20
const res = await api.get('/clientes');

// ✅ correcto — recebe até 100, explícito
const res = await api.get('/clientes?limit=100');
```

Para listagens **paginadas** (relatórios, históricos onde o utilizador navega), o default de 20 está correcto e deve manter-se.

### Para auditar antes de cada release

```bash
grep -rn "api.get.*clientes\|api.get.*pacotes" laura-saas-frontend/src \
  | grep -v "limit="
```

Qualquer match precisa de revisão: ou justifica o default 20 (paginação), ou precisa de `?limit=100`.

### Para escalar para Fase 2

Procurar nestes pontos antes de subir o limit:

```bash
# Backend
grep -rn "Math.min(100" src/modules/

# Frontend
grep -rn "?limit=100" laura-saas-frontend/src/
```

Trocar 100 → 500 em ambos. Validar build, testar em staging com tenant de >100 clientes.

### Para escalar para Fase 3

Antes de implementar busca, abrir nova ADR (ADR-021+) que documente:
- Decisão: regex Mongo simples vs índice texto vs Atlas Search
- Decisão: como tratar acentos (Célia ↔ Celia)
- Decisão: debounce do frontend (300ms é bom default)
- Plano de migração da paginação actual

---

## Referências

- `src/modules/clientes/clienteController.js:2-30` — `getAllClientes`
- `.claude/rules/express-common-conventions.md` — Paginação (default 20, máximo 100)
- `laura-saas-frontend/src/pages/Clientes.jsx` — Frontend que aplica `?limit=100` + banner
- ADR-011 — Modular Monolith (contexto da estrutura `src/modules/clientes/`)
