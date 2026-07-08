# Aviso de ligação WhatsApp (Evolution) em baixo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar quando a instância Evolution perde a ligação ao WhatsApp e avisar por email (Resend) + Sentry — canais independentes do WhatsApp — com lembrete diário enquanto durar e email na recuperação.

**Architecture:** Um poller CRON (`node-cron`, 5 min) e um hook reactivo no `sendWhatsAppMessage` convergem numa única função `checkInstanceHealth`, que consulta `connectionState`, decide via uma função **pura** `decideAlert`, persiste o estado no Tenant (`$set` cirúrgico) e dispara o canal. Espelha o padrão `messageRouter.decide` (decisor puro + caller impuro) e o `lembreteParcelaJob` (starter de CRON gated por env).

**Tech Stack:** Node.js ESM, Express, Mongoose 8, `node-cron` ^3, `@sentry/node` ^10, `luxon` ^3, Jest 29 (ESM, `jest.unstable_mockModule`), `mongodb-memory-server`.

## Global Constraints

- ESM: **extensão `.js` obrigatória** em todos os imports relativos.
- Sem secrets hardcoded — tudo de `process.env.*` (`EVOLUTION_API_KEY`, `EVOLUTION_API_URL`, `ALERT_EMAIL`, `EVOLUTION_MANAGER_URL`). Constante nomeada `'Europe/Lisbon'` permitida.
- **Nunca `await` em loop** — usar `Promise.all` / `Promise.allSettled`.
- Datas de negócio com **luxon `Europe/Lisbon`**; `decideAlert` recebe `now` como argumento (puro, determinístico — sem `DateTime.now()` lá dentro).
- Persistência do estado por **`$set` cirúrgico** em `whatsapp.health.*` — **nunca** substituir o objecto `whatsapp` (lição do "wipe silencioso").
- Testes em `tests/` (nunca `src/__tests__/`), Jest ESM: `import { jest } from '@jest/globals'`, `jest.unstable_mockModule(...)` + `await import(...)`. Mockar sempre serviços externos (axios, `emailService`, `@sentry/node`). BD via `mongodb-memory-server` (helpers `./setup.js`).
- Factory de Tenant nos testes: só `nome` + `slug` (único, `^[a-z0-9-]+$`) são obrigatórios.

---

### Task 1: Campo `whatsapp.health` no schema Tenant

**Files:**
- Modify: `src/models/Tenant.js` (dentro do subdoc `whatsapp`, a seguir a `webhookUrl` na linha ~134)
- Test: `tests/evolution-tenant-health-field.test.js`

**Interfaces:**
- Produces: subdoc `whatsapp.health = { state: 'open'|'down'|'unknown', downSince: Date|null, lastAlertAt: Date|null }`. Necessário porque, com `strict` (default), um `$set` em caminhos fora do schema é silenciosamente ignorado.

- [ ] **Step 1: Escrever o teste que falha**

`tests/evolution-tenant-health-field.test.js`:
```js
import { jest } from '@jest/globals';

const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;

beforeAll(async () => { await setupTestDB(); });
afterAll(async () => { await teardownTestDB(); });
afterEach(async () => { await clearDB(); });

describe('Tenant.whatsapp.health', () => {
  it('default state = "unknown" e persiste via $set cirúrgico sem apagar irmãos', async () => {
    const t = await Tenant.create({
      nome: 'Clínica H', slug: 'clinica-h',
      whatsapp: { provider: 'evolution', instanceName: 'marcai' },
    });
    expect(t.whatsapp.health.state).toBe('unknown');

    const downSince = new Date('2026-07-08T00:00:00Z');
    await Tenant.updateOne(
      { _id: t._id },
      { $set: { 'whatsapp.health.state': 'down', 'whatsapp.health.downSince': downSince } },
    );

    const reloaded = await Tenant.findById(t._id).lean();
    expect(reloaded.whatsapp.health.state).toBe('down');
    expect(reloaded.whatsapp.health.downSince).toEqual(downSince);
    // irmãos preservados
    expect(reloaded.whatsapp.instanceName).toBe('marcai');
    expect(reloaded.whatsapp.provider).toBe('evolution');
  });
});
```

- [ ] **Step 2: Correr o teste — deve falhar**

Run: `npm test -- --testPathPattern=evolution-tenant-health-field`
Expected: FAIL — `t.whatsapp.health` é `undefined` (`Cannot read properties of undefined (reading 'state')`).

- [ ] **Step 3: Adicionar o subdoc ao schema**

Em `src/models/Tenant.js`, dentro de `whatsapp: { ... }`, logo a seguir a `webhookUrl: String,`:
```js
        webhookUrl: String,
        // Estado de saúde da ligação — feature de alerta (2026-07-08).
        // Actualizado por $set cirúrgico em whatsapp.health.* pelo evolutionHealthService.
        health: {
            state:       { type: String, enum: ['open', 'down', 'unknown'], default: 'unknown' },
            downSince:   { type: Date, default: null },
            lastAlertAt: { type: Date, default: null },
        },
```

- [ ] **Step 4: Correr o teste — deve passar**

Run: `npm test -- --testPathPattern=evolution-tenant-health-field`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/models/Tenant.js tests/evolution-tenant-health-field.test.js
git commit -m "feat(evolution-health): campo whatsapp.health no schema Tenant"
```

---

### Task 2: Módulo de decisão puro `evolutionHealthDecision.js`

**Files:**
- Create: `src/services/evolutionHealthDecision.js`
- Test: `tests/evolution-health-decision.test.js`

**Interfaces:**
- Produces:
  - `normalizeObserved(connResult) → { healthy: boolean, reason: 'session_closed'|'api_unreachable'|null }`
  - `isDisconnectError(error) → boolean`
  - `decideAlert(stored, observed, now, { confirmMs, dailyMs }) → { nextState: { state, downSince, lastAlertAt }, action: 'none'|'notify_down'|'notify_daily'|'notify_recovered', reason }`
    - `stored`: `{ state?: string, downSince?: Date|null, lastAlertAt?: Date|null }`
    - `observed`: saída de `normalizeObserved`
    - `now`: `Date`

- [ ] **Step 1: Escrever os testes que falham**

`tests/evolution-health-decision.test.js`:
```js
import { decideAlert, normalizeObserved, isDisconnectError } from '../src/services/evolutionHealthDecision.js';

const OPTS = { confirmMs: 180000, dailyMs: 86400000 };
const t0 = new Date('2026-07-08T00:00:00Z');
const at = (ms) => new Date(t0.getTime() + ms);
const down = { healthy: false, reason: 'session_closed' };
const up = { healthy: true, reason: null };

describe('normalizeObserved', () => {
  it('open → healthy', () => {
    expect(normalizeObserved({ ok: true, state: 'open' })).toEqual({ healthy: true, reason: null });
  });
  it('connecting/close → session_closed', () => {
    expect(normalizeObserved({ ok: true, state: 'connecting' })).toEqual({ healthy: false, reason: 'session_closed' });
    expect(normalizeObserved({ ok: true, state: 'close' })).toEqual({ healthy: false, reason: 'session_closed' });
  });
  it('unreachable → api_unreachable', () => {
    expect(normalizeObserved({ ok: false, unreachable: true, error: 'x' })).toEqual({ healthy: false, reason: 'api_unreachable' });
  });
});

describe('isDisconnectError', () => {
  it('apanha "Connection Closed" em objecto aninhado', () => {
    expect(isDisconnectError({ status: 500, response: { message: 'Connection Closed' } })).toBe(true);
  });
  it('apanha em string', () => {
    expect(isDisconnectError('Connection Terminated')).toBe(true);
  });
  it('ignora erro não-desconexão', () => {
    expect(isDisconnectError({ status: 400, message: 'invalid number' })).toBe(false);
    expect(isDisconnectError(null)).toBe(false);
  });
});

describe('decideAlert', () => {
  it('open + healthy = none', () => {
    const r = decideAlert({ state: 'open', downSince: null, lastAlertAt: null }, up, at(0), OPTS);
    expect(r.action).toBe('none');
    expect(r.nextState.state).toBe('open');
  });
  it('open + unhealthy = arma relógio (none)', () => {
    const r = decideAlert({ state: 'open', downSince: null, lastAlertAt: null }, down, at(0), OPTS);
    expect(r.action).toBe('none');
    expect(r.nextState).toEqual({ state: 'down', downSince: at(0), lastAlertAt: null });
  });
  it('down <confirm = none (blip protegido)', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: null }, down, at(60000), OPTS);
    expect(r.action).toBe('none');
  });
  it('down ≥confirm, nunca alertou = notify_down', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: null }, down, at(200000), OPTS);
    expect(r.action).toBe('notify_down');
    expect(r.nextState.lastAlertAt).toEqual(at(200000));
    expect(r.reason).toBe('session_closed');
  });
  it('down já alertado <daily = none', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: at(200000) }, down, at(200000 + 3600000), OPTS);
    expect(r.action).toBe('none');
  });
  it('down já alertado ≥daily = notify_daily', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: at(0) }, down, at(86400001), OPTS);
    expect(r.action).toBe('notify_daily');
    expect(r.nextState.lastAlertAt).toEqual(at(86400001));
  });
  it('down alertado + healthy = notify_recovered', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: at(200000) }, up, at(300000), OPTS);
    expect(r.action).toBe('notify_recovered');
    expect(r.nextState.state).toBe('open');
  });
  it('down nunca alertado (blip) + healthy = none', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: null }, up, at(60000), OPTS);
    expect(r.action).toBe('none');
    expect(r.nextState.state).toBe('open');
  });
});
```

- [ ] **Step 2: Correr — deve falhar**

Run: `npm test -- --testPathPattern=evolution-health-decision`
Expected: FAIL — `Cannot find module '../src/services/evolutionHealthDecision.js'`.

- [ ] **Step 3: Implementar o módulo puro**

`src/services/evolutionHealthDecision.js`:
```js
/**
 * evolutionHealthDecision — lógica pura da máquina de estados do alerta de
 * ligação WhatsApp. Sem I/O, sem tempo interno (recebe `now`), sem Random.
 * Espelha o padrão messageRouter.decide (decisor puro + caller impuro).
 */

/** Normaliza o resultado de getConnectionState num par healthy/reason. */
export function normalizeObserved(connResult) {
  if (connResult?.ok && connResult.state === 'open') return { healthy: true, reason: null };
  if (connResult?.ok) return { healthy: false, reason: 'session_closed' };
  return { healthy: false, reason: 'api_unreachable' };
}

/** True se o erro de envio indica desconexão do WhatsApp (não um erro de payload). */
export function isDisconnectError(error) {
  if (!error) return false;
  const text = typeof error === 'string' ? error : JSON.stringify(error);
  return /connection closed|connection terminated|not connected|disconnected/i.test(text);
}

/**
 * Decide a acção de alerta a partir do estado guardado + o observado.
 * @returns {{ nextState: {state,downSince,lastAlertAt}, action, reason }}
 */
export function decideAlert(stored, observed, now, { confirmMs, dailyMs }) {
  const prev = {
    state: stored?.state || 'unknown',
    downSince: stored?.downSince ? new Date(stored.downSince) : null,
    lastAlertAt: stored?.lastAlertAt ? new Date(stored.lastAlertAt) : null,
  };
  const nowMs = now.getTime();

  if (observed.healthy) {
    const recovered = prev.state === 'down' && prev.lastAlertAt != null;
    return {
      nextState: { state: 'open', downSince: null, lastAlertAt: null },
      action: recovered ? 'notify_recovered' : 'none',
      reason: null,
    };
  }

  // unhealthy
  const downSince = prev.state === 'down' && prev.downSince ? prev.downSince : now;

  // ainda não alertou neste episódio
  if (prev.state !== 'down' || prev.lastAlertAt == null) {
    if (nowMs - downSince.getTime() >= confirmMs) {
      return {
        nextState: { state: 'down', downSince, lastAlertAt: now },
        action: 'notify_down',
        reason: observed.reason,
      };
    }
    return {
      nextState: { state: 'down', downSince, lastAlertAt: null },
      action: 'none',
      reason: observed.reason,
    };
  }

  // já alertou → lembrete diário?
  if (nowMs - prev.lastAlertAt.getTime() >= dailyMs) {
    return {
      nextState: { state: 'down', downSince, lastAlertAt: now },
      action: 'notify_daily',
      reason: observed.reason,
    };
  }
  return {
    nextState: { state: 'down', downSince, lastAlertAt: prev.lastAlertAt },
    action: 'none',
    reason: observed.reason,
  };
}
```

- [ ] **Step 4: Correr — deve passar**

Run: `npm test -- --testPathPattern=evolution-health-decision`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/services/evolutionHealthDecision.js tests/evolution-health-decision.test.js
git commit -m "feat(evolution-health): decisor puro decideAlert + normalizeObserved + isDisconnectError"
```

---

### Task 3: `getConnectionState` + hook reactivo no evolutionClient

**Files:**
- Modify: `src/utils/evolutionClient.js`
- Test: `tests/evolution-client-connection-state.test.js`

**Interfaces:**
- Consumes: módulo-level `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `axios`, `logger` (já existentes).
- Produces:
  - `getConnectionState(instanceName) → Promise<{ ok:true, state } | { ok:false, unreachable:true, error }>`
  - `registerSendFailureHandler(fn)` — regista callback `(instance, errorPayload)` chamado quando um envio falha.

- [ ] **Step 1: Escrever os testes que falham**

`tests/evolution-client-connection-state.test.js`:
```js
import { jest } from '@jest/globals';

process.env.EVOLUTION_API_URL = 'http://evolution.test';
process.env.EVOLUTION_API_KEY = 'test-api-key';
process.env.EVOLUTION_INSTANCE = 'env-default';

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const axios = (await import('axios')).default;
const { getConnectionState, registerSendFailureHandler, sendWhatsAppMessage } =
  await import('../src/utils/evolutionClient.js');

beforeEach(() => { axios.get.mockReset(); axios.post.mockReset(); });

describe('getConnectionState', () => {
  it('caminho feliz → { ok:true, state }', async () => {
    axios.get.mockResolvedValue({ data: { instance: { instanceName: 'marcai', state: 'open' } } });
    const r = await getConnectionState('marcai');
    expect(r).toEqual({ ok: true, state: 'open' });
    expect(axios.get.mock.calls[0][0]).toBe('http://evolution.test/instance/connectionState/marcai');
    expect(axios.get.mock.calls[0][1].headers).toMatchObject({ apikey: 'test-api-key' });
  });
  it('erro de rede → { ok:false, unreachable:true }', async () => {
    axios.get.mockRejectedValue({ message: 'ECONNREFUSED' });
    const r = await getConnectionState('marcai');
    expect(r.ok).toBe(false);
    expect(r.unreachable).toBe(true);
  });
});

describe('registerSendFailureHandler', () => {
  it('invoca o handler com (instance, errorPayload) quando o envio falha', async () => {
    axios.post.mockRejectedValue({ response: { data: { response: { message: 'Connection Closed' } } } });
    const handler = jest.fn();
    registerSendFailureHandler(handler);
    await sendWhatsAppMessage('912345678', 'oi', 'marcai');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe('marcai');
    registerSendFailureHandler(null); // limpa para não afectar outros testes
  });
  it('não invoca handler quando o envio tem sucesso', async () => {
    axios.post.mockResolvedValue({ data: { ok: true } });
    const handler = jest.fn();
    registerSendFailureHandler(handler);
    await sendWhatsAppMessage('912345678', 'oi', 'marcai');
    expect(handler).not.toHaveBeenCalled();
    registerSendFailureHandler(null);
  });
});
```

- [ ] **Step 2: Correr — deve falhar**

Run: `npm test -- --testPathPattern=evolution-client-connection-state`
Expected: FAIL — `getConnectionState is not a function` / `registerSendFailureHandler is not a function`.

- [ ] **Step 3: Implementar no evolutionClient**

Em `src/utils/evolutionClient.js`, a seguir às constantes do topo (após a linha `const EVOLUTION_INSTANCE = ...`):
```js
// Handler reactivo opcional: chamado quando um envio falha (para o health check).
// Registado no arranque por evolutionHealthJob; nunca importa o serviço aqui
// (evita ciclo de imports).
let sendFailureHandler = null;
export function registerSendFailureHandler(fn) {
  sendFailureHandler = typeof fn === 'function' ? fn : null;
}
```

Substituir o bloco `catch` de `sendWhatsAppMessage` por:
```js
  } catch (error) {
    const errPayload = error.response?.data || error.message;
    logger.error({ to: phoneNormalized, instance, err: errPayload }, '[Evolution] Erro ao enviar mensagem');
    if (sendFailureHandler) {
      try { sendFailureHandler(instance, errPayload); }
      catch (cbErr) { logger.error({ err: cbErr.message }, '[Evolution] sendFailureHandler lançou'); }
    }
    return { success: false, error: errPayload };
  }
```

No fim do ficheiro, adicionar a nova função:
```js
/**
 * Consulta o estado de ligação de uma instância Evolution.
 * @param {string} [instanceName]  cai para EVOLUTION_INSTANCE se omisso
 * @returns {Promise<{ok:true,state:string}|{ok:false,unreachable:true,error:*}>}
 */
export const getConnectionState = async (instanceName) => {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return { ok: false, unreachable: true, error: 'Evolution API não configurada' };
  }
  const instance = (instanceName && String(instanceName).trim()) || EVOLUTION_INSTANCE;
  try {
    const response = await axios.get(
      `${EVOLUTION_API_URL}/instance/connectionState/${instance}`,
      { headers: { apikey: EVOLUTION_API_KEY } },
    );
    const state = response.data?.instance?.state || response.data?.state || null;
    return { ok: true, state };
  } catch (error) {
    return { ok: false, unreachable: true, error: error.response?.data || error.message };
  }
};
```

- [ ] **Step 4: Correr — deve passar (e não partir os testes existentes do client)**

Run: `npm test -- --testPathPattern=evolution-client`
Expected: PASS — tanto `evolution-client-connection-state` como `evolution-client-instance` (retrocompat do `sendWhatsAppMessage`).

- [ ] **Step 5: Commit**

```bash
git add src/utils/evolutionClient.js tests/evolution-client-connection-state.test.js
git commit -m "feat(evolution-health): getConnectionState + hook reactivo de falha de envio"
```

---

### Task 4: `evolutionHealthService.js` — check, entrega e caminho reactivo

**Files:**
- Create: `src/services/evolutionHealthService.js`
- Test: `tests/evolution-health-service.test.js`

**Interfaces:**
- Consumes: `decideAlert`, `normalizeObserved`, `isDisconnectError` (Task 2); `getConnectionState` (Task 3); `sendEmail` (`emailService`); `Tenant`; `Sentry`.
- Produces:
  - `checkInstanceHealth(tenant) → Promise<void>` — `tenant` lean com `{ _id, nome, whatsapp: { instanceName, health } }`
  - `noteSendFailure(instanceName, errorPayload) → void` (fire-and-forget, com debounce)
  - `buildAlertEmail({ action, reason, tenantNome, instanceName, downSince }) → { subject, html, text }`

- [ ] **Step 1: Escrever os testes que falham**

`tests/evolution-health-service.test.js`:
```js
import { jest } from '@jest/globals';

process.env.EVOLUTION_HEALTH_CONFIRM_MS = '180000';
process.env.EVOLUTION_HEALTH_DAILY_MS = '86400000';
process.env.EVOLUTION_HEALTH_RECHECK_DEBOUNCE_MS = '60000';
process.env.ALERT_EMAIL = 'ops@marcai.pt';

jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  getConnectionState: jest.fn(),
  registerSendFailureHandler: jest.fn(),
}));
jest.unstable_mockModule('../src/services/emailService.js', () => ({
  sendEmail: jest.fn().mockResolvedValue({ id: 'mock-email' }),
}));
jest.unstable_mockModule('@sentry/node', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { getConnectionState } = await import('../src/utils/evolutionClient.js');
const { sendEmail } = await import('../src/services/emailService.js');
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;
const { checkInstanceHealth, noteSendFailure } = await import('../src/services/evolutionHealthService.js');

const flush = () => new Promise((r) => setTimeout(r, 60));
let n = 0;
async function makeTenant(health, extraWhatsapp = {}) {
  n += 1;
  return Tenant.create({
    nome: 'Clínica Teste',
    slug: `clinica-svc-${n}`,
    whatsapp: { provider: 'evolution', instanceName: 'marcai', numeroWhatsapp: '351913402709', health, ...extraWhatsapp },
  });
}
const leanById = (id) => Tenant.findById(id).lean();

beforeAll(async () => { await setupTestDB(); });
afterAll(async () => { await teardownTestDB(); });
afterEach(async () => { await clearDB(); jest.clearAllMocks(); });

describe('checkInstanceHealth', () => {
  it('queda nova → arma o relógio, sem email', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'connecting' });
    const t = await makeTenant({ state: 'unknown', downSince: null, lastAlertAt: null });
    await checkInstanceHealth(await leanById(t._id));
    expect(sendEmail).not.toHaveBeenCalled();
    const after = await leanById(t._id);
    expect(after.whatsapp.health.state).toBe('down');
    expect(after.whatsapp.health.downSince).toBeTruthy();
    expect(after.whatsapp.health.lastAlertAt).toBeNull();
  });

  it('queda confirmada (≥3min) → envia email e grava lastAlertAt', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'close' });
    const downSince = new Date(Date.now() - 4 * 60 * 1000);
    const t = await makeTenant({ state: 'down', downSince, lastAlertAt: null });
    await checkInstanceHealth(await leanById(t._id));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('ops@marcai.pt');
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/desligado/i);
    const after = await leanById(t._id);
    expect(after.whatsapp.health.lastAlertAt).toBeTruthy();
  });

  it('email falha → NÃO grava lastAlertAt (re-tenta), mantém estado down', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'close' });
    sendEmail.mockRejectedValueOnce(new Error('smtp down'));
    const downSince = new Date(Date.now() - 4 * 60 * 1000);
    const t = await makeTenant({ state: 'down', downSince, lastAlertAt: null });
    await checkInstanceHealth(await leanById(t._id));
    const after = await leanById(t._id);
    expect(after.whatsapp.health.state).toBe('down');
    expect(after.whatsapp.health.lastAlertAt).toBeNull();
  });

  it('$set cirúrgico preserva irmãos de whatsapp', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'connecting' });
    const t = await makeTenant({ state: 'unknown', downSince: null, lastAlertAt: null });
    await checkInstanceHealth(await leanById(t._id));
    const after = await leanById(t._id);
    expect(after.whatsapp.instanceName).toBe('marcai');
    expect(after.whatsapp.numeroWhatsapp).toBe('351913402709');
    expect(after.whatsapp.provider).toBe('evolution');
  });

  it('recuperação → email de reconectado e estado open', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'open' });
    const t = await makeTenant({ state: 'down', downSince: new Date(Date.now() - 3600000), lastAlertAt: new Date(Date.now() - 1800000) });
    await checkInstanceHealth(await leanById(t._id));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/reconectado/i);
    const after = await leanById(t._id);
    expect(after.whatsapp.health.state).toBe('open');
    expect(after.whatsapp.health.downSince).toBeNull();
  });
});

describe('noteSendFailure', () => {
  it('ignora erro que não é de desconexão', async () => {
    const t = await makeTenant({ state: 'unknown', downSince: null, lastAlertAt: null });
    noteSendFailure('marcai', { status: 400, message: 'invalid number' });
    await flush();
    expect(getConnectionState).not.toHaveBeenCalled();
    await Tenant.deleteOne({ _id: t._id });
  });

  it('erro de desconexão dispara um check (e debounce colapsa chamadas rápidas)', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'open' });
    const t = await makeTenant({ state: 'unknown', downSince: null, lastAlertAt: null });
    noteSendFailure('marcai', { response: { message: 'Connection Closed' } });
    noteSendFailure('marcai', { response: { message: 'Connection Closed' } });
    await flush();
    expect(getConnectionState).toHaveBeenCalledTimes(1);
    await Tenant.deleteOne({ _id: t._id });
  });
});
```

- [ ] **Step 2: Correr — deve falhar**

Run: `npm test -- --testPathPattern=evolution-health-service`
Expected: FAIL — `Cannot find module '../src/services/evolutionHealthService.js'`.

- [ ] **Step 3: Implementar o serviço**

`src/services/evolutionHealthService.js`:
```js
/**
 * evolutionHealthService — orquestra a verificação de saúde da ligação WhatsApp
 * e a entrega de alertas. Caller impuro do decisor puro evolutionHealthDecision.
 */
import { DateTime } from 'luxon';
import * as Sentry from '@sentry/node';
import Tenant from '../models/Tenant.js';
import logger from '../utils/logger.js';
import { sendEmail } from './emailService.js';
import { getConnectionState } from '../utils/evolutionClient.js';
import { decideAlert, normalizeObserved, isDisconnectError } from './evolutionHealthDecision.js';

const ZONA = 'Europe/Lisbon';
const CONFIRM_MS = parseInt(process.env.EVOLUTION_HEALTH_CONFIRM_MS, 10) || 180000;
const DAILY_MS = parseInt(process.env.EVOLUTION_HEALTH_DAILY_MS, 10) || 86400000;
const RECHECK_DEBOUNCE_MS = parseInt(process.env.EVOLUTION_HEALTH_RECHECK_DEBOUNCE_MS, 10) || 60000;
const ALERT_EMAIL = process.env.ALERT_EMAIL || '';
const MANAGER_URL = process.env.EVOLUTION_MANAGER_URL || '';

const inFlight = new Set();
const lastReactiveCheck = new Map();

function fmt(date) {
  return date ? DateTime.fromJSDate(new Date(date)).setZone(ZONA).toFormat('dd/MM/yyyy HH:mm') : '—';
}

export function buildAlertEmail({ action, reason, tenantNome, instanceName, downSince }) {
  if (action === 'notify_recovered') {
    const subject = `✅ Marcai: WhatsApp reconectado (instância ${instanceName})`;
    const text = `A ligação WhatsApp da instância "${instanceName}" (${tenantNome}) voltou a estar ONLINE.`;
    return { subject, text, html: `<p>${text}</p>` };
  }
  const motivo = reason === 'api_unreachable'
    ? 'A API Evolution está inacessível (serviço em baixo).'
    : 'A sessão de WhatsApp está desligada (telemóvel offline / sessão terminada).';
  const prefix = action === 'notify_daily' ? '[Lembrete] ' : '';
  const subject = `⚠️ ${prefix}Marcai: WhatsApp desligado (instância ${instanceName})`;
  const linkManager = MANAGER_URL
    ? `<li>Abrir o Manager: <a href="${MANAGER_URL}">${MANAGER_URL}</a> (login = API key)</li>`
    : `<li>Abrir o Manager da Evolution (login = API key)</li>`;
  const text = [
    'A ligação WhatsApp está EM BAIXO.',
    `Instância: ${instanceName}`,
    `Clínica: ${tenantNome}`,
    `Desde: ${fmt(downSince)} (Europe/Lisbon)`,
    `Motivo: ${motivo}`,
    'Nenhum envio (manual, IA ou lembretes) sai enquanto isto durar.',
    `Como resolver: no Manager${MANAGER_URL ? ` (${MANAGER_URL})` : ''}, instância "${instanceName}", a Laura scaneia o QR no telemóvel (WhatsApp → Dispositivos ligados → Ligar um dispositivo).`,
  ].join('\n');
  const html = `
    <h2>⚠️ WhatsApp desligado — ${instanceName}</h2>
    <p><b>Clínica:</b> ${tenantNome}<br/>
    <b>Desde:</b> ${fmt(downSince)} (Europe/Lisbon)<br/>
    <b>Motivo:</b> ${motivo}</p>
    <p>Nenhum envio (manual, IA ou lembretes) sai enquanto isto durar.</p>
    <p><b>Como resolver:</b></p>
    <ol>${linkManager}<li>Instância <code>${instanceName}</code> → a Laura scaneia o QR (WhatsApp → Dispositivos ligados → Ligar um dispositivo).</li></ol>`;
  return { subject, text, html };
}

/** Entrega o alerta. Sentry sempre; email se ALERT_EMAIL definido.
 *  @returns {Promise<boolean>} true se considerado entregue (p/ avançar dedup) */
async function deliverAlert(ctx) {
  const level = ctx.action === 'notify_recovered' ? 'info' : 'warning';
  try { Sentry.captureMessage(`[Evolution] ${ctx.action} — instância ${ctx.instanceName}`, level); }
  catch { /* best-effort */ }

  if (!ALERT_EMAIL) {
    logger.warn({ instance: ctx.instanceName, action: ctx.action }, '[EvolutionHealth] ALERT_EMAIL não definido — só Sentry');
    return true; // Sentry é o canal configurado
  }
  try {
    const { subject, html, text } = buildAlertEmail(ctx);
    await sendEmail({ to: ALERT_EMAIL, subject, html, text });
    logger.info({ instance: ctx.instanceName, action: ctx.action, to: ALERT_EMAIL }, '[EvolutionHealth] Email de alerta enviado');
    return true;
  } catch (err) {
    logger.error({ instance: ctx.instanceName, err: err.message }, '[EvolutionHealth] Falha a enviar email — vai re-tentar');
    return false;
  }
}

export async function checkInstanceHealth(tenant) {
  const instanceName = tenant?.whatsapp?.instanceName;
  if (!instanceName) return;
  if (inFlight.has(instanceName)) return;
  inFlight.add(instanceName);
  try {
    const conn = await getConnectionState(instanceName);
    const observed = normalizeObserved(conn);
    const stored = tenant.whatsapp?.health || {};
    const now = DateTime.now().setZone(ZONA).toJSDate();
    const decision = decideAlert(stored, observed, now, { confirmMs: CONFIRM_MS, dailyMs: DAILY_MS });

    let persist = decision.nextState;
    if (decision.action !== 'none') {
      const delivered = await deliverAlert({
        action: decision.action,
        reason: decision.reason,
        tenantNome: tenant.nome,
        instanceName,
        downSince: decision.nextState.downSince || stored.downSince || now,
      });
      if (!delivered) {
        // não avança lastAlertAt nem transiciona para open → re-tenta no próximo ciclo
        persist = decision.action === 'notify_recovered'
          ? { state: 'down', downSince: stored.downSince || null, lastAlertAt: stored.lastAlertAt || null }
          : { state: 'down', downSince: decision.nextState.downSince, lastAlertAt: stored.lastAlertAt || null };
      }
    }

    await Tenant.updateOne(
      { _id: tenant._id },
      { $set: {
        'whatsapp.health.state': persist.state,
        'whatsapp.health.downSince': persist.downSince,
        'whatsapp.health.lastAlertAt': persist.lastAlertAt,
      } },
    );
  } catch (err) {
    logger.error({ instance: instanceName, err: err.message }, '[EvolutionHealth] checkInstanceHealth falhou');
  } finally {
    inFlight.delete(instanceName);
  }
}

async function triggerCheck(instanceName) {
  try {
    const tenant = await Tenant.findOne({ 'whatsapp.instanceName': instanceName })
      .select('_id nome whatsapp.instanceName whatsapp.health')
      .lean();
    if (tenant) await checkInstanceHealth(tenant);
  } catch (err) {
    logger.error({ instance: instanceName, err: err.message }, '[EvolutionHealth] triggerCheck falhou');
  }
}

/** Entrada reactiva: falha de envio de desconexão → check imediato (debounced)
 *  + 1 recheck de confirmação a CONFIRM_MS. Fire-and-forget, nunca lança. */
export function noteSendFailure(instanceName, errorPayload) {
  try {
    if (!instanceName || !isDisconnectError(errorPayload)) return;
    const now = Date.now();
    if (now - (lastReactiveCheck.get(instanceName) || 0) < RECHECK_DEBOUNCE_MS) return;
    lastReactiveCheck.set(instanceName, now);
    triggerCheck(instanceName);
    const t = setTimeout(() => triggerCheck(instanceName), CONFIRM_MS);
    if (typeof t.unref === 'function') t.unref();
  } catch (err) {
    logger.error({ instance: instanceName, err: err.message }, '[EvolutionHealth] noteSendFailure falhou');
  }
}
```

- [ ] **Step 4: Correr — deve passar**

Run: `npm test -- --testPathPattern=evolution-health-service`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add src/services/evolutionHealthService.js tests/evolution-health-service.test.js
git commit -m "feat(evolution-health): checkInstanceHealth + entrega email/Sentry + noteSendFailure reactivo"
```

---

### Task 5: CRON `evolutionHealthJob.js` + wiring no server

**Files:**
- Create: `src/jobs/evolutionHealthJob.js`
- Modify: `src/server.js` (import + chamada a seguir a `startLembreteParcelaCron()`)
- Test: `tests/evolution-health-job.test.js`

**Interfaces:**
- Consumes: `checkInstanceHealth`, `noteSendFailure` (Task 4); `registerSendFailureHandler` (Task 3); `Tenant`; `node-cron`.
- Produces:
  - `checkAllInstances() → Promise<void>` — itera tenants com `whatsapp.instanceName` e chama `checkInstanceHealth` em paralelo.
  - `startEvolutionHealthCron() → task|null` — regista o handler reactivo e agenda o CRON (gated por `EVOLUTION_HEALTH_CRON=off`).

- [ ] **Step 1: Escrever os testes que falham**

`tests/evolution-health-job.test.js`:
```js
import { jest } from '@jest/globals';

jest.unstable_mockModule('node-cron', () => ({
  default: { schedule: jest.fn(() => ({ stop: jest.fn() })) },
}));
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  getConnectionState: jest.fn().mockResolvedValue({ ok: true, state: 'open' }),
  registerSendFailureHandler: jest.fn(),
}));
jest.unstable_mockModule('../src/services/emailService.js', () => ({
  sendEmail: jest.fn().mockResolvedValue({ id: 'mock' }),
}));
jest.unstable_mockModule('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const cron = (await import('node-cron')).default;
const { getConnectionState, registerSendFailureHandler } = await import('../src/utils/evolutionClient.js');
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;
const { checkAllInstances, startEvolutionHealthCron } = await import('../src/jobs/evolutionHealthJob.js');

beforeAll(async () => { await setupTestDB(); });
afterAll(async () => { await teardownTestDB(); });
afterEach(async () => { await clearDB(); jest.clearAllMocks(); delete process.env.EVOLUTION_HEALTH_CRON; });

describe('checkAllInstances', () => {
  it('só verifica tenants com instanceName', async () => {
    await Tenant.create({ nome: 'Com WA', slug: 'com-wa', whatsapp: { instanceName: 'marcai' } });
    await Tenant.create({ nome: 'Sem WA', slug: 'sem-wa' });
    await checkAllInstances();
    expect(getConnectionState).toHaveBeenCalledTimes(1);
    expect(getConnectionState).toHaveBeenCalledWith('marcai');
  });
});

describe('startEvolutionHealthCron', () => {
  it('EVOLUTION_HEALTH_CRON=off → não agenda, devolve null', () => {
    process.env.EVOLUTION_HEALTH_CRON = 'off';
    const task = startEvolutionHealthCron();
    expect(task).toBeNull();
    expect(cron.schedule).not.toHaveBeenCalled();
  });
  it('por default → regista handler reactivo e agenda a */5', () => {
    const task = startEvolutionHealthCron();
    expect(registerSendFailureHandler).toHaveBeenCalledTimes(1);
    expect(cron.schedule).toHaveBeenCalledTimes(1);
    expect(cron.schedule.mock.calls[0][0]).toBe('*/5 * * * *');
    expect(task).not.toBeNull();
  });
});
```

- [ ] **Step 2: Correr — deve falhar**

Run: `npm test -- --testPathPattern=evolution-health-job`
Expected: FAIL — `Cannot find module '../src/jobs/evolutionHealthJob.js'`.

- [ ] **Step 3: Implementar o job**

`src/jobs/evolutionHealthJob.js`:
```js
/**
 * CRON de saúde da ligação WhatsApp (Evolution). A cada 5 min verifica cada
 * instância configurada e alerta (email + Sentry) quando cai / recupera.
 * Também liga o caminho reactivo (falha de envio → check imediato).
 */
import cron from 'node-cron';
import Tenant from '../models/Tenant.js';
import logger from '../utils/logger.js';
import { registerSendFailureHandler } from '../utils/evolutionClient.js';
import { checkInstanceHealth, noteSendFailure } from '../services/evolutionHealthService.js';

const ZONA = 'Europe/Lisbon';

export async function checkAllInstances() {
  const tenants = await Tenant.find({ 'whatsapp.instanceName': { $type: 'string', $ne: '' } })
    .select('_id nome whatsapp.instanceName whatsapp.health')
    .lean();
  if (tenants.length === 0) return;
  const resultados = await Promise.allSettled(tenants.map((t) => checkInstanceHealth(t)));
  const erros = resultados.filter((r) => r.status === 'rejected').length;
  logger.info({ total: tenants.length, erros }, '[EvolutionHealth] Ciclo de verificação concluído');
}

export function startEvolutionHealthCron() {
  if (process.env.EVOLUTION_HEALTH_CRON === 'off') {
    logger.info('[EvolutionHealth] CRON desactivado por EVOLUTION_HEALTH_CRON=off');
    return null;
  }
  registerSendFailureHandler(noteSendFailure); // liga o caminho reactivo
  const schedule = process.env.EVOLUTION_HEALTH_CRON_SCHEDULE || '*/5 * * * *';
  const task = cron.schedule(schedule, checkAllInstances, { scheduled: true, timezone: ZONA });
  logger.info({ schedule }, '[EvolutionHealth] CRON registado');
  return task;
}
```

- [ ] **Step 4: Correr — deve passar**

Run: `npm test -- --testPathPattern=evolution-health-job`
Expected: PASS.

- [ ] **Step 5: Ligar no arranque do servidor**

Em `src/server.js`, a seguir a `import { startLembreteParcelaCron } from './jobs/lembreteParcelaJob.js';` (linha 11):
```js
import { startEvolutionHealthCron } from './jobs/evolutionHealthJob.js';
```
E a seguir a `startLembreteParcelaCron();` (linha 38):
```js
  startEvolutionHealthCron();
```

- [ ] **Step 6: Sanidade — a suite completa passa**

Run: `npm test`
Expected: PASS (sem regressões).

- [ ] **Step 7: Commit**

```bash
git add src/jobs/evolutionHealthJob.js src/server.js tests/evolution-health-job.test.js
git commit -m "feat(evolution-health): CRON poller + wiring no server + registo do hook reactivo"
```

---

### Task 6: Documentar env vars

**Files:**
- Modify: `.env.example`, `.env.production.example`

**Interfaces:** nenhuma (documentação).

- [ ] **Step 1: Adicionar as variáveis ao `.env.example`**

Acrescentar um bloco no fim de `.env.example`:
```bash
# --- Aviso de saúde da ligação WhatsApp (Evolution) ---
# Destinatário do email de alerta (vazio = só Sentry). Ex: andredosreis@gmail.com
ALERT_EMAIL=
# URL do Manager da Evolution para o runbook do email (ex: https://wa.<host>.sslip.io/manager/)
EVOLUTION_MANAGER_URL=
# Poller de saúde: 'off' desliga a feature toda
EVOLUTION_HEALTH_CRON=
EVOLUTION_HEALTH_CRON_SCHEDULE=*/5 * * * *
EVOLUTION_HEALTH_CONFIRM_MS=180000
EVOLUTION_HEALTH_DAILY_MS=86400000
EVOLUTION_HEALTH_RECHECK_DEBOUNCE_MS=60000
```

- [ ] **Step 2: Replicar no `.env.production.example`** (mesmo bloco; `ALERT_EMAIL` e `EVOLUTION_MANAGER_URL` preenchidos com os valores reais de produção quando fizeres o deploy).

- [ ] **Step 3: Commit**

```bash
git add .env.example .env.production.example
git commit -m "docs(evolution-health): env vars do aviso de ligação WhatsApp"
```

---

## Rollout (após o merge)

- Definir `ALERT_EMAIL` (o teu email) e `EVOLUTION_MANAGER_URL=https://wa.80.241.222.235.sslip.io/manager/` no env de produção do Contabo.
- Push a `main` → auto-deploy faz rebuild do backend.
- Validar: baixar a instância em janela controlada (ou esperar `CONFIRM_MS`) e confirmar email + evento no Sentry; religar → confirmar email de recuperação.

## Self-review (feito)

- **Cobertura da spec:** §3/§4 arquitectura → Tasks 2–5; §5 máquina de estados → Task 2; §6 config → Tasks 4/6; §7 erros (unreachable, email-falha-não-suprime, reactivo-não-parte-envio, poller robusto, graceful degrade) → Tasks 3/4/5; §8 testes → cada task tem testes. ✔
- **Placeholders:** nenhum — todo o código e testes estão escritos. ✔
- **Consistência de tipos:** `getConnectionState`→`normalizeObserved`→`decideAlert`→`checkInstanceHealth`→`deliverAlert` com as mesmas formas (`{ok,state}`, `{healthy,reason}`, `{nextState,action,reason}`). `registerSendFailureHandler`/`noteSendFailure` casam entre Task 3 e 4/5. ✔
