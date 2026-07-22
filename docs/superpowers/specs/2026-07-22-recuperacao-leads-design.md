# Design — Recuperação de Leads ("carrinho abandonado")

**Data:** 2026-07-22
**Autor:** André dos Reis (ideia) + Claude (desenho)
**Estado:** Aprovado no brainstorm — pronto para plano de implementação
**Módulo:** LEADS (`src/modules/leads/`) + Frontend
**Relacionado:** ADR-025 (WhatsApp oficial vs Baileys), ADR-031/F09 (consentimento de comunicações), `docs/planejamento/CHECKLIST-PENDENCIAS.md`

---

## 1. Problema

A dona da clínica não consegue responder a três perguntas que valem dinheiro:

1. **Quantos leads reais chegaram?** Hoje qualquer número desconhecido que manda mensagem no WhatsApp vira um `Lead` (confirmado em `src/modules/messaging/controllers/webhookController.js` → `processInbound`). Engano, fornecedor, entregador e spam entram na mesma contagem dos interessados de verdade. Não existe forma de separar.
2. **Por que não fecharam?** O campo `Lead.perdido.motivo` existe, mas é texto livre e o Kanban aceita `'sem motivo'` como fallback (`LeadsKanban.tsx:95`). Não dá para agrupar, filtrar nem contar.
3. **Quem vale a pena chamar de volta?** Quem some no meio da conversa — o "carrinho abandonado" mais valioso — nunca é marcado como perdido por ninguém. Fica parado em `em_conversa` para sempre, invisível.

Consequência: não há recuperação de leads. Cada contacto que esfria é dinheiro perdido em silêncio.

## 2. Objetivo

Dar à clínica uma **lista acionável de pessoas para chamar de volta**, com nome, telefone e motivo — visível na aplicação e exportável em CSV — e os números que mostram de onde vêm as perdas.

**Critério de sucesso:** a dona da clínica abre uma tela, vê quem sumiu e por quê, e consegue chamar essas pessoas no WhatsApp sem sair do fluxo nem redigitar números.

## 3. Decisões tomadas no brainstorm

| Decisão | Escolha | Porquê |
|---|---|---|
| População do relatório | Perdidos **+** esfriados | Quem some sozinho é o grupo mais valioso e hoje é invisível |
| Captura do motivo | Lista fixa + nota livre | Texto livre não agrupa; enum dá gráfico e filtro |
| Entrega | CSV **+** lista acionável no app | Baixar planilha e redigitar número por número é fricção |
| Disparo em massa | **Rejeitado** | Baileys não-oficial: caminho curto para banir o número (ADR-025); e exige opt-in registado (F09) |

---

## 4. Modelo de dados

### 4.1 Motivos padronizados

Novo em `src/modules/leads/pipelineConstants.js`:

```js
export const LEAD_MOTIVOS_PERDA = Object.freeze({
  preco:         'Achou caro',
  horario:       'Horário não serviu',
  concorrencia:  'Foi para outro sítio',
  pesquisando:   'Só estava a pesquisar',
  localizacao:   'Longe / deslocação',
  sem_resposta:  'Parou de responder',
  nao_e_lead:    'Não era cliente potencial',
  outro:         'Outro',
});

export const LEAD_MOTIVO_VALUES = Object.freeze(Object.keys(LEAD_MOTIVOS_PERDA));
```

`nao_e_lead` é o que resolve a pergunta 1: separa contactos que chegaram de leads reais.

### 4.2 Alterações no `Lead`

```js
perdido: {
  motivoCodigo: { type: String, enum: LEAD_MOTIVO_VALUES },  // NOVO
  motivo:       { type: String, trim: true },                 // passa a ser a nota livre
  em:           { type: Date },
},

recuperacao: {                                                // NOVO
  contactadoEm:  { type: Date },
  contactadoPor: { type: Schema.Types.ObjectId, ref: 'User' },
  resultado: {
    type: String,
    enum: ['pendente', 'sem_resposta', 'respondeu', 'reagendou', 'recusou'],
  },
},
```

**Validação vive no service, não no schema.** `motivoCodigo` não leva `required` no Mongoose — isso quebraria documentos já existentes. `transitionStage()` passa a exigir um `motivoCodigo` válido quando `toStage === 'perdido'`, e exige `motivo` (nota) não-vazio quando `motivoCodigo === 'outro'`.

### 4.3 Índices

Já existe e serve à regra do esfriado:
`{ tenantId: 1, status: 1, ultimaInteracao: -1 }`

A acrescentar:
- `{ tenantId: 1, createdAt: -1 }` — filtro do relatório por período de chegada
- `{ tenantId: 1, 'perdido.motivoCodigo': 1 }` — agregação por motivo

### 4.4 Migração (backfill)

Script idempotente em `scripts/migrations/`, com `--dry-run` por omissão:

- Leads com `status: 'perdido'` e `perdido.motivo` preenchido, sem `motivoCodigo` → `motivoCodigo: 'outro'`, texto preservado na nota
- Leads com `perdido.motivo === 'sem motivo'` → `motivoCodigo: 'outro'`, nota limpa para `null`
- Corre por tenant (DB-per-tenant), reportando contagens antes de escrever

⚠️ O `.env` local aponta para o cluster de **produção**. Correr com `--dry-run` primeiro e confirmar o cluster antes de escrever.

---

## 5. Regra do "esfriado"

Lead em `novo`, `em_conversa` ou `qualificado` cuja `ultimaInteracao` seja anterior a `hoje - N dias`.

- `N` = **14** por omissão (o valor que a documentação de `LEAD_STAGES` já assume: *"perdido — recusou, desistiu ou inactivo > 14 dias"*), configurável por tenant
- **Derivado na leitura, nunca gravado.** Se a pessoa responder amanhã, `ultimaInteracao` sobe e ela sai da lista sozinha — sem job, sem estado a sincronizar
- O motivo apresentado é `sem_resposta` + a etapa onde parou: *"Parou de responder em Qualificado"*
- Cálculo de datas com Luxon em `Europe/Lisbon`, nunca `new Date()` para lógica de negócio

**Excluídos sempre:** `convertido` e qualquer lead com `perdido.motivoCodigo === 'nao_e_lead'`.

---

## 6. Backend

### 6.1 `GET /api/v1/leads/recuperacao`

Query: `de`, `ate`, `grupo` (`perdidos` | `esfriados` | `todos`), `motivoCodigo`, `origem`, `page`, `limit` (máx. 100).

```json
{
  "success": true,
  "data": {
    "resumo": {
      "contactosRecebidos": 84,
      "leadsReais": 71,
      "descartados": 13,
      "convertidos": 22,
      "perdidos": 19,
      "esfriados": 30,
      "taxaConversao": 0.31,
      "porMotivo": [ { "codigo": "preco", "label": "Achou caro", "total": 8 } ]
    },
    "leads": [ /* ... */ ]
  },
  "pagination": { "total": 49, "page": 1, "pages": 3, "limit": 20 }
}
```

`resumo` é calculado por aggregation sobre o período; `leads` é a lista paginada dos recuperáveis.

### 6.2 `GET /api/v1/leads/recuperacao/export.csv`

Mesmos filtros, sem paginação, teto de **5000 linhas**.

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="recuperacao-leads-YYYY-MM-DD.csv"`
- **Exceção declarada ao contrato da API:** esta rota devolve CSV, não `{ success, data }`. Erros continuam a devolver JSON no formato normal
- Se o teto for atingido, responder também com `X-Export-Truncated: true` e o frontend mostra aviso — **nunca truncar em silêncio**

**Colunas:** Nome · Telefone · Origem · Etapa onde parou · Motivo · Nota · 1º contacto · Último contacto · Dias parado · Interesse · Score · Já contactado

**Dois detalhes que o export existente (`Transacoes.jsx`) não trata e que este tem de tratar:**

1. **BOM UTF-8** (`﻿`) no início do ficheiro — sem ele o Excel português abre os acentos partidos
2. **Sanitização contra CSV injection** — o nome vem do WhatsApp e é controlado pelo contacto. Qualquer campo que comece por `=`, `+`, `-`, `@`, TAB ou CR é prefixado com `'`. Sem isto, um lead chamado `=HYPERLINK(...)` executa ao abrir a planilha

Separador `;` e aspas duplas escapadas, seguindo o padrão do export existente.

### 6.3 `PATCH /api/v1/leads/:id/recuperacao`

Body: `{ resultado }`. Grava `contactadoEm: agora` e `contactadoPor: req.user._id`.

O lead sai da lista de recuperação durante **30 dias** após ser contactado — sem isto a mesma pessoa é chamada todas as semanas.

### 6.4 Routing

Em `src/modules/leads/leadRoutes.js`:

```js
// ⚠️ ANTES de router.get('/:id') — senão o Express lê "recuperacao" como um id
router.get('/recuperacao', requirePermission('verLeads'), validate(...), getRecuperacao);
router.get('/recuperacao/export.csv', requirePermission('verLeads'), validate(...), exportRecuperacaoCsv);
```

Permissão `verLeads` nas três rotas. Todas as queries com `{ tenantId: req.user.tenantId }`.

### 6.5 Onde vive o código

O `leadController.js` já é grande. A lógica de relatório vai para **`src/modules/leads/recuperacaoService.js`** (puro: recebe filtros, devolve resumo + linhas) e a serialização CSV para **`src/modules/leads/csvExport.js`** (puro, testável isoladamente). O controller só orquestra.

---

## 7. Frontend

### 7.1 Modal de "perdido" (alteração)

`LeadsKanban.tsx` — o modal passa a mostrar os 8 motivos como botões, com campo de nota opcional (obrigatório em "Outro"). O fallback `'sem motivo'` é removido: sem escolha, não confirma.

### 7.2 Nova página `/leads/recuperacao`

`laura-saas-frontend/src/pages/RecuperacaoLeads.tsx`

- **Strip de números:** contactos recebidos → leads reais → descartados → convertidos → perdidos → esfriados → taxa de conversão
- **Quebra por motivo** — barras horizontais simples, sem biblioteca de gráficos nova
- **Filtros:** período, grupo, motivo, origem
- **Lista:** nome · telefone · etapa onde parou · motivo · dias parado
- **Por linha:** "Chamar no WhatsApp" e "Marcar como contactado"
- **Topo:** "Exportar CSV"

Design system obrigatório: indigo-500 / purple-500 / slate-900, glass nos cards. Estados de loading e vazio tratados; `api.js` para todas as chamadas.

### 7.3 Link no menu

Adicionar em **`Sidebar.jsx`** (`menuGroupsAll`, grupo de Leads, com gating por `verLeads`) — o `Navbar.jsx` é código morto e não é renderizado pelo `ProtectedLayout`. Rota protegida registada em `App.tsx`.

### 7.4 Link do WhatsApp

`https://wa.me/<E164>?text=<mensagem>`

O telefone é guardado só com dígitos e pode vir sem indicativo. Normalizar antes: 9 dígitos começados por `9` → prefixar `351`. Já com indicativo, usar como está. Se não for normalizável, o botão fica desativado com tooltip em vez de abrir um link partido.

Mensagem sugerida: texto por omissão no frontend, editável no campo antes de enviar. Template configurável por tenant fica registado como dívida (a configuração de negócio muda-se pelo painel, não pela BD).

---

## 8. RGPD

Não bloqueia a entrega, mas define regras que fazem parte do desenho:

- Quem tem `motivoCodigo: 'nao_e_lead'` **nunca** aparece no relatório nem no CSV
- Quando o **F09** (consentimento de comunicações) existir, o opt-out filtra a lista
- Recontactar quem sumiu é mensagem iniciada pelo negócio. A base defensável é o **interesse legítimo** — foi a pessoa que procurou a clínica — mas isto está entre as questões já enviadas ao jurista (`docs/operacoes/rgpd-matriz-juridica.md`)
- Leads perdidos há mais de X meses saem do relatório e entram no âmbito do job de retenção (**F08**)
- O export é uma operação de tratamento: registar quem exportou e quando (útil também como prova para o DPA)

---

## 9. Testes

Jest + supertest + `mongodb-memory-server`, em `tests/`.

**Obrigatórios:**
- Isolamento multi-tenant no relatório **e** no CSV — tenant B não vê nada do tenant A (404 / conjunto vazio, nunca 403)
- Regra dos 14 dias nas bordas: 13 dias fora, 14 dias dentro
- Lead esfriado que responde volta a sair da lista
- `nao_e_lead` excluído de ambas as rotas
- Permissão negada sem `verLeads`
- `transitionStage` recusa `perdido` sem `motivoCodigo`, e recusa `outro` sem nota
- CSV: acentos legíveis com BOM; nome `=HYPERLINK("http://x")` sai prefixado com `'`
- Teto de 5000 devolve `X-Export-Truncated`
- Lead contactado há 10 dias não aparece; há 40 dias volta a aparecer

---

## 10. Ondas

**W1 — o que foi pedido** (backend + dados)
1. `LEAD_MOTIVOS_PERDA` + campos no modelo + índices
2. Validação em `transitionStage`
3. Script de backfill (dry-run primeiro)
4. `recuperacaoService.js` + `csvExport.js`
5. As duas rotas GET + testes
6. Motivos no modal do Kanban

**W2 — a operação** (tela + medição)
7. Página `RecuperacaoLeads.tsx` + link no Sidebar
8. Botão WhatsApp com normalização E.164
9. `PATCH /:id/recuperacao` + janela de 30 dias

W1 já entrega o relatório e o download. W2 é o que transforma a lista em rotina.

---

## 11. Fora de âmbito (YAGNI)

- Disparo automático em massa — risco de ban (ADR-025) e exige F09
- IA a inferir o motivo das conversas dos esfriados — evolução natural **depois**, e é precisamente a base de dados que esta feature cria que a torna possível
- Editor de templates da mensagem de recuperação
- Análise de coortes / dashboards avançados

---

## 12. Dívida registada

- Template da mensagem de recuperação configurável por tenant no painel
- `N` dias do esfriado configurável na UI (arranca como constante por tenant)
- IA a sugerir motivo dos esfriados (fase 2)
- Unificar o export CSV do `Transacoes.jsx` com o `csvExport.js` — o existente não tem BOM nem sanitização
