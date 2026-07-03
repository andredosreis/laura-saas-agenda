# Follow-up Pós-Sessão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando uma sessão termina, enviar WhatsApp ao cliente ~5 min depois a perguntar como correu; a resposta apura presença (Compareceu/Não Compareceu) e o agente IA propõe nova marcação ou renovação de pacote.

**Architecture:** Job BullMQ `follow-up-pos-sessao` (delay = dataHora + duração + 5 min) na fila `notifications` existente, com envio de template determinístico pelo worker Node. A resposta do cliente entra pelo webhook normal e é tratada pelo agente cliente (ia-service Python), que ganha contexto de follow-up pendente + 2 tools novas (`registar_presenca`, `sinalizar_interesse_renovacao`) apoiadas em 3 endpoints internos novos.

**Tech Stack:** Node 18 ESM + Express 4 + Mongoose 8 + BullMQ + Luxon; Python 3.12 FastAPI/LangChain; Jest + supertest + mongodb-memory-server; pytest (asyncio mode auto).

**Spec:** `docs/superpowers/specs/2026-07-02-follow-up-pos-sessao-design.md`

## Global Constraints

- **Pipeline de lembretes existente é INTOCADO**: não alterar `buildMensagem`, `lembreteObsoleto`, `registarNaThread` nem os handlers `confirmacao`/`lembrete-antecipado`/`lembrete-1h`/`alerta-admin-pendente` em `src/workers/notificationWorker.js` (apenas ADICIONAR o dispatch do tipo novo).
- Toda query Mongoose em dados de tenant inclui `tenantId`; acesso cruzado → `404`, nunca `403`.
- Contrato de resposta fixo: `res.json({ success: true, data })` / `res.status(4xx).json({ success: false, error })`.
- Backend ESM: extensão `.js` obrigatória em todos os imports.
- Nunca `await` em loop — usar `Promise.all`.
- Datas com Luxon, zona `'Europe/Lisbon'`; nunca `new Date()` em lógica de negócio (excepto timestamps de gravação).
- Testes backend em `tests/` (nunca `src/__tests__/`), com `mongodb-memory-server`; serviços externos sempre mockados (`evolutionClient`).
- jobIds BullMQ com separador `-`, NUNCA `:` (BullMQ rejeita).
- Gating de flags: semântica "ausente = activo" — só bloquear quando o campo é explicitamente `false` (coerente com `iaGlobalAtiva` default-true, ADR-027).
- Python: `ruff check .` e `ruff format .` limpos; testes em `ia-service/tests/`.
- **Git:** cada task termina com um commit local (sem push). Preferência do André: nenhum comando git além dos passos aqui aprovados.

---

### Task 1: Campos de modelo (Agendamento.followUp, Tenant flag, índice)

**Files:**
- Modify: `src/models/Agendamento.js` (subdoc `followUp` + índice)
- Modify: `src/models/Tenant.js` (flag `followUpPosSessaoAtivo` em `configuracoes`, junto de `iaGlobalAtiva` ~linha 102)
- Test: `tests/followup-models.test.js`

**Interfaces:**
- Produces: `Agendamento.followUp = { enviadoEm: Date|null, respostaEm: Date|null, feedback: String|null }`; `Tenant.configuracoes.followUpPosSessaoAtivo: Boolean default true`; índice `{ tenantId: 1, cliente: 1, 'followUp.enviadoEm': -1 }`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/followup-models.test.js
// Campos novos do follow-up pós-sessão: Agendamento.followUp + Tenant flag.
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

describe('Modelos — follow-up pós-sessão', () => {
  it('Tenant.configuracoes.followUpPosSessaoAtivo tem default true', async () => {
    const tenant = await Tenant.create({
      nome: 'Clínica T1',
      slug: 'clinica-t1',
      plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    });
    expect(tenant.configuracoes.followUpPosSessaoAtivo).toBe(true);
  });

  it('Agendamento aceita e persiste o subdocumento followUp', async () => {
    const tenant = await Tenant.create({
      nome: 'Clínica T2',
      slug: 'clinica-t2',
      plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    });
    const { Agendamento } = getModels(getTenantDB(String(tenant._id)));
    const enviadoEm = new Date();
    const ag = await Agendamento.create({
      tenantId: tenant._id,
      dataHora: new Date(Date.now() + 60 * 60 * 1000),
      status: 'Agendado',
      followUp: { enviadoEm, feedback: 'correu óptimo' },
    });
    const reloaded = await Agendamento.findById(ag._id).lean();
    expect(reloaded.followUp.enviadoEm.getTime()).toBe(enviadoEm.getTime());
    expect(reloaded.followUp.respostaEm).toBeNull();
    expect(reloaded.followUp.feedback).toBe('correu óptimo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=followup-models`
Expected: FAIL — `followUpPosSessaoAtivo` undefined e/ou `followUp` não persistido (strict schema descarta o campo).

- [ ] **Step 3: Write minimal implementation**

Em `src/models/Agendamento.js`, adicionar após o bloco `iaAckEm` (~linha 153):

```javascript
  // Follow-up pós-sessão (spec 2026-07-02): marcador de idempotência do job
  // BullMQ e da resposta do cliente. `enviadoEm` set pelo worker no envio;
  // `respostaEm`/`feedback` set pelo endpoint interno /presenca quando o
  // agente IA interpreta a resposta.
  followUp: {
    enviadoEm: { type: Date, default: null },
    respostaEm: { type: Date, default: null },
    feedback: { type: String, trim: true, maxlength: 500, default: null },
  },
```

E junto dos índices Phase 2B (~linha 207):

```javascript
// Follow-up pós-sessão: lookup do follow-up pendente por cliente (janela 24h)
agendamentoSchema.index({ tenantId: 1, cliente: 1, 'followUp.enviadoEm': -1 });
```

Em `src/models/Tenant.js`, dentro de `configuracoes`, logo a seguir a `iaGlobalAtiva` (~linha 102):

```javascript
        // Follow-up pós-sessão (kill-switch por tenant, independente do master
        // switch da IA). Ausente = activo — só bloqueia quando explicitamente false.
        followUpPosSessaoAtivo: { type: Boolean, default: true }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=followup-models`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/models/Agendamento.js src/models/Tenant.js tests/followup-models.test.js
git commit -m "feat(followup): campos followUp no Agendamento + flag followUpPosSessaoAtivo no Tenant"
```

---

### Task 2: Lógica pura — avaliarFollowUp + buildFollowUpMensagem

**Files:**
- Create: `src/workers/followUpPosSessao.js`
- Test: `tests/followup-avaliar.test.js`

**Interfaces:**
- Produces:
  - `avaliarFollowUp({ agendamento, cliente, tenant, compra, jobDataHoraISO })` → `{ enviar: false, motivo: string }` ou `{ enviar: true, variante: 'normal'|'falta', pacote: { nome: string, restantesAposEsta: number } | null }`
  - `buildFollowUpMensagem({ clienteNome, variante, pacote, clinicaNome })` → `string`
- Consumes: nada (funções puras; recebem docs `.lean()`).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/followup-avaliar.test.js
// Lógica pura de decisão + template do follow-up pós-sessão (sem DB).
import { DateTime } from 'luxon';
import { avaliarFollowUp, buildFollowUpMensagem } from '../src/workers/followUpPosSessao.js';

const ZONA = 'Europe/Lisbon';
const dataHora = DateTime.fromISO('2026-07-02T14:00:00', { zone: ZONA });

const base = () => ({
  agendamento: {
    _id: 'a1',
    cliente: 'c1',
    status: 'Confirmado',
    confirmacao: { tipo: 'confirmado' },
    dataHora: dataHora.toJSDate(),
  },
  cliente: { _id: 'c1', nome: 'Maria', telefone: '351910000000', iaAtiva: true },
  tenant: {
    nome: 'Clínica X',
    configuracoes: { iaGlobalAtiva: true, followUpPosSessaoAtivo: true },
  },
  compra: null,
  jobDataHoraISO: dataHora.toISO(),
});

describe('avaliarFollowUp — skip conditions', () => {
  it('agendamento inexistente → não envia', () => {
    expect(avaliarFollowUp({ ...base(), agendamento: null }).enviar).toBe(false);
  });

  it.each(['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'])('status %s → não envia', (status) => {
    const input = base();
    input.agendamento.status = status;
    expect(avaliarFollowUp(input).enviar).toBe(false);
  });

  it('confirmação rejeitada → não envia', () => {
    const input = base();
    input.agendamento.confirmacao = { tipo: 'rejeitado' };
    expect(avaliarFollowUp(input).enviar).toBe(false);
  });

  it('remarcado (dataHora difere da do job) → não envia', () => {
    const input = base();
    input.agendamento.dataHora = dataHora.plus({ days: 1 }).toJSDate();
    expect(avaliarFollowUp(input).enviar).toBe(false);
    expect(avaliarFollowUp(input).motivo).toBe('remarcado');
  });

  it('sem cliente associado (lead) → não envia', () => {
    const input = base();
    input.agendamento.cliente = null;
    input.cliente = null;
    expect(avaliarFollowUp(input).motivo).toBe('sem_cliente');
  });

  it('followUp.enviadoEm já existe → não envia (idempotência)', () => {
    const input = base();
    input.agendamento.followUp = { enviadoEm: new Date() };
    expect(avaliarFollowUp(input).motivo).toBe('ja_enviado');
  });

  it('iaGlobalAtiva=false → não envia', () => {
    const input = base();
    input.tenant.configuracoes.iaGlobalAtiva = false;
    expect(avaliarFollowUp(input).motivo).toBe('ia_global_off');
  });

  it('followUpPosSessaoAtivo=false → não envia', () => {
    const input = base();
    input.tenant.configuracoes.followUpPosSessaoAtivo = false;
    expect(avaliarFollowUp(input).motivo).toBe('followup_off');
  });

  it('cliente.iaAtiva=false → não envia', () => {
    const input = base();
    input.cliente.iaAtiva = false;
    expect(avaliarFollowUp(input).motivo).toBe('ia_cliente_off');
  });

  it('cliente sem telefone → não envia', () => {
    const input = base();
    input.cliente.telefone = null;
    expect(avaliarFollowUp(input).motivo).toBe('sem_telefone');
  });

  it('flags ausentes (tenant antigo sem campos) → ENVIA (ausente = activo)', () => {
    const input = base();
    input.tenant.configuracoes = {};
    delete input.cliente.iaAtiva;
    expect(avaliarFollowUp(input).enviar).toBe(true);
  });
});

describe('avaliarFollowUp — variantes e matemática do pacote', () => {
  it('status normal sem pacote → variante normal, pacote null', () => {
    const r = avaliarFollowUp(base());
    expect(r).toEqual({ enviar: true, variante: 'normal', pacote: null });
  });

  it('status Não Compareceu (Laura marcou antes) → variante falta', () => {
    const input = base();
    input.agendamento.status = 'Não Compareceu';
    expect(avaliarFollowUp(input).variante).toBe('falta');
  });

  it('sessão NÃO consumida: restantes 3 → restantesAposEsta 2', () => {
    const input = base();
    input.compra = { sessoesRestantes: 3, historico: [], pacote: { nome: 'Pack Relax' } };
    expect(avaliarFollowUp(input).pacote).toEqual({ nome: 'Pack Relax', restantesAposEsta: 2 });
  });

  it('sessão JÁ consumida (Laura marcou Realizado): restantes 2 → restantesAposEsta 2', () => {
    const input = base();
    input.compra = {
      sessoesRestantes: 2,
      historico: [{ agendamento: 'a1' }],
      pacote: { nome: 'Pack Relax' },
    };
    expect(avaliarFollowUp(input).pacote.restantesAposEsta).toBe(2);
  });

  it('última sessão não consumida: restantes 1 → restantesAposEsta 0', () => {
    const input = base();
    input.compra = { sessoesRestantes: 1, historico: [], pacote: { nome: 'Pack Relax' } };
    expect(avaliarFollowUp(input).pacote.restantesAposEsta).toBe(0);
  });

  it('nunca devolve restantes negativos', () => {
    const input = base();
    input.compra = { sessoesRestantes: 0, historico: [], pacote: { nome: 'Pack' } };
    expect(avaliarFollowUp(input).pacote.restantesAposEsta).toBe(0);
  });
});

describe('buildFollowUpMensagem', () => {
  const baseMsg = { clienteNome: 'Maria', clinicaNome: 'Clínica X' };

  it('variante normal sem pacote: pergunta como correu, sem proposta', () => {
    const m = buildFollowUpMensagem({ ...baseMsg, variante: 'normal', pacote: null });
    expect(m).toContain('Maria');
    expect(m).toContain('como correu');
    expect(m).toContain('_Clínica X_');
    expect(m).not.toMatch(/sessões|sessão no seu pacote|renovar/i);
  });

  it('com sessões restantes: propõe marcar a próxima (plural)', () => {
    const m = buildFollowUpMensagem({
      ...baseMsg,
      variante: 'normal',
      pacote: { nome: 'Pack Relax', restantesAposEsta: 2 },
    });
    expect(m).toContain('2 sessões');
    expect(m).toMatch(/próxima/i);
  });

  it('com 1 sessão restante: singular', () => {
    const m = buildFollowUpMensagem({
      ...baseMsg,
      variante: 'normal',
      pacote: { nome: 'Pack Relax', restantesAposEsta: 1 },
    });
    expect(m).toContain('1 sessão');
    expect(m).not.toContain('1 sessões');
  });

  it('última sessão (restantesAposEsta 0): menciona fim do pacote e renovação', () => {
    const m = buildFollowUpMensagem({
      ...baseMsg,
      variante: 'normal',
      pacote: { nome: 'Pack Relax', restantesAposEsta: 0 },
    });
    expect(m).toMatch(/última sessão/i);
    expect(m).toMatch(/renova/i);
  });

  it('variante falta: sentimos a sua falta + remarcar', () => {
    const m = buildFollowUpMensagem({ ...baseMsg, variante: 'falta', pacote: null });
    expect(m).toMatch(/falta/i);
    expect(m).toMatch(/remarcar|novo horário/i);
    expect(m).toContain('Maria');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=followup-avaliar`
Expected: FAIL — `Cannot find module '../src/workers/followUpPosSessao.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/workers/followUpPosSessao.js
/**
 * Follow-up pós-sessão (spec docs/superpowers/specs/2026-07-02-follow-up-pos-sessao-design.md).
 *
 * `avaliarFollowUp` e `buildFollowUpMensagem` são puras (testáveis sem DB);
 * `processFollowUpJob` (Task 4) faz o wiring DB + envio. Vive fora do
 * notificationWorker para não tocar no pipeline de lembretes existente.
 */
import { DateTime } from 'luxon';

const ZONA = 'Europe/Lisbon';
const STATUS_CANCELADOS = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];

/**
 * Decide se o follow-up é enviado e com que variante.
 * Recebe docs .lean() (possivelmente null) — nenhum acesso a DB aqui.
 * Semântica das flags: ausente = activo; só bloqueia com `false` explícito.
 */
export function avaliarFollowUp({ agendamento, cliente, tenant, compra, jobDataHoraISO }) {
  if (!agendamento) return { enviar: false, motivo: 'inexistente' };

  if (
    STATUS_CANCELADOS.includes(agendamento.status) ||
    agendamento.confirmacao?.tipo === 'rejeitado'
  ) {
    return { enviar: false, motivo: 'cancelado' };
  }

  // Remarcado desde que o job foi agendado → o job antigo é órfão.
  if (jobDataHoraISO && agendamento.dataHora) {
    const intended = DateTime.fromISO(jobDataHoraISO, { zone: ZONA }).toMillis();
    const atual = DateTime.fromJSDate(new Date(agendamento.dataHora)).toMillis();
    if (Number.isFinite(intended) && Number.isFinite(atual) && intended !== atual) {
      return { enviar: false, motivo: 'remarcado' };
    }
  }

  if (!agendamento.cliente || !cliente) return { enviar: false, motivo: 'sem_cliente' };
  if (agendamento.followUp?.enviadoEm) return { enviar: false, motivo: 'ja_enviado' };
  if (tenant?.configuracoes?.iaGlobalAtiva === false) return { enviar: false, motivo: 'ia_global_off' };
  if (tenant?.configuracoes?.followUpPosSessaoAtivo === false) return { enviar: false, motivo: 'followup_off' };
  if (cliente.iaAtiva === false) return { enviar: false, motivo: 'ia_cliente_off' };
  if (!cliente.telefone) return { enviar: false, motivo: 'sem_telefone' };

  let pacote = null;
  if (compra) {
    // A sessão de hoje só está no historico se a Laura já marcou Realizado
    // (usarSessao). Se ainda não consumida, desconta-a para saber o que
    // resta DEPOIS desta sessão.
    const consumida = (compra.historico || []).some(
      (h) => String(h.agendamento) === String(agendamento._id)
    );
    pacote = {
      nome: compra.pacote?.nome || 'Pacote',
      restantesAposEsta: Math.max(0, (compra.sessoesRestantes ?? 0) - (consumida ? 0 : 1)),
    };
  }

  const variante = agendamento.status === 'Não Compareceu' ? 'falta' : 'normal';
  return { enviar: true, variante, pacote };
}

export function buildFollowUpMensagem({ clienteNome, variante, pacote, clinicaNome }) {
  const assinatura = `\n\n_${clinicaNome}_`;

  if (variante === 'falta') {
    return (
      `💜 Sentimos a sua falta hoje, ${clienteNome}!\n\n` +
      `Aconteceu alguma coisa? Se quiser, é só responder por aqui e ` +
      `encontramos já um novo horário para a sua sessão. 😊` +
      assinatura
    );
  }

  let proposta = '';
  if (pacote && pacote.restantesAposEsta > 0) {
    const n = pacote.restantesAposEsta;
    const palavra = n === 1 ? 'sessão' : 'sessões';
    proposta =
      `\n\nAinda tem *${n} ${palavra}* no seu pacote — quer deixar já marcada a próxima? ` +
      `É só dizer o dia que lhe dá mais jeito. 😊`;
  } else if (pacote && pacote.restantesAposEsta === 0) {
    proposta =
      `\n\nEsta era a última sessão do seu pacote 🎉 Se quiser continuar os ` +
      `tratamentos, posso ajudar com a renovação — é só dizer!`;
  }

  return (
    `Olá ${clienteNome}! 💜\n\n` +
    `A sua sessão de hoje já terminou — como correu? Adoramos saber como se sentiu.` +
    proposta +
    assinatura
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=followup-avaliar`
Expected: PASS (todos os testes)

- [ ] **Step 5: Commit**

```bash
git add src/workers/followUpPosSessao.js tests/followup-avaliar.test.js
git commit -m "feat(followup): lógica pura de decisão e template do follow-up pós-sessão"
```

---

### Task 3: scheduleNotifications — 4º job com delay

**Files:**
- Modify: `src/utils/scheduleNotifications.js`
- Modify: `src/modules/clientes/clienteInternalRoutes.js:209-216` e `:324-331` (passar `duracaoSessaoMin`)
- Test: `tests/followup-schedule.test.js`

**Interfaces:**
- Consumes: fila `notifications` existente (`getNotificationQueue`).
- Produces: job `'follow-up-pos-sessao'` com `jobId = ${agendamentoId}-followup`, `job.data = { ...baseData, tipo: 'follow-up-pos-sessao' }` e `delay = dataHora + duracaoSessaoMin + 5min − agora`. Parâmetro novo opcional `duracaoSessaoMin = 60` em `scheduleNotifications`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/followup-schedule.test.js
// scheduleNotifications agenda (e remove na remarcação) o job follow-up-pos-sessao.
import { jest } from '@jest/globals';

const addCalls = [];
const removeCalls = [];
const fakeQueue = {
  add: jest.fn((name, data, opts) => {
    addCalls.push({ name, data, opts });
    return Promise.resolve({ id: opts?.jobId });
  }),
  remove: jest.fn((jobId) => {
    removeCalls.push(jobId);
    return Promise.resolve();
  }),
};

jest.unstable_mockModule('../src/queues/notificationQueue.js', () => ({
  getNotificationQueue: () => fakeQueue,
}));
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
}));

const { scheduleNotifications } = await import('../src/utils/scheduleNotifications.js');

const AG_ID = '6a33bfa02d990b533792e8e7';
const baseParams = (dataHora) => ({
  agendamentoId: AG_ID,
  tenantId: 't1',
  dataHora,
  clienteNome: 'Maria',
  clienteTelefone: '351910000000',
  servicoNome: 'Sessão',
});

beforeEach(() => {
  addCalls.length = 0;
  removeCalls.length = 0;
  jest.clearAllMocks();
});

describe('scheduleNotifications — job follow-up-pos-sessao', () => {
  it('agenda com jobId determinístico e delay = dataHora + duração + 5min', async () => {
    const dataHora = new Date(Date.now() + 3 * 60 * 60 * 1000); // +3h
    await scheduleNotifications({ ...baseParams(dataHora), duracaoSessaoMin: 60 });

    expect(removeCalls).toContain(`${AG_ID}-followup`);

    const call = addCalls.find((c) => c.name === 'follow-up-pos-sessao');
    expect(call).toBeDefined();
    expect(call.opts.jobId).toBe(`${AG_ID}-followup`);
    expect(call.data.tipo).toBe('follow-up-pos-sessao');
    expect(call.opts.jobId).not.toContain(':');

    const esperado = dataHora.getTime() + 65 * 60 * 1000 - Date.now();
    expect(Math.abs(call.opts.delay - esperado)).toBeLessThan(5000);
  });

  it('usa duração customizada do tenant (90 min → delay +95min)', async () => {
    const dataHora = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await scheduleNotifications({ ...baseParams(dataHora), duracaoSessaoMin: 90 });

    const call = addCalls.find((c) => c.name === 'follow-up-pos-sessao');
    const esperado = dataHora.getTime() + 95 * 60 * 1000 - Date.now();
    expect(Math.abs(call.opts.delay - esperado)).toBeLessThan(5000);
  });

  it('sem duracaoSessaoMin usa default 60', async () => {
    const dataHora = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await scheduleNotifications(baseParams(dataHora));

    const call = addCalls.find((c) => c.name === 'follow-up-pos-sessao');
    const esperado = dataHora.getTime() + 65 * 60 * 1000 - Date.now();
    expect(Math.abs(call.opts.delay - esperado)).toBeLessThan(5000);
  });

  it('não agenda follow-up quando o fim previsto já passou (delay ≤ 0)', async () => {
    // dataHora 2h no passado → fim previsto (+65min) também no passado
    const dataHora = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await scheduleNotifications(baseParams(dataHora));

    expect(addCalls.find((c) => c.name === 'follow-up-pos-sessao')).toBeUndefined();
    // mas o jobId antigo é removido na mesma (remarcação limpa)
    expect(removeCalls).toContain(`${AG_ID}-followup`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=followup-schedule`
Expected: FAIL — nenhum job `follow-up-pos-sessao` em `addCalls`.

- [ ] **Step 3: Write minimal implementation**

Em `src/utils/scheduleNotifications.js`:

1. Assinatura (linha 23) — adicionar `duracaoSessaoMin = 60`:

```javascript
export async function scheduleNotifications({ agendamentoId, tenantId, dataHora, clienteNome, clienteTelefone, servicoNome, duracaoSessaoMin = 60 }) {
```

2. jobIds (linhas 74-83) — adicionar o 4º id à declaração e à remoção:

```javascript
  const jobIdConfirmacao = `${baseData.agendamentoId}-confirmacao`;
  const jobIdAntecipado = `${baseData.agendamentoId}-lembrete-antecipado`;
  const jobId1h = `${baseData.agendamentoId}-lembrete-1h`;
  const jobIdFollowUp = `${baseData.agendamentoId}-followup`;

  // Remove lembretes anteriores deste agendamento (remarcação/recriação limpa).
  await Promise.all(
    [jobIdConfirmacao, jobIdAntecipado, jobId1h, jobIdFollowUp].map((jid) =>
      queue.remove(jid).catch(() => {})
    )
  );
```

3. Após o bloco "3. Lembrete 1h antes" (linha 117), antes do `logger.info` final:

```javascript
  // 4. Follow-up pós-sessão: fim previsto da sessão + 5 min. O worker
  // revalida tudo no disparo (avaliarFollowUp) — aqui só se agenda.
  const delayFollowUp = agendamento
    .plus({ minutes: duracaoSessaoMin + 5 })
    .diff(agora).milliseconds;
  if (delayFollowUp > 0) {
    await queue.add(
      'follow-up-pos-sessao',
      { ...baseData, tipo: 'follow-up-pos-sessao' },
      { delay: delayFollowUp, jobId: jobIdFollowUp }
    );
  }
```

4. Em `src/modules/clientes/clienteInternalRoutes.js`, nos DOIS call sites de `scheduleNotifications` (POST create ~linha 209 e PATCH reschedule ~linha 324), adicionar a propriedade (o `tenant` vem de `resolveTenantContext` e está em scope em ambos):

```javascript
      servicoNome: tipo === 'Avaliacao' ? 'Avaliação' : 'Sessão',
      duracaoSessaoMin: tenant?.configuracoes?.duracaoSessaoPadrao || 60,
```

(no reschedule a linha `servicoNome` é `agendamento.tipo === 'Avaliacao' ? ...` — adicionar `duracaoSessaoMin` da mesma forma.)

Nota: `agendamentoController.js:262` e `leadInternalRoutes.js:477` ficam sem alteração — usam o default 60. Para leads o job é agendado mas o worker ignora-o (sem `cliente`).

- [ ] **Step 4: Run tests (novo + regressão dos lembretes)**

Run: `npm test -- --testPathPattern="followup-schedule|notification-reminders-stale"`
Expected: PASS em ambos os ficheiros (o teste stale existente garante que não se partiu o pipeline actual).

- [ ] **Step 5: Commit**

```bash
git add src/utils/scheduleNotifications.js src/modules/clientes/clienteInternalRoutes.js tests/followup-schedule.test.js
git commit -m "feat(followup): agendar job follow-up-pos-sessao no fim previsto da sessão + 5min"
```

---

### Task 4: Worker — processFollowUpJob + dispatch

**Files:**
- Modify: `src/workers/followUpPosSessao.js` (adicionar `processFollowUpJob`)
- Modify: `src/workers/notificationWorker.js` (dispatch do tipo novo — 3 linhas no topo de `processJob`)
- Test: `tests/followup-worker.test.js`

**Interfaces:**
- Consumes: `avaliarFollowUp`/`buildFollowUpMensagem` (Task 2); campos de modelo (Task 1); `sendWhatsAppMessage(to, message, instanceName?)` de `src/utils/evolutionClient.js`; `getTenantDB`/`getModels`; `Tenant` (DB partilhada).
- Produces: `processFollowUpJob(job)` exportada; worker despacha `tipo === 'follow-up-pos-sessao'` para ela.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/followup-worker.test.js
// processFollowUpJob — wiring DB + envio + persistência no inbox + idempotência.
import { jest } from '@jest/globals';

const sendMock = jest.fn().mockResolvedValue({ success: true });
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: sendMock,
}));

const { processFollowUpJob } = await import('../src/workers/followUpPosSessao.js');
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;
const { getTenantDB } = await import('../src/config/tenantDB.js');
const { getModels } = await import('../src/models/registry.js');

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(async () => {
  await clearDB();
  sendMock.mockClear();
});

async function seed({ tenantOverrides = {}, clienteOverrides = {}, agOverrides = {} } = {}) {
  const tenant = await Tenant.create({
    nome: 'Clínica FW',
    slug: `clinica-fw-${Date.now()}`,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    whatsapp: { instanceName: 'clinica-fw' },
    ...tenantOverrides,
  });
  const models = getModels(getTenantDB(String(tenant._id)));
  const cliente = await models.Cliente.create({
    tenantId: tenant._id,
    nome: 'Maria',
    telefone: '351910000001',
    ...clienteOverrides,
  });
  const dataHora = new Date(Date.now() + 60 * 60 * 1000); // futura (pre-save bloqueia passado)
  const agendamento = await models.Agendamento.create({
    tenantId: tenant._id,
    cliente: cliente._id,
    dataHora,
    status: 'Confirmado',
    confirmacao: { tipo: 'confirmado' },
    ...agOverrides,
  });
  const job = {
    id: 'j1',
    data: {
      tipo: 'follow-up-pos-sessao',
      agendamentoId: String(agendamento._id),
      tenantId: String(tenant._id),
      dataHora: dataHora.toISOString(),
    },
  };
  return { tenant, models, cliente, agendamento, job };
}

describe('processFollowUpJob', () => {
  it('envia com a instância do tenant, liga Mensagem à Conversa e marca enviadoEm', async () => {
    const { models, agendamento, job } = await seed();

    await processFollowUpJob(job);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [telefone, texto, instancia] = sendMock.mock.calls[0];
    expect(telefone).toBe('351910000001');
    expect(texto).toContain('como correu');
    expect(instancia).toBe('clinica-fw');

    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.followUp.enviadoEm).toBeInstanceOf(Date);

    const msg = await models.Mensagem.findOne({ tenantId: ag.tenantId }).lean();
    expect(msg).not.toBeNull();
    expect(msg.direcao).toBe('saida');
    expect(msg.geradoPor).toBe('sistema');
    expect(msg.conversa).not.toBeNull();

    const conversa = await models.Conversa.findById(msg.conversa).lean();
    expect(conversa).not.toBeNull();
  });

  it('é idempotente — segunda execução não reenvia', async () => {
    const { job } = await seed();
    await processFollowUpJob(job);
    await processFollowUpJob(job);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('não envia quando iaGlobalAtiva=false', async () => {
    const { job } = await seed({
      tenantOverrides: { configuracoes: { iaGlobalAtiva: false } },
    });
    await processFollowUpJob(job);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('não envia para agendamento cancelado', async () => {
    const { models, agendamento, job } = await seed();
    await models.Agendamento.updateOne(
      { _id: agendamento._id },
      { $set: { status: 'Cancelado Pelo Cliente' } }
    );
    await processFollowUpJob(job);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('não envia para agendamento sem cliente (lead)', async () => {
    const { models, tenant } = await seed();
    const dataHora = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const agLead = await models.Agendamento.create({
      tenantId: tenant._id,
      tipo: 'Avaliacao',
      lead: { nome: 'Lead X', telefone: '351920000000' },
      dataHora,
      status: 'Agendado',
    });
    sendMock.mockClear();
    await processFollowUpJob({
      id: 'j2',
      data: {
        tipo: 'follow-up-pos-sessao',
        agendamentoId: String(agLead._id),
        tenantId: String(tenant._id),
        dataHora: dataHora.toISOString(),
      },
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('variante falta quando Laura marcou Não Compareceu', async () => {
    const { models, agendamento, job } = await seed();
    await models.Agendamento.updateOne(
      { _id: agendamento._id },
      { $set: { status: 'Não Compareceu' } }
    );
    await processFollowUpJob(job);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][1]).toMatch(/falta/i);
  });

  it('falha de envio lança erro (BullMQ retry) e NÃO marca enviadoEm', async () => {
    const { models, agendamento, job } = await seed();
    sendMock.mockResolvedValueOnce({ success: false, error: 'down' });
    await expect(processFollowUpJob(job)).rejects.toThrow();
    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.followUp?.enviadoEm ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=followup-worker`
Expected: FAIL — `processFollowUpJob` is not a function.

- [ ] **Step 3: Write minimal implementation**

Em `src/workers/followUpPosSessao.js`, adicionar imports no topo e a função no fim:

```javascript
import { getTenantDB } from '../config/tenantDB.js';
import { getModels } from '../models/registry.js';
import Tenant from '../models/Tenant.js';
import { sendWhatsAppMessage } from '../utils/evolutionClient.js';
import logger from '../utils/logger.js';
```

```javascript
/**
 * Handler do job BullMQ 'follow-up-pos-sessao'. Carrega o estado actual,
 * decide via avaliarFollowUp (pura) e envia. Throw apenas em falha de envio
 * (para o retry do BullMQ); todas as skip conditions retornam em silêncio.
 */
export async function processFollowUpJob(job) {
  const { agendamentoId, tenantId } = job.data;

  const db = getTenantDB(tenantId);
  const { Agendamento, Cliente, CompraPacote, Mensagem, Conversa } = getModels(db);

  const agendamento = await Agendamento.findById(agendamentoId).lean();
  const [cliente, tenant, compra] = await Promise.all([
    agendamento?.cliente
      ? Cliente.findOne({ _id: agendamento.cliente, tenantId }).select('nome telefone iaAtiva').lean()
      : null,
    Tenant.findById(tenantId).lean(),
    agendamento?.compraPacote
      ? CompraPacote.findOne({ _id: agendamento.compraPacote, tenantId })
          .populate('pacote', 'nome')
          .lean()
      : null,
  ]);

  const decisao = avaliarFollowUp({
    agendamento,
    cliente,
    tenant,
    compra,
    jobDataHoraISO: job.data.dataHora,
  });
  if (!decisao.enviar) {
    logger.info({ jobId: job.id, agendamentoId, motivo: decisao.motivo }, '[FollowUp] não enviado');
    return;
  }

  const mensagem = buildFollowUpMensagem({
    clienteNome: cliente.nome || 'Cliente',
    variante: decisao.variante,
    pacote: decisao.pacote,
    clinicaNome: tenant?.nome || 'A clínica',
  });

  const resultado = await sendWhatsAppMessage(
    cliente.telefone,
    mensagem,
    tenant?.whatsapp?.instanceName
  );
  if (!resultado.success) {
    throw new Error(`[FollowUp] Falha ao enviar para ${cliente.nome}: ${JSON.stringify(resultado.error)}`);
  }

  // Marca enviado ANTES da persistência do inbox: se o registo na thread
  // falhar, o retry do BullMQ não pode reenviar a mensagem ao cliente.
  await Agendamento.updateOne(
    { _id: agendamentoId, tenantId },
    { $set: { 'followUp.enviadoEm': new Date() } }
  );

  try {
    const tel = String(cliente.telefone).replace(/\D/g, '');
    const variants = [tel, `351${tel}`, tel.replace(/^351/, '')];
    let conversa = await Conversa.findOne({ tenantId, telefone: { $in: variants } });
    if (!conversa) {
      conversa = await Conversa.create({ tenantId, telefone: tel, estado: 'aguardando_agendamento' });
    }
    await Mensagem.create({
      tenantId,
      telefone: tel,
      mensagem,
      origem: 'laura',
      direcao: 'saida',
      geradoPor: 'sistema',
      conversa: conversa._id,
    });
  } catch (err) {
    logger.warn({ err: err.message, agendamentoId }, '[FollowUp] falha a registar na thread (envio OK)');
  }

  logger.info({ jobId: job.id, agendamentoId, variante: decisao.variante }, '[FollowUp] enviado');
}
```

Em `src/workers/notificationWorker.js`: adicionar import estático no topo (sem circularidade — `followUpPosSessao.js` não importa o worker):

```javascript
import { processFollowUpJob } from './followUpPosSessao.js';
```

E no INÍCIO de `processJob` (linha 87, antes de resolver o DB — o handler novo resolve o seu próprio DB):

```javascript
  // Follow-up pós-sessão vive em módulo próprio — pipeline de lembretes intocado.
  if (job.data.tipo === 'follow-up-pos-sessao') {
    return processFollowUpJob(job);
  }
```

- [ ] **Step 4: Run tests (novo + suite de worker existente)**

Run: `npm test -- --testPathPattern="followup-worker|notification-reminders-stale"`
Expected: PASS em ambos.

- [ ] **Step 5: Commit**

```bash
git add src/workers/followUpPosSessao.js src/workers/notificationWorker.js tests/followup-worker.test.js
git commit -m "feat(followup): handler do job follow-up-pos-sessao no worker de notificações"
```

---

### Task 5: Endpoint interno PATCH /presenca

**Files:**
- Modify: `src/modules/clientes/clienteInternalRoutes.js` (nova rota após o bloco `/cancel`, ~linha 434; actualizar o comentário de cabeçalho do ficheiro com os endpoints novos)
- Test: `tests/followup-presenca-endpoint.test.js`

**Interfaces:**
- Consumes: `resolveTenantContext`, campos `followUp` (Task 1).
- Produces: `PATCH /api/internal/clientes/:id/agendamentos/:agendamentoId/presenca`, body `{ tenantId, compareceu: boolean, feedback?: string }` → `{ success: true, data: { statusAtualizado: boolean, status: string } }`. Só transita status a partir de `Agendado`/`Confirmado`; nunca sobrepõe estado da Laura; grava sempre `followUp.respostaEm` (+ `feedback`).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/followup-presenca-endpoint.test.js
// PATCH /api/internal/clientes/:id/agendamentos/:agendamentoId/presenca
process.env.INTERNAL_SERVICE_TOKEN = 'test-service-token';

import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const svc = { 'X-Service-Token': 'test-service-token' };

async function seedTenantClienteAgendamento(slug, agOverrides = {}) {
  const tenant = await Tenant.create({
    nome: `Clínica ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
  });
  const models = getModels(getTenantDB(String(tenant._id)));
  const cliente = await models.Cliente.create({
    tenantId: tenant._id,
    nome: 'Maria',
    telefone: `35191${Math.floor(1000000 + Math.random() * 8999999)}`,
  });
  const agendamento = await models.Agendamento.create({
    tenantId: tenant._id,
    cliente: cliente._id,
    dataHora: new Date(Date.now() + 60 * 60 * 1000),
    status: 'Agendado',
    ...agOverrides,
  });
  return { tenant, models, cliente, agendamento };
}

const url = (clienteId, agId) =>
  `/api/internal/clientes/${clienteId}/agendamentos/${agId}/presenca`;

describe('PATCH /presenca', () => {
  it('compareceu=true a partir de Agendado → Compareceu + respostaEm + feedback', async () => {
    const { tenant, models, cliente, agendamento } = await seedTenantClienteAgendamento('pres-a');

    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .set(svc)
      .send({ tenantId: String(tenant._id), compareceu: true, feedback: 'correu óptimo' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ statusAtualizado: true, status: 'Compareceu' });

    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.status).toBe('Compareceu');
    expect(ag.compareceu).toBe(true);
    expect(ag.followUp.respostaEm).toBeInstanceOf(Date);
    expect(ag.followUp.feedback).toBe('correu óptimo');
  });

  it('compareceu=false → Não Compareceu', async () => {
    const { tenant, models, cliente, agendamento } = await seedTenantClienteAgendamento('pres-b');

    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .set(svc)
      .send({ tenantId: String(tenant._id), compareceu: false });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Não Compareceu');
    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.compareceu).toBe(false);
  });

  it('status Realizado (Laura já mexeu) → noop no status, mas regista respostaEm', async () => {
    const { tenant, models, cliente, agendamento } = await seedTenantClienteAgendamento('pres-c');
    await models.Agendamento.updateOne(
      { _id: agendamento._id },
      { $set: { status: 'Realizado' } }
    );

    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .set(svc)
      .send({ tenantId: String(tenant._id), compareceu: true, feedback: 'boa' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ statusAtualizado: false, status: 'Realizado' });

    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.status).toBe('Realizado');
    expect(ag.followUp.respostaEm).toBeInstanceOf(Date);
  });

  it('isolamento multi-tenant: tenant B não toca agendamento do tenant A → 404', async () => {
    const { cliente, agendamento } = await seedTenantClienteAgendamento('pres-d');
    const tenantB = await Tenant.create({
      nome: 'Clínica B',
      slug: 'pres-tenant-b',
      plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    });

    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .set(svc)
      .send({ tenantId: String(tenantB._id), compareceu: true });

    expect(res.status).toBe(404);
  });

  it('compareceu não-boolean → 400', async () => {
    const { tenant, cliente, agendamento } = await seedTenantClienteAgendamento('pres-e');
    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .set(svc)
      .send({ tenantId: String(tenant._id), compareceu: 'sim' });
    expect(res.status).toBe(400);
  });

  it('sem service token → 401', async () => {
    const { tenant, cliente, agendamento } = await seedTenantClienteAgendamento('pres-f');
    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .send({ tenantId: String(tenant._id), compareceu: true });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=followup-presenca-endpoint`
Expected: FAIL — rota inexistente (404 em vez de 200 nos casos de sucesso).

- [ ] **Step 3: Write minimal implementation**

Em `src/modules/clientes/clienteInternalRoutes.js`, após o handler `/cancel` (~linha 434):

```javascript
// =====================================================================
// PATCH /api/internal/clientes/:id/agendamentos/:agendamentoId/presenca
// Body: { tenantId, compareceu: boolean, feedback?: string }
// Resposta ao follow-up pós-sessão. Só transita status a partir de
// Agendado/Confirmado — nunca sobrepõe estado definido pela Laura
// (Realizado, Fechado, cancelados). Grava sempre followUp.respostaEm.
// =====================================================================
router.patch('/:id/agendamentos/:agendamentoId/presenca', async (req, res) => {
  try {
    const { id: clienteId, agendamentoId } = req.params;
    const { tenantId, compareceu, feedback } = req.body || {};

    if (!tenantId || typeof compareceu !== 'boolean') {
      return res.status(400).json({ success: false, error: 'tenantId e compareceu (boolean) são obrigatórios' });
    }
    if (!mongoose.Types.ObjectId.isValid(clienteId) || !mongoose.Types.ObjectId.isValid(agendamentoId)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const { models } = await resolveTenantContext(tenantId);

    const followUpSet = { 'followUp.respostaEm': new Date() };
    if (feedback) followUpSet['followUp.feedback'] = String(feedback).slice(0, 500);

    const novoStatus = compareceu ? 'Compareceu' : 'Não Compareceu';

    // 1ª tentativa: atómica, com guarda de status (evita corrida com a Laura).
    let agendamento = await models.Agendamento.findOneAndUpdate(
      { _id: agendamentoId, tenantId, cliente: clienteId, status: { $in: ['Agendado', 'Confirmado'] } },
      { $set: { ...followUpSet, status: novoStatus, compareceu } },
      { new: true }
    ).lean();
    const statusAtualizado = Boolean(agendamento);

    // Guarda falhou → status já definido pela Laura; regista só a resposta.
    if (!agendamento) {
      agendamento = await models.Agendamento.findOneAndUpdate(
        { _id: agendamentoId, tenantId, cliente: clienteId },
        { $set: followUpSet },
        { new: true }
      ).lean();
    }
    if (!agendamento) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
    }

    res.json({ success: true, data: { statusAtualizado, status: agendamento.status } });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    logger.error({ err: err.message, stack: err.stack }, '[internal] PATCH /clientes/:id/agendamentos/:agendamentoId/presenca');
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});
```

Actualizar também o comentário de cabeçalho do ficheiro (linhas 7-14) acrescentando:

```
 *   PATCH /:id/agendamentos/:agendamentoId/presenca   — resposta ao follow-up (Compareceu/Não Compareceu)
 *   GET   /:id/followup-pendente                      — follow-up pós-sessão pendente (<24h)
 *   POST  /:id/renovacao-interesse                    — alerta a equipa (renovação de pacote)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=followup-presenca-endpoint`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/clientes/clienteInternalRoutes.js tests/followup-presenca-endpoint.test.js
git commit -m "feat(followup): endpoint interno de registo de presença pós-sessão"
```

---

### Task 6: Endpoints internos GET /followup-pendente + POST /renovacao-interesse

**Files:**
- Modify: `src/modules/clientes/clienteInternalRoutes.js` (2 rotas novas + 4 imports novos)
- Test: `tests/followup-endpoints.test.js`

**Interfaces:**
- Consumes: campos `followUp` (Task 1), `sendWhatsAppMessage`, `sendPushNotification`/`UserSubscription`/`User`.
- Produces:
  - `GET /api/internal/clientes/:id/followup-pendente?tenantId=` → `{ success: true, data: agendamento | null }` (agendamento com `followUp.enviadoEm` < 24h e `followUp.respostaEm` null; select `dataHora status tipo followUp compraPacote`).
  - `POST /api/internal/clientes/:id/renovacao-interesse` body `{ tenantId }` → `{ success: true, data: { whatsappEnviado: boolean, pushEnviado: boolean } }`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/followup-endpoints.test.js
// GET /followup-pendente + POST /renovacao-interesse
process.env.INTERNAL_SERVICE_TOKEN = 'test-service-token';

import { jest } from '@jest/globals';

const sendMock = jest.fn().mockResolvedValue({ success: true });
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: sendMock,
}));

const request = (await import('supertest')).default;
const app = (await import('../src/app.js')).default;
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;
const { getTenantDB } = await import('../src/config/tenantDB.js');
const { getModels } = await import('../src/models/registry.js');

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(async () => {
  await clearDB();
  sendMock.mockClear();
});

const svc = { 'X-Service-Token': 'test-service-token' };

async function seed(slug, tenantOverrides = {}) {
  const tenant = await Tenant.create({
    nome: `Clínica ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    ...tenantOverrides,
  });
  const models = getModels(getTenantDB(String(tenant._id)));
  const cliente = await models.Cliente.create({
    tenantId: tenant._id,
    nome: 'Maria',
    telefone: `35191${Math.floor(1000000 + Math.random() * 8999999)}`,
  });
  return { tenant, models, cliente };
}

async function criarAgendamentoComFollowUp(models, tenant, cliente, followUp) {
  const ag = await models.Agendamento.create({
    tenantId: tenant._id,
    cliente: cliente._id,
    dataHora: new Date(Date.now() + 60 * 60 * 1000),
    status: 'Agendado',
  });
  await models.Agendamento.updateOne({ _id: ag._id }, { $set: { followUp } });
  return ag;
}

describe('GET /followup-pendente', () => {
  it('devolve o agendamento com follow-up enviado <24h e sem resposta', async () => {
    const { tenant, models, cliente } = await seed('fp-a');
    const ag = await criarAgendamentoComFollowUp(models, tenant, cliente, {
      enviadoEm: new Date(Date.now() - 10 * 60 * 1000), // há 10 min
    });

    const res = await request(app)
      .get(`/api/internal/clientes/${cliente._id}/followup-pendente`)
      .query({ tenantId: String(tenant._id) })
      .set(svc);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(String(ag._id));
    expect(res.body.data.followUp.enviadoEm).toBeDefined();
  });

  it('sem follow-up enviado → data null', async () => {
    const { tenant, models, cliente } = await seed('fp-b');
    await models.Agendamento.create({
      tenantId: tenant._id,
      cliente: cliente._id,
      dataHora: new Date(Date.now() + 60 * 60 * 1000),
      status: 'Agendado',
    });

    const res = await request(app)
      .get(`/api/internal/clientes/${cliente._id}/followup-pendente`)
      .query({ tenantId: String(tenant._id) })
      .set(svc);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('já respondido → data null', async () => {
    const { tenant, models, cliente } = await seed('fp-c');
    await criarAgendamentoComFollowUp(models, tenant, cliente, {
      enviadoEm: new Date(Date.now() - 10 * 60 * 1000),
      respostaEm: new Date(),
    });

    const res = await request(app)
      .get(`/api/internal/clientes/${cliente._id}/followup-pendente`)
      .query({ tenantId: String(tenant._id) })
      .set(svc);

    expect(res.body.data).toBeNull();
  });

  it('enviado há mais de 24h → data null (contexto expirado)', async () => {
    const { tenant, models, cliente } = await seed('fp-d');
    await criarAgendamentoComFollowUp(models, tenant, cliente, {
      enviadoEm: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .get(`/api/internal/clientes/${cliente._id}/followup-pendente`)
      .query({ tenantId: String(tenant._id) })
      .set(svc);

    expect(res.body.data).toBeNull();
  });

  it('isolamento: tenant B não vê follow-up do tenant A → data null', async () => {
    const { tenant, models, cliente } = await seed('fp-e');
    await criarAgendamentoComFollowUp(models, tenant, cliente, {
      enviadoEm: new Date(Date.now() - 10 * 60 * 1000),
    });
    const { tenant: tenantB } = await seed('fp-e-b');

    const res = await request(app)
      .get(`/api/internal/clientes/${cliente._id}/followup-pendente`)
      .query({ tenantId: String(tenantB._id) })
      .set(svc);

    expect(res.body.data).toBeNull();
  });
});

describe('POST /renovacao-interesse', () => {
  it('com número de admin → envia WhatsApp com a instância do tenant', async () => {
    const { tenant, cliente } = await seed('ri-a', {
      whatsapp: { instanceName: 'clinica-ri-a', numeroWhatsapp: '351930000000' },
    });

    const res = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/renovacao-interesse`)
      .set(svc)
      .send({ tenantId: String(tenant._id) });

    expect(res.status).toBe(200);
    expect(res.body.data.whatsappEnviado).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [numero, texto, instancia] = sendMock.mock.calls[0];
    expect(numero).toBe('351930000000');
    expect(texto).toMatch(/[Rr]enova/);
    expect(texto).toContain('Maria');
    expect(instancia).toBe('clinica-ri-a');
  });

  it('sem número de admin → whatsappEnviado false, sem erro', async () => {
    const { tenant, cliente } = await seed('ri-b');

    const res = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/renovacao-interesse`)
      .set(svc)
      .send({ tenantId: String(tenant._id) });

    expect(res.status).toBe(200);
    expect(res.body.data.whatsappEnviado).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('isolamento: cliente de outro tenant → 404', async () => {
    const { cliente } = await seed('ri-c');
    const { tenant: tenantB } = await seed('ri-c-b');

    const res = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/renovacao-interesse`)
      .set(svc)
      .send({ tenantId: String(tenantB._id) });

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=followup-endpoints`
Expected: FAIL — rotas inexistentes.

- [ ] **Step 3: Write minimal implementation**

Em `src/modules/clientes/clienteInternalRoutes.js`, adicionar imports no topo (junto dos existentes):

```javascript
import { sendWhatsAppMessage } from '../../utils/evolutionClient.js';
import { sendPushNotification } from '../../services/pushService.js';
import User from '../../models/User.js';
import UserSubscription from '../../models/UserSubscription.js';
```

E as duas rotas (após a rota `/presenca` da Task 5):

```javascript
// =====================================================================
// GET /api/internal/clientes/:id/followup-pendente?tenantId=...
// Follow-up pós-sessão pendente: enviado nas últimas 24h e sem resposta.
// data: null quando não há (o orchestrator Python trata null = sem contexto).
// =====================================================================
router.get('/:id/followup-pendente', async (req, res) => {
  try {
    const { tenantId } = req.query;
    const clienteId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(clienteId)) {
      return res.status(400).json({ success: false, error: 'clienteId inválido' });
    }

    const { models } = await resolveTenantContext(tenantId);

    const cutoff = DateTime.now().setZone('Europe/Lisbon').minus({ hours: 24 }).toJSDate();
    const agendamento = await models.Agendamento.findOne({
      tenantId,
      cliente: clienteId,
      'followUp.enviadoEm': { $gte: cutoff },
      'followUp.respostaEm': null,
    })
      .sort({ 'followUp.enviadoEm': -1 })
      .select('dataHora status tipo followUp compraPacote')
      .lean();

    res.json({ success: true, data: agendamento || null });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    logger.error({ err: err.message, stack: err.stack }, '[internal] GET /clientes/:id/followup-pendente');
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// POST /api/internal/clientes/:id/renovacao-interesse
// Body: { tenantId }
// Handoff de renovação: alerta a equipa (WhatsApp admin + push best-effort).
// A IA NUNCA cria a CompraPacote — a venda é fechada pela equipa.
// =====================================================================
router.post('/:id/renovacao-interesse', async (req, res) => {
  try {
    const clienteId = req.params.id;
    const { tenantId } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId é obrigatório' });
    }
    if (!mongoose.Types.ObjectId.isValid(clienteId)) {
      return res.status(400).json({ success: false, error: 'clienteId inválido' });
    }

    const { tenant, models } = await resolveTenantContext(tenantId);

    const cliente = await models.Cliente.findOne({ _id: clienteId, tenantId })
      .select('nome telefone')
      .lean();
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    const alerta =
      `💜 *Interesse em Renovação*\n\n` +
      `A cliente *${cliente.nome}* terminou o pacote e demonstrou interesse em renovar.\n\n` +
      `📱 Contacto: ${cliente.telefone || 'sem telefone registado'}`;

    let whatsappEnviado = false;
    const numeroAdmin = tenant?.whatsapp?.numeroWhatsapp || tenant?.contato?.telefone;
    if (numeroAdmin) {
      const resultado = await sendWhatsAppMessage(numeroAdmin, alerta, tenant?.whatsapp?.instanceName);
      whatsappEnviado = Boolean(resultado?.success);
    }

    // Push best-effort aos admins do tenant — nunca falha o pedido.
    let pushEnviado = false;
    try {
      const admins = await User.find({ tenantId, role: { $in: ['admin', 'gerente'] } })
        .select('_id')
        .lean();
      const subs = await UserSubscription.find({
        userId: { $in: admins.map((a) => String(a._id)) },
        active: true,
      }).lean();
      await Promise.all(
        subs.map((sub) =>
          sendPushNotification(sub, {
            title: '💜 Interesse em renovação',
            body: `${cliente.nome} terminou o pacote e quer renovar.`,
            tag: `renovacao-${clienteId}`,
            data: { tipo: 'renovacao-interesse', clienteId },
          })
        )
      );
      pushEnviado = subs.length > 0;
    } catch (pushErr) {
      logger.warn({ err: pushErr.message, tenantId }, '[internal] push de renovação falhou');
    }

    res.json({ success: true, data: { whatsappEnviado, pushEnviado } });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    logger.error({ err: err.message, stack: err.stack }, '[internal] POST /clientes/:id/renovacao-interesse');
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=followup-endpoints`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/clientes/clienteInternalRoutes.js tests/followup-endpoints.test.js
git commit -m "feat(followup): endpoints internos followup-pendente e renovacao-interesse"
```

---

### Task 7: Python — marcai_client + tools novas

**Files:**
- Modify: `ia-service/src/ia_service/services/marcai_client.py` (3 funções no fim da secção "Client lifecycle")
- Modify: `ia-service/src/ia_service/tools/client_tools.py` (2 factories novas no fim)
- Test: `ia-service/tests/test_client_followup_tools.py`

**Interfaces:**
- Consumes: endpoints das Tasks 5-6; helpers existentes `_auth_headers`, `_post_with_retry`, `_patch_with_retry` em marcai_client.
- Produces:
  - `marcai_client.get_pending_followup(tenant_id, cliente_id) -> dict | None`
  - `marcai_client.registar_presenca(tenant_id, cliente_id, agendamento_id, compareceu, feedback="") -> dict`
  - `marcai_client.sinalizar_renovacao(tenant_id, cliente_id) -> dict`
  - `make_registar_presenca_tool(tenant_id, cliente_id, agendamento_id)` — tool `registar_presenca(compareceu: bool, feedback: str = "")`
  - `make_sinalizar_renovacao_tool(tenant_id, cliente_id)` — tool `sinalizar_interesse_renovacao()`

- [ ] **Step 1: Write the failing test**

```python
# ia-service/tests/test_client_followup_tools.py
"""Tools de follow-up pós-sessão (registar_presenca, sinalizar_interesse_renovacao)."""

from ia_service.services import marcai_client
from ia_service.tools.client_tools import (
    make_registar_presenca_tool,
    make_sinalizar_renovacao_tool,
)


async def test_registar_presenca_compareceu(monkeypatch):
    calls = {}

    async def fake_registar(**kwargs):
        calls.update(kwargs)
        return {"statusAtualizado": True, "status": "Compareceu"}

    monkeypatch.setattr(marcai_client, "registar_presenca", fake_registar)

    tool = make_registar_presenca_tool("t1", "c1", "a1")
    result = await tool.ainvoke({"compareceu": True, "feedback": "correu bem"})

    assert "OK" in result
    assert calls["tenant_id"] == "t1"
    assert calls["cliente_id"] == "c1"
    assert calls["agendamento_id"] == "a1"
    assert calls["compareceu"] is True
    assert calls["feedback"] == "correu bem"


async def test_registar_presenca_faltou_sugere_remarcar(monkeypatch):
    async def fake_registar(**kwargs):
        return {"statusAtualizado": True, "status": "Não Compareceu"}

    monkeypatch.setattr(marcai_client, "registar_presenca", fake_registar)

    tool = make_registar_presenca_tool("t1", "c1", "a1")
    result = await tool.ainvoke({"compareceu": False})

    assert "remarcar" in result.lower()


async def test_registar_presenca_noop_quando_laura_ja_definiu(monkeypatch):
    async def fake_registar(**kwargs):
        return {"statusAtualizado": False, "status": "Realizado"}

    monkeypatch.setattr(marcai_client, "registar_presenca", fake_registar)

    tool = make_registar_presenca_tool("t1", "c1", "a1")
    result = await tool.ainvoke({"compareceu": True})

    assert "nao foi alterado" in result.lower().replace("ã", "a")


async def test_registar_presenca_erro_http_nao_rebenta(monkeypatch):
    async def fake_registar(**kwargs):
        raise RuntimeError("500 Server Error")

    monkeypatch.setattr(marcai_client, "registar_presenca", fake_registar)

    tool = make_registar_presenca_tool("t1", "c1", "a1")
    result = await tool.ainvoke({"compareceu": True})

    assert "ERRO" in result


async def test_sinalizar_renovacao_avisa_equipa(monkeypatch):
    calls = {}

    async def fake_sinalizar(**kwargs):
        calls.update(kwargs)
        return {"whatsappEnviado": True, "pushEnviado": False}

    monkeypatch.setattr(marcai_client, "sinalizar_renovacao", fake_sinalizar)

    tool = make_sinalizar_renovacao_tool("t1", "c1")
    result = await tool.ainvoke({})

    assert "OK" in result
    assert "precos" in result.lower().replace("ç", "c")
    assert calls == {"tenant_id": "t1", "cliente_id": "c1"}


async def test_sinalizar_renovacao_erro_degrada(monkeypatch):
    async def fake_sinalizar(**kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(marcai_client, "sinalizar_renovacao", fake_sinalizar)

    tool = make_sinalizar_renovacao_tool("t1", "c1")
    result = await tool.ainvoke({})

    assert "ERRO" in result
```

- [ ] **Step 2: Run test to verify it fails**

Run (a partir de `ia-service/`): `.venv/bin/pytest tests/test_client_followup_tools.py -v`
Expected: FAIL — `ImportError: cannot import name 'make_registar_presenca_tool'`

- [ ] **Step 3: Write minimal implementation**

Em `ia-service/src/ia_service/services/marcai_client.py`, no fim da secção "Client lifecycle" (após `pause_client_ia`):

```python
async def get_pending_followup(tenant_id: str, cliente_id: str) -> dict | None:
    """Agendamento com follow-up pós-sessão pendente (<24h, sem resposta) ou None."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}/followup-pendente",
            params={"tenantId": tenant_id},
            headers=_auth_headers(),
        )
        r.raise_for_status()
        return r.json().get("data")


async def registar_presenca(
    tenant_id: str,
    cliente_id: str,
    agendamento_id: str,
    compareceu: bool,
    feedback: str = "",
) -> dict:
    """Regista a resposta ao follow-up (Compareceu / Não Compareceu)."""
    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}"
        f"/agendamentos/{agendamento_id}/presenca",
        json={"tenantId": tenant_id, "compareceu": compareceu, "feedback": feedback},
    )
    return resp["data"]


async def sinalizar_renovacao(tenant_id: str, cliente_id: str) -> dict:
    """Alerta a equipa de que o cliente quer renovar o pacote (handoff)."""
    resp = await _post_with_retry(
        f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}/renovacao-interesse",
        json={"tenantId": tenant_id},
    )
    return resp["data"]
```

Em `ia-service/src/ia_service/tools/client_tools.py`, no fim do ficheiro:

```python
def make_registar_presenca_tool(tenant_id: str, cliente_id: str, agendamento_id: str):
    """agendamento_id capturado por closure — vem do follow-up pendente
    detectado pelo orchestrator; o LLM nunca escolhe o agendamento."""

    @tool
    async def registar_presenca(compareceu: bool, feedback: str = "") -> str:
        """Regista se a cliente compareceu a sessao do follow-up pendente.

        Usa esta tool quando a cliente responde a mensagem de follow-up
        pos-sessao:
        - resposta indica que a sessao aconteceu (ex: "correu bem",
          "adorei") -> compareceu=True
        - resposta indica que faltou (ex: "nao fui", "tive um imprevisto")
          -> compareceu=False
        - resposta ambigua -> NAO chames a tool; pergunta primeiro.

        Chama UMA unica vez por follow-up.

        Args:
            compareceu: True se a sessao aconteceu, False se a cliente faltou.
            feedback: Resumo curto do que a cliente disse sobre a sessao.
        """
        try:
            result = await marcai_client.registar_presenca(
                tenant_id=tenant_id,
                cliente_id=cliente_id,
                agendamento_id=agendamento_id,
                compareceu=compareceu,
                feedback=feedback,
            )
            if not result.get("statusAtualizado", False):
                return (
                    "OK — resposta registada. O estado da sessao ja tinha sido "
                    "definido pela equipa e nao foi alterado. Continua a conversa."
                )
            if compareceu:
                return "OK — presenca registada. Continua a conversa naturalmente."
            return (
                "OK — falta registada. Propoe com empatia remarcar a sessao "
                "(usa get_available_slots para veres horarios livres)."
            )
        except Exception as exc:
            return f"ERRO ao registar presenca: {exc}. Continua a conversa na mesma."

    return registar_presenca


def make_sinalizar_renovacao_tool(tenant_id: str, cliente_id: str):

    @tool
    async def sinalizar_interesse_renovacao() -> str:
        """Avisa a equipa de que a cliente quer renovar o pacote.

        Usa esta tool APENAS quando o pacote da cliente terminou (era a
        ultima sessao) E a cliente disse explicitamente que quer renovar
        ou saber mais sobre a renovacao.

        NAO faças a venda: nao inventes precos nem condicoes. A equipa
        contacta a cliente para fechar a renovacao.

        Nao precisa de argumentos.
        """
        try:
            await marcai_client.sinalizar_renovacao(
                tenant_id=tenant_id, cliente_id=cliente_id
            )
            return (
                "OK — equipa avisada. Diz a cliente que a equipa entra em "
                "contacto em breve para tratar da renovacao. NAO fales de precos."
            )
        except Exception as exc:
            return (
                f"ERRO ao avisar equipa: {exc}. "
                "Diz a cliente que vais passar o pedido a equipa na mesma."
            )

    return sinalizar_interesse_renovacao
```

- [ ] **Step 4: Run tests + lint**

Run (a partir de `ia-service/`): `.venv/bin/pytest tests/test_client_followup_tools.py -v && ruff check . && ruff format --check .`
Expected: PASS (6 testes), ruff limpo.

- [ ] **Step 5: Commit**

```bash
git add ia-service/src/ia_service/services/marcai_client.py ia-service/src/ia_service/tools/client_tools.py ia-service/tests/test_client_followup_tools.py
git commit -m "feat(followup): tools registar_presenca e sinalizar_renovacao no client agent"
```

---

### Task 8: Python — orchestrator, agent wiring e prompt

**Files:**
- Modify: `ia-service/src/ia_service/services/client_orchestrator.py` (`_format_followup_context` + fetch em `_generate_reply`)
- Modify: `ia-service/src/ia_service/agents/client_agent.py` (params novos + tools condicionais)
- Modify: `ia-service/src/ia_service/services/prompt_renderer.py` (`render_client_system_prompt` ganha `followup_context`)
- Modify: `ia-service/src/ia_service/prompts/system_client_agent.md` (placeholder + secção de protocolo)
- Test: `ia-service/tests/test_client_followup_context.py`

**Interfaces:**
- Consumes: `marcai_client.get_pending_followup` (Task 7); factories de tools (Task 7).
- Produces:
  - `_format_followup_context(followup: dict | None) -> str` (exportável para teste)
  - `make_client_agent(..., followup_context: str = "Nenhum follow-up pendente.", followup_agendamento_id: str | None = None)`
  - `render_client_system_prompt(..., followup_context: str = "Nenhum follow-up pendente.")`
  - Placeholder `{{followup_context}}` no template.

- [ ] **Step 1: Write the failing test**

```python
# ia-service/tests/test_client_followup_context.py
"""Contexto de follow-up pendente: formatação + injecção no prompt."""

import pytest

from ia_service.services import tenant_knowledge
from ia_service.services.client_orchestrator import _format_followup_context
from ia_service.services.prompt_renderer import render_client_system_prompt

# Mesmo padrão de test_prompt_renderer.py: tenant desconhecido cai nos
# defaults genéricos; caches limpas entre testes.
TENANT_ID = "nonexistent-tenant"


@pytest.fixture(autouse=True)
def clear_caches():
    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()
    tenant_knowledge.load_clinica_config.cache_clear()


def test_format_followup_context_none():
    assert _format_followup_context(None) == "Nenhum follow-up pendente."


def test_format_followup_context_pendente():
    ctx = _format_followup_context(
        {"_id": "a1", "dataHora": "2026-07-02T13:00:00.000Z", "status": "Agendado"}
    )
    assert "PENDENTE" in ctx
    assert "2026-07-02T13:00:00.000Z" in ctx
    assert "Agendado" in ctx


def test_render_client_prompt_inclui_followup_context():
    prompt = render_client_system_prompt(
        TENANT_ID,
        client_state={"nome": "Maria"},
        followup_context="PENDENTE — sessao de ontem",
    )
    assert "PENDENTE — sessao de ontem" in prompt
    assert "{{followup_context}}" not in prompt


def test_render_client_prompt_default_sem_followup():
    prompt = render_client_system_prompt(TENANT_ID, client_state={"nome": "Maria"})
    assert "Nenhum follow-up pendente." in prompt
    assert "{{followup_context}}" not in prompt
```

- [ ] **Step 2: Run test to verify it fails**

Run (a partir de `ia-service/`): `.venv/bin/pytest tests/test_client_followup_context.py -v`
Expected: FAIL — `_format_followup_context` inexistente / placeholder não substituído.

- [ ] **Step 3: Write minimal implementation**

1. `prompt_renderer.py` — assinatura e replace:

```python
def render_client_system_prompt(
    tenant_id: str,
    client_state: Optional[dict] = None,
    upcoming_appointments: str = "Nenhum agendamento futuro.",
    turn_number: int = 0,
    last_clinic_message: str = "",
    followup_context: str = "Nenhum follow-up pendente.",
) -> str:
```

e na cadeia de `.replace(...)` (junto de `upcoming_appointments`):

```python
        .replace("{{followup_context}}", followup_context)
```

2. `prompts/system_client_agent.md` — na secção de contexto (após a linha `- **Proximos agendamentos:** {{upcoming_appointments}}`):

```markdown
- **Follow-up pos-sessao:** {{followup_context}}
```

E nova secção de protocolo (junto às restantes secções de protocolo, p.ex. antes do protocolo de reagendamento):

```markdown
## Follow-up pos-sessao

Quando o campo "Follow-up pos-sessao" acima indica PENDENTE, a mensagem da
cliente e provavelmente a resposta a mensagem pos-sessao que lhe enviamos.

1. Interpreta a resposta e chama `registar_presenca`:
   - a sessao aconteceu (ex: "correu otimo", "adorei") ->
     compareceu=True, feedback=resumo curto do que disse
   - faltou (ex: "nao consegui ir", "tive um imprevisto") -> compareceu=False
   - resposta ambigua -> pergunta primeiro como correu; NAO chames a tool as cegas
2. Se compareceu e ainda tem sessoes no pacote, propoe marcar a proxima
   sessao (protocolo normal de marcacao).
3. Se era a ULTIMA sessao do pacote e a cliente quer continuar/renovar,
   chama `sinalizar_interesse_renovacao` e diz que a equipa entra em
   contacto. NAO inventes precos nem condicoes de renovacao.
4. Se faltou, propoe remarcar com empatia (ve horarios com get_available_slots).
5. Chama `registar_presenca` UMA unica vez por follow-up.
```

3. `agents/client_agent.py`:

```python
from ..tools.client_tools import (
    make_cancel_appointment_tool,
    make_create_client_appointment_tool,
    make_get_my_appointments_tool,
    make_get_my_packages_tool,
    make_pausar_atendimento_tool,
    make_registar_presenca_tool,
    make_reschedule_appointment_tool,
    make_sinalizar_renovacao_tool,
)
```

```python
def make_client_agent(
    tenant_id: str,
    cliente_id: str,
    client_state: dict | None = None,
    upcoming_appointments: str = "Nenhum agendamento futuro.",
    turn_number: int = 0,
    last_clinic_message: str = "",
    followup_context: str = "Nenhum follow-up pendente.",
    followup_agendamento_id: str | None = None,
) -> Any:
    tools = [
        make_find_servico_tool(tenant_id),
        make_get_available_slots_tool(tenant_id),
        make_get_my_packages_tool(tenant_id, cliente_id),
        make_get_my_appointments_tool(tenant_id, cliente_id),
        make_create_client_appointment_tool(tenant_id, cliente_id),
        make_reschedule_appointment_tool(tenant_id, cliente_id),
        make_cancel_appointment_tool(tenant_id, cliente_id),
        make_pausar_atendimento_tool(tenant_id, cliente_id),
    ]
    # Tools de follow-up so existem quando ha follow-up pendente — o
    # agendamento alvo e capturado por closure, nunca escolhido pelo LLM.
    if followup_agendamento_id:
        tools.append(
            make_registar_presenca_tool(tenant_id, cliente_id, followup_agendamento_id)
        )
        tools.append(make_sinalizar_renovacao_tool(tenant_id, cliente_id))
    system_prompt = render_client_system_prompt(
        tenant_id,
        client_state=client_state,
        upcoming_appointments=upcoming_appointments,
        turn_number=turn_number,
        last_clinic_message=last_clinic_message,
        followup_context=followup_context,
    )
    model = _build_model()
    return create_agent(model, tools=tools, system_prompt=system_prompt)
```

4. `services/client_orchestrator.py` — função módulo-level (após `_format_upcoming_appointments`):

```python
def _format_followup_context(followup: dict | None) -> str:
    if not followup:
        return "Nenhum follow-up pendente."
    data_hora = followup.get("dataHora", "?")
    status = followup.get("status", "?")
    return (
        f"PENDENTE — foi enviada uma mensagem pos-sessao sobre a sessao de "
        f"{data_hora} (status actual: {status}). A mensagem da cliente e "
        "provavelmente a resposta. Segue o protocolo 'Follow-up pos-sessao'."
    )
```

E em `_generate_reply`, depois de `upcoming = await _format_upcoming_appointments(...)`:

```python
        followup = None
        try:
            followup = await marcai_client.get_pending_followup(tenant_id, cliente_id)
        except Exception as exc:
            log.warning("client_followup_fetch_failed", error=str(exc))

        agent = make_client_agent(
            tenant_id,
            cliente_id=cliente_id,
            client_state=client_state,
            upcoming_appointments=upcoming,
            turn_number=turn_number,
            last_clinic_message=last_clinic_message,
            followup_context=_format_followup_context(followup),
            followup_agendamento_id=str(followup["_id"]) if followup else None,
        )
```

- [ ] **Step 4: Run tests + lint (suite Python completa)**

Run (a partir de `ia-service/`): `.venv/bin/pytest && ruff check . && ruff format --check .`
Expected: PASS em toda a suite; ruff limpo.

- [ ] **Step 5: Commit**

```bash
git add ia-service/src/ia_service/services/client_orchestrator.py ia-service/src/ia_service/agents/client_agent.py ia-service/src/ia_service/services/prompt_renderer.py ia-service/src/ia_service/prompts/system_client_agent.md ia-service/tests/test_client_followup_context.py
git commit -m "feat(followup): contexto de follow-up pendente no client agent + protocolo no prompt"
```

---

### Task 9: Docs + verificação final

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-follow-up-pos-sessao-design.md` (secção 4: contexto vem de `GET /:id/followup-pendente` dedicado, não do GET de agendamentos — esse filtra só futuros e nunca devolveria a sessão passada; secção 2: gating com semântica "ausente = activo")
- Modify: `.claude/docs/API.md` (3 endpoints internos novos)

**Interfaces:** n/a (documentação).

- [ ] **Step 1: Corrigir a spec**

Na secção "Injecção de contexto" da spec, substituir a frase sobre `GET /api/internal/clientes/:id/agendamentos` por:

```markdown
O endpoint interno novo `GET /api/internal/clientes/:id/followup-pendente` devolve
o agendamento com `followUp.enviadoEm` nas últimas 24 horas e sem `respostaEm`
(ou `null`). Nota: o `GET /:id/agendamentos` existente filtra apenas agendamentos
futuros, pelo que nunca devolveria a sessão passada do follow-up — daí o endpoint
dedicado. O `client_orchestrator` chama-o via `marcai_client.get_pending_followup`
e injecta no prompt do agente:
```

Na secção "Gating IA" (ponto 4 da secção 2), acrescentar no fim:

```markdown
   Semântica: "ausente = activo" — só bloqueia quando o campo é explicitamente
   `false` (coerente com o default-true de `iaGlobalAtiva`, ADR-027).
```

- [ ] **Step 2: Actualizar `.claude/docs/API.md`**

Na secção de endpoints internos (`/api/internal/clientes/...`), adicionar:

```markdown
| PATCH | /api/internal/clientes/:id/agendamentos/:agendamentoId/presenca | Regista resposta ao follow-up pós-sessão (Compareceu/Não Compareceu; nunca sobrepõe status da equipa) | X-Service-Token |
| GET | /api/internal/clientes/:id/followup-pendente | Follow-up pós-sessão pendente (<24h, sem resposta) ou null | X-Service-Token |
| POST | /api/internal/clientes/:id/renovacao-interesse | Handoff de renovação de pacote — alerta equipa (WhatsApp + push) | X-Service-Token |
```

(Ajustar ao formato real do ficheiro — seguir o estilo das linhas vizinhas dos outros endpoints internos.)

- [ ] **Step 3: Suite completa backend**

Run: `npm test`
Expected: PASS total (incluindo os 5 ficheiros de teste novos e zero regressões nos existentes — em particular `notification-reminders-stale`, `agendamento*`, `cliente*`, `webhook*`).

- [ ] **Step 4: Suite completa Python**

Run (a partir de `ia-service/`): `.venv/bin/pytest && ruff check . && ruff format --check .`
Expected: PASS total, ruff limpo.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-02-follow-up-pos-sessao-design.md .claude/docs/API.md
git commit -m "docs(followup): spec corrigida (endpoint followup-pendente) + API.md"
```

---

## Notas de rollout (não são tasks)

- Deploy é seguro com IA desligada: em produção `iaGlobalAtiva=false`, logo o worker faz skip (`ia_global_off`) — nada é enviado até a Laura ligar a IA.
- Kill-switch dedicado: `Tenant.configuracoes.followUpPosSessaoAtivo = false` desliga só o follow-up (sem UI por agora — via script/BD, como o intervalo de arrumação).
- Merge em `main` dispara o auto-deploy do Contabo e reconstrói backend E ia-service juntos — este plano altera os dois, portanto o comportamento novo entra coerente.
- Sem migração de dados: campos novos são opcionais/default.
