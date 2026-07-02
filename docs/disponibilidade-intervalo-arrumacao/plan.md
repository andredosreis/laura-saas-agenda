# Intervalo de arrumação entre sessões — Implementation Plan (Fase A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o cálculo de disponibilidade reservar um intervalo de arrumação (default 15 min) entre sessões, ancorado nos agendamentos reais, configurável por tenant.

**Architecture:** Alteração à fonte única `resolveAvailableSlots` (que serve IA + painel + PWA). Um campo novo `Tenant.configuracoes.intervaloEntreSessoes` propaga-se do tenant aos dois callers do helper e à deteção de conflito no booking. Com o intervalo a 0 (default), o comportamento é idêntico ao atual — zero regressão nas outras clínicas.

**Tech Stack:** Node.js ESM, Express, Mongoose 8, Luxon, Jest + Supertest + mongodb-memory-server.

## Global Constraints

- Backend ESM: **extensão `.js` obrigatória em todos os imports**.
- Isolamento multi-tenant: toda query inclui `tenantId`.
- Contrato de resposta fixo: `{ success, data }` / `{ success, error }` (o endpoint legado `/schedules/available-slots` mantém o seu envelope próprio `{ availableSlots }` — não alterar).
- Timezone: `Europe/Lisbon` via Luxon.
- Datas de teste sempre **no futuro** (ex.: 2027) para não colidir com o filtro "hoje" (`nowMinutes`).
- **Commits:** o André pediu para nunca correr `git` sem autorização explícita. Os steps de commit ficam no plano, mas na execução pede-se OK antes de cada `git commit`.
- Testes: `mongodb-memory-server` (nunca DB real). Padrão em `tests/setup.js` (`setupTestDB`/`teardownTestDB`/`clearDB`).

---

### Task 1: Campo `intervaloEntreSessoes` no Tenant

**Files:**
- Modify: `src/models/Tenant.js` (bloco `configuracoes`, junto a `duracaoSessaoPadrao`)
- Test: `tests/tenant-intervalo-config.test.js`

**Interfaces:**
- Produces: `Tenant.configuracoes.intervaloEntreSessoes: number` (minutos, default `0`). Consumido pelas Tasks 3 e 4.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/tenant-intervalo-config.test.js`:

```javascript
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

describe('Tenant.configuracoes.intervaloEntreSessoes', () => {
  it('default é 0 quando não indicado', async () => {
    const t = await Tenant.create({ nome: 'X', slug: 'x', plano: { tipo: 'basico', status: 'ativo' } });
    expect(t.configuracoes.intervaloEntreSessoes).toBe(0);
  });

  it('aceita valor explícito (15)', async () => {
    const t = await Tenant.create({
      nome: 'Y', slug: 'y', plano: { tipo: 'basico', status: 'ativo' },
      configuracoes: { intervaloEntreSessoes: 15 },
    });
    expect(t.configuracoes.intervaloEntreSessoes).toBe(15);
  });
});
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `npm test -- --testPathPattern=tenant-intervalo-config`
Expected: FAIL — `intervaloEntreSessoes` é `undefined`.

- [ ] **Step 3: Implementar o campo**

Em `src/models/Tenant.js`, dentro de `configuracoes`, imediatamente a seguir a `duracaoSessaoPadrao`:

```javascript
        duracaoSessaoPadrao: { type: Number, default: 60 }, // minutos
        intervaloEntreSessoes: { type: Number, default: 0, min: 0 }, // min. de arrumação entre sessões
```

- [ ] **Step 4: Correr o teste e confirmar que passa**

Run: `npm test -- --testPathPattern=tenant-intervalo-config`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit** (pedir OK ao André antes)

```bash
git add src/models/Tenant.js tests/tenant-intervalo-config.test.js
git commit -m "feat(disponibilidade): campo Tenant.configuracoes.intervaloEntreSessoes (default 0)"
```

---

### Task 2: Núcleo — grelha ancorada com arrumação em `resolveAvailableSlots`

**Files:**
- Modify: `src/controllers/scheduleController.js` (assinatura + bloco de geração de slots do helper `resolveAvailableSlots`, ~linhas 64–158)
- Test: `tests/resolveAvailableSlots.test.js`

**Interfaces:**
- Consumes: `Tenant.configuracoes.intervaloEntreSessoes` (via param, na Task 3).
- Produces: `resolveAvailableSlots({ Schedule, ScheduleException, Agendamento, tenantId, date, duration = 60, interval = 0 })` → `{ slots: string[], isException, exceptionType, hasBaseSchedule, baseActive }`. **Assinatura ganha `interval` (default 0); retorno inalterado.** Consumido pelas Tasks 3.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/resolveAvailableSlots.test.js`:

```javascript
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';
import { resolveAvailableSlots } from '../src/controllers/scheduleController.js';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const DATE = '2027-06-07'; // futuro, para não cair no filtro "hoje"
const LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function models(tenantId) { return getModels(getTenantDB(String(tenantId))); }

// Semeia os 7 dias com janela e pausa dadas.
async function seedWeek(tenantId, { start = '09:00', end = '18:00', bStart = '12:00', bEnd = '13:00' } = {}) {
  const { Schedule } = models(tenantId);
  await Promise.all([0,1,2,3,4,5,6].map((d) => Schedule.create({
    tenantId, dayOfWeek: d, label: LABELS[d], isActive: true,
    startTime: start, endTime: end, breakStartTime: bStart, breakEndTime: bEnd,
  })));
}

async function seedBooking(tenantId, isoLocal) {
  const { Agendamento } = models(tenantId);
  await Agendamento.create({
    tenantId,
    dataHora: DateTime.fromISO(isoLocal, { zone: 'Europe/Lisbon' }).toJSDate(),
    status: 'Agendado',
  });
}

function call(tenantId, interval) {
  const { Schedule, ScheduleException, Agendamento } = models(tenantId);
  return resolveAvailableSlots({ Schedule, ScheduleException, Agendamento, tenantId, date: DATE, duration: 60, interval });
}

describe('resolveAvailableSlots — intervalo de arrumação', () => {
  it('interval=0 → grelha hora-a-hora (regressão, comportamento atual)', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await seedWeek(tenantId); // 09-18, pausa 12-13
    const { slots } = await call(tenantId, 0);
    expect(slots).toEqual(['09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00']);
  });

  it('interval=15 → cadência de 75 min por bloco (manhã/tarde), sem invadir a pausa', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await seedWeek(tenantId); // 09-18, pausa 12-13
    const { slots } = await call(tenantId, 15);
    expect(slots).toEqual(['09:00','10:15','13:00','14:15','15:30','16:45']);
  });

  it('interval=15 → ancora na marcação real (booking desalinhado às 13:30)', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await seedWeek(tenantId); // 09-18, pausa 12-13
    await seedBooking(tenantId, `${DATE}T13:30`); // 13:30–14:30 + arrumação até 14:45
    const { slots } = await call(tenantId, 15);
    // manhã intacta; tarde reancora no fim do booking (14:45)
    expect(slots).toEqual(['09:00','10:15','14:45','16:00']);
  });

  it('interval=15 → slot que terminaria depois do fecho NÃO entra', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await seedWeek(tenantId, { start: '13:00', end: '20:00', bStart: '13:00', bEnd: '13:00' }); // bloco único 13-20
    const { slots } = await call(tenantId, 15);
    // 13:00,14:15,15:30,16:45,18:00 ; 19:15→20:15 passa do fecho → fora
    expect(slots).toEqual(['13:00','14:15','15:30','16:45','18:00']);
  });
});
```

- [ ] **Step 2: Correr e confirmar que falham**

Run: `npm test -- --testPathPattern=resolveAvailableSlots`
Expected: FAIL — a assinatura ainda não aceita `interval` e a cadência é hora-a-hora (o teste de 75 min falha).

- [ ] **Step 3: Implementar a nova geração de slots**

Em `src/controllers/scheduleController.js`, alterar a assinatura do helper:

```javascript
export const resolveAvailableSlots = async ({ Schedule, ScheduleException, Agendamento, tenantId, date, duration = 60, interval = 0 }) => {
```

Substituir o bloco de geração (do `const occupiedSlots = ...` até ao `return { slots, ... }`, ~linhas 122–157) por:

```javascript
  // Cada agendamento reserva a sessão + a arrumação a seguir.
  const dur = Number(duration);
  const gap = Number(interval) || 0;
  const step = dur + gap;

  const reserved = existingAgendamentos
    .map((ag) => {
      const start = timeToMinutes(DateTime.fromJSDate(ag.dataHora, { zone: 'Europe/Lisbon' }).toFormat('HH:mm'));
      return { start, end: start + dur + gap };
    })
    .sort((a, b) => a.start - b.start);

  // Para HOJE, não propor horas já passadas.
  const agora = DateTime.now().setZone('Europe/Lisbon');
  const nowMinutes = dateKey === agora.toISODate() ? agora.hour * 60 + agora.minute : null;

  // Blocos de trabalho: a pausa (se dentro da janela) divide o dia em manhã/tarde.
  const blocks = [];
  const hasBreak =
    breakStartMinutes !== null && breakEndMinutes !== null &&
    breakStartMinutes >= startWorkMinutes && breakEndMinutes <= endWorkMinutes &&
    breakStartMinutes < breakEndMinutes;
  if (hasBreak) {
    if (breakStartMinutes > startWorkMinutes) blocks.push([startWorkMinutes, breakStartMinutes]);
    if (breakEndMinutes < endWorkMinutes) blocks.push([breakEndMinutes, endWorkMinutes]);
  } else {
    blocks.push([startWorkMinutes, endWorkMinutes]);
  }

  const slots = [];
  for (const [blockStart, blockEnd] of blocks) {
    let cursor = blockStart;
    while (cursor + dur <= blockEnd) {
      const slotEnd = cursor + dur;
      if (nowMinutes !== null && cursor <= nowMinutes) { cursor += step; continue; }
      // Colisão com uma marcação real (sessão + arrumação) → saltar e reancorar no fim dela.
      const hit = reserved.find((r) => cursor < r.end && slotEnd > r.start);
      if (hit) { cursor = hit.end; continue; }
      slots.push(minutesToTime(cursor));
      cursor += step;
    }
  }

  return { slots, isException, exceptionType, hasBaseSchedule, baseActive };
};
```

Notas:
- `existingAgendamentos` já é carregado logo acima (query por `dataHora` do dia + status `Agendado`/`Confirmado`) — manter essa query.
- O antigo tratamento da pausa dentro do loop desaparece: agora a pausa é um **limite de bloco**.
- Com `gap = 0`, `step = dur` e blocos = janela: resultado idêntico ao atual (regressão coberta pelo 1.º teste).

- [ ] **Step 4: Correr e confirmar que passam**

Run: `npm test -- --testPathPattern=resolveAvailableSlots`
Expected: PASS (4 testes).

- [ ] **Step 5: Correr a suite de disponibilidade (garantir zero regressão no endpoint)**

Run: `npm test -- --testPathPattern=disponibilidade-internal`
Expected: PASS (os testes F03 usam a janela default sem intervalo → inalterados).

- [ ] **Step 6: Commit** (pedir OK ao André)

```bash
git add src/controllers/scheduleController.js tests/resolveAvailableSlots.test.js
git commit -m "feat(disponibilidade): grelha ancorada com intervalo de arrumação em resolveAvailableSlots"
```

---

### Task 3: Propagar `intervaloEntreSessoes` aos callers

**Files:**
- Modify: `src/controllers/disponibilidadeInternalController.js` (passar `interval` ao helper — já tem o `tenant` via `resolveTenantContext`)
- Modify: `src/controllers/scheduleController.js` (`getAvailableSlots` — carregar o tenant e passar `interval`)
- Test: `tests/disponibilidade-intervalo-endpoint.test.js`

**Interfaces:**
- Consumes: `resolveAvailableSlots({ ..., interval })` (Task 2), `Tenant.configuracoes.intervaloEntreSessoes` (Task 1).
- Produces: ambos os endpoints devolvem a grelha já com o intervalo do tenant.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/disponibilidade-intervalo-endpoint.test.js`:

```javascript
process.env.INTERNAL_SERVICE_TOKEN = 'test-service-token';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const svc = () => ({ 'X-Service-Token': 'test-service-token' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const LABELS = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const DATE = '2027-06-07';

async function criarTenant(slug, intervalo) {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`, slug,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    configuracoes: { intervaloEntreSessoes: intervalo },
  });
  const user = await User.create({
    tenantId: tenant._id, nome: `U ${slug}`, email: `u@${slug}.pt`,
    passwordHash: 'x', role: 'admin', emailVerificado: true,
  });
  const token = jwt.sign({ userId: user._id, tenantId: tenant._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { tenant, token };
}

async function seedWeek(tenantId) {
  const { Schedule } = getModels(getTenantDB(String(tenantId)));
  await Promise.all([0,1,2,3,4,5,6].map((d) => Schedule.create({
    tenantId, dayOfWeek: d, label: LABELS[d], isActive: true,
    startTime: '09:00', endTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00',
  })));
}

describe('endpoints aplicam intervaloEntreSessoes do tenant', () => {
  it('endpoint interno (IA) usa o intervalo do tenant', async () => {
    const { tenant } = await criarTenant('int-15', 15);
    await seedWeek(tenant._id);
    const res = await request(app)
      .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&date=${DATE}&duration=60`)
      .set(svc());
    expect(res.status).toBe(200);
    expect(res.body.data.days[0].slots).toEqual(['09:00','10:15','13:00','14:15','15:30','16:45']);
  });

  it('endpoint do painel usa o intervalo do tenant (paridade)', async () => {
    const { tenant, token } = await criarTenant('painel-15', 15);
    await seedWeek(tenant._id);
    const res = await request(app)
      .get(`/api/v1/schedules/available-slots?date=${DATE}&duration=60`)
      .set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.availableSlots).toEqual(['09:00','10:15','13:00','14:15','15:30','16:45']);
  });

  it('tenant com intervalo 0 → grelha hora-a-hora (sem regressão)', async () => {
    const { tenant } = await criarTenant('int-0', 0);
    await seedWeek(tenant._id);
    const res = await request(app)
      .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&date=${DATE}&duration=60`)
      .set(svc());
    expect(res.body.data.days[0].slots).toEqual(['09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00']);
  });
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test -- --testPathPattern=disponibilidade-intervalo-endpoint`
Expected: FAIL — os callers ainda não passam `interval`, logo a grelha sai hora-a-hora.

- [ ] **Step 3: Implementar no endpoint interno**

Em `src/controllers/disponibilidadeInternalController.js`, dentro de `getDisponibilidadeInterna`, `resolveTenantContext` já devolve `{ tenant, models }`. Capturar o `tenant` e derivar o intervalo:

```javascript
    const { tenant, models } = await resolveTenantContext(tenantId);
    const interval = tenant?.configuracoes?.intervaloEntreSessoes || 0;
```

E na chamada dentro do `dates.map(...)`, passar `interval`:

```javascript
      const result = await resolveAvailableSlots({
        Schedule: models.Schedule,
        ScheduleException: models.ScheduleException,
        Agendamento: models.Agendamento,
        tenantId,
        date: isoDate,
        duration: durationNum,
        interval,
      });
```

- [ ] **Step 4: Implementar no endpoint do painel**

Em `src/controllers/scheduleController.js`, no topo garantir o import do Tenant (a BD partilhada, não `req.models`):

```javascript
import Tenant from '../models/Tenant.js';
```

Em `getAvailableSlots`, antes de chamar o helper:

```javascript
    const tenantDoc = await Tenant.findById(req.tenantId).select('configuracoes.intervaloEntreSessoes').lean();
    const interval = tenantDoc?.configuracoes?.intervaloEntreSessoes || 0;

    const result = await resolveAvailableSlots({
      Schedule, ScheduleException, Agendamento,
      tenantId: req.tenantId, date, duration, interval,
    });
```

- [ ] **Step 5: Correr e confirmar que passa**

Run: `npm test -- --testPathPattern=disponibilidade-intervalo-endpoint`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit** (pedir OK ao André)

```bash
git add src/controllers/disponibilidadeInternalController.js src/controllers/scheduleController.js tests/disponibilidade-intervalo-endpoint.test.js
git commit -m "feat(disponibilidade): endpoints IA e painel aplicam intervaloEntreSessoes do tenant"
```

---

### Task 4: Reservar arrumação na deteção de conflito (booking)

**Files:**
- Modify: `src/modules/clientes/clienteInternalRoutes.js` (create `POST /:id/agendamentos` e reschedule `PATCH .../reschedule`)
- Modify: `src/modules/agendamento/agendamentoController.js` (`createAgendamento`)
- Test: `tests/booking-arrumacao-conflito.test.js`

**Interfaces:**
- Consumes: `Tenant.configuracoes.intervaloEntreSessoes` (Task 1). Em `clienteInternalRoutes`, o `tenant` vem de `resolveTenantContext`. Em `agendamentoController`, carrega-se via `Tenant.findById(req.tenantId)`.
- Produces: duas marcações no mesmo tenant têm de distar ≥ `60 + intervalo` minutos.

**NOTA:** o bloco de validação de disponibilidade **comentado** em `agendamentoController.js` (linhas ~96–124, "TODO: Revisitar") **fica como está** — decisão do André (fora de âmbito).

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/booking-arrumacao-conflito.test.js`:

```javascript
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

const svc = () => ({ 'X-Service-Token': 'test-service-token' });
const DATE = '2027-06-07';

async function criarTenant(intervalo) {
  return Tenant.create({
    nome: 'Salão', slug: `s-${intervalo}-${Math.round(Math.random()*1e6)}`,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    configuracoes: { intervaloEntreSessoes: intervalo },
  });
}

async function criarCliente(tenantId, nome, telefone) {
  const { Cliente } = getModels(getTenantDB(String(tenantId)));
  return Cliente.create({ tenantId, nome, telefone });
}

function marcar(clienteId, tenantId, isoLocal) {
  return request(app)
    .post(`/api/internal/clientes/${clienteId}/agendamentos`)
    .set(svc())
    .send({ tenantId: String(tenantId), dataHoraISO: `${isoLocal}:00`, tipo: 'Sessao' });
}

describe('conflito de booking reserva a arrumação', () => {
  it('intervalo 15 → 60 min de distância é conflito; 75 min é permitido', async () => {
    const tenant = await criarTenant(15);
    const a = await criarCliente(tenant._id, 'A', '910000001');
    const b = await criarCliente(tenant._id, 'B', '910000002');
    const c = await criarCliente(tenant._id, 'C', '910000003');

    const r1 = await marcar(a._id, tenant._id, `${DATE}T14:00`);
    expect(r1.status).toBe(201);

    // 15:00 está a 60 min → com arrumação (75) deve colidir.
    const r2 = await marcar(b._id, tenant._id, `${DATE}T15:00`);
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe('slot_taken');

    // 15:15 está a 75 min → permitido.
    const r3 = await marcar(c._id, tenant._id, `${DATE}T15:15`);
    expect(r3.status).toBe(201);
  });

  it('intervalo 0 → 60 min de distância é permitido (sem regressão)', async () => {
    const tenant = await criarTenant(0);
    const a = await criarCliente(tenant._id, 'A', '910000001');
    const b = await criarCliente(tenant._id, 'B', '910000002');
    expect((await marcar(a._id, tenant._id, `${DATE}T14:00`)).status).toBe(201);
    expect((await marcar(b._id, tenant._id, `${DATE}T15:00`)).status).toBe(201);
  });
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npm test -- --testPathPattern=booking-arrumacao-conflito`
Expected: FAIL — hoje `SLOT_MIN = 60`, logo a marcação às 15:00 (a 60 min) é aceite quando devia colidir.

- [ ] **Step 3: Implementar no caminho da IA (create)**

Em `src/modules/clientes/clienteInternalRoutes.js`, no `POST /:id/agendamentos`, capturar o `tenant` e derivar o gap:

```javascript
    const { tenant, models } = await resolveTenantContext(tenantId);
    const gapMin = 60 + (tenant?.configuracoes?.intervaloEntreSessoes || 0);
```

E substituir a janela de conflito (o bloco `const SLOT_MIN = 60; ...`):

```javascript
    const halfMs = (gapMin * 60 * 1000) - 1;
    const windowStart = new Date(dataHora.getTime() - halfMs);
    const windowEnd = new Date(dataHora.getTime() + halfMs);
    const conflict = await models.Agendamento.findOne({
      tenantId,
      dataHora: { $gte: windowStart, $lte: windowEnd },
      status: { $nin: cancelledStatus },
      'confirmacao.tipo': { $ne: 'rejeitado' },
    });
```

- [ ] **Step 4: Implementar no caminho da IA (reschedule)**

No mesmo ficheiro, no `PATCH .../reschedule`, capturar `tenant` (`const { tenant, models } = await resolveTenantContext(tenantId);`) e substituir a janela local (`const SLOT_MIN = 60; ...`):

```javascript
    const gapMin = 60 + (tenant?.configuracoes?.intervaloEntreSessoes || 0);
    const halfMs = (gapMin * 60 * 1000) - 1;
    const windowStart = new Date(novaDataHora.getTime() - halfMs);
    const windowEnd = new Date(novaDataHora.getTime() + halfMs);
```

(o resto da query de conflito — com `_id: { $ne: agendamentoId }` — mantém-se.)

- [ ] **Step 5: Implementar no caminho do painel**

Em `src/modules/agendamento/agendamentoController.js`, garantir o import do Tenant no topo:

```javascript
import Tenant from '../../models/Tenant.js';
```

Em `createAgendamento`, substituir `const agendamentoDurationMinutes = 60;` por:

```javascript
    const tenantDoc = await Tenant.findById(req.tenantId).select('configuracoes.intervaloEntreSessoes').lean();
    const agendamentoDurationMinutes = 60 + (tenantDoc?.configuracoes?.intervaloEntreSessoes || 0);
```

(o `conflictWindow` e a query de conflito por baixo mantêm-se — passam a usar o gap alargado.)

- [ ] **Step 6: Correr e confirmar que passa**

Run: `npm test -- --testPathPattern=booking-arrumacao-conflito`
Expected: PASS (2 testes).

- [ ] **Step 7: Correr a suite de agendamento (garantir zero regressão)**

Run: `npm test -- --testPathPattern="agendamento|slot-atomicity"`
Expected: PASS (tenants existentes têm intervalo 0 → gap 60, comportamento inalterado).

- [ ] **Step 8: Commit** (pedir OK ao André)

```bash
git add src/modules/clientes/clienteInternalRoutes.js src/modules/agendamento/agendamentoController.js tests/booking-arrumacao-conflito.test.js
git commit -m "feat(disponibilidade): conflito de booking reserva o intervalo de arrumação"
```

---

## Self-Review

**1. Cobertura do design:**
- §7.1 Config → Task 1 ✅
- §7.2 Núcleo (grelha ancorada) → Task 2 ✅
- §7.3 Conflito no booking → Task 4 ✅
- §7.4 Fonte única / sem regressão → testes `interval=0` nas Tasks 2, 3, 4 ✅
- §7.5 Observabilidade → sem código dedicado (a janela vem do `Schedule`, reflete-se via endpoints já testados); log estruturado opcional adiado (YAGNI) — anotado como follow-up abaixo.
- §6 (i) fim de bloco por ajuste da janela → coberto pela regra `slotEnd <= blockEnd` (Task 2, teste "não entra depois do fecho") ✅
- §4 casos-limite (almoço/além-fecho) → **Fase B**, fora deste plano ✅

**2. Placeholder scan:** sem TBD/TODO no plano; todos os steps têm código real.

**3. Type/consistência:** `resolveAvailableSlots(..., interval=0)` definido na Task 2 e usado com o mesmo nome nas Tasks 3; `intervaloEntreSessoes` idêntico em Tasks 1/3/4; `gapMin`/`agendamentoDurationMinutes` = `60 + intervalo` coerente entre os dois caminhos de booking.

**Follow-ups (fora de âmbito, não bloqueiam):**
- Log estruturado dos slots calculados (observabilidade fina) — só se o André quiser depois.
- Confirmar que o **frontend** do painel consome `available-slots` e não gera horas localmente (verificação rápida antes do merge; se gerar, alinhar — mas o design assume consumo do endpoint).
