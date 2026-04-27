# ADR-019: Correcção do Fluxo de Confirmação WhatsApp — markModified + Polling

**Status:** Accepted — Implementado  
**Data:** 2026-04-27  
**Módulo:** WA (webhook confirmação) + FRONTEND (Agendamentos)  
**Autor:** André dos Reis  
**Score de Impacto:** 120 (Alto)

---

## Contexto

Após a migração para Evolution API v2 (ADR-016), o fluxo de confirmação de agendamentos via WhatsApp apresentava o seguinte comportamento em produção:

1. Cliente recebia o lembrete de 1h ✅
2. Cliente respondia "SIM" ✅
3. Cliente recebia mensagem de "obrigado" ✅
4. **Status do agendamento NÃO era actualizado no sistema** ❌
5. Worker `alerta-admin-pendente` continuava a disparar alertas ao admin como se o cliente não tivesse confirmado ❌

O item `agendamento.confirmacao.tipo === 'confirmado' no MongoDB` do checklist do ADR-016 (Fase 4 — Testes Locais) nunca foi verificado — este ADR documenta a causa raiz, a correcção e o fluxo completo.

---

## Fluxo Completo de Confirmação

É importante compreender o fluxo end-to-end para diagnosticar problemas futuros.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. AGENDAMENTO CRIADO                                           │
│    agendamentoController.createAgendamento()                    │
│    → scheduleNotifications({ agendamentoId, tenantId, ... })    │
│    → BullMQ adiciona 3 jobs à fila:                             │
│       - 'confirmacao'      (imediato)                           │
│       - 'lembrete-antecipado' (24h ou 2 dias antes)             │
│       - 'lembrete-1h'      (1h antes)                           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│ 2. WORKER ENVIA LEMBRETE 1H (notificationWorker.js)             │
│    Agendamento.findById(agendamentoId)  ← tenant DB             │
│    Verifica: confirmacao.tipo !== 'rejeitado'                   │
│    Envia: "⏰ Sessão em 1 hora! Responda SIM ou NÃO"            │
│    Se confirmacao.tipo === 'pendente':                          │
│       → adiciona job 'alerta-admin-pendente' com delay 5 min    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ cliente responde "SIM"
┌──────────────────────────────▼──────────────────────────────────┐
│ 3. EVOLUTION API → POST /webhook/evolution                      │
│    webhookRoutes.js → validateWebhook → validate(schema)        │
│    → processarConfirmacaoWhatsapp()                             │
│                                                                 │
│    Validações síncronas (retornam 200 imediatamente):           │
│    a) event === 'messages.upsert'                               │
│    b) não é grupo (@g.us) nem reação                            │
│    c) fromMe !== true  (não é mensagem do salão)                │
│    d) mensagem < 5 minutos (evita mensagens antigas)            │
│    e) messageId não processado (anti-replay / idempotência)     │
│    f) JID não é @lid (fallback defensivo v1)                    │
│                                                                 │
│    Detecção SIM/NÃO:                                            │
│    ehSim = PALAVRAS_SIM.some(p => msg === p || msg inicia com p) │
│    ehNao = PALAVRAS_NAO.some(p => msg === p || msg inicia com p) │
│                                                                 │
│    ACK 200 imediato → Evolution não faz retry                   │
│    → processarConfirmacaoAsync() fire-and-forget                │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│ 4. processarConfirmacaoAsync() — background                     │
│                                                                 │
│    a) resolveClienteTenant(telefoneVariants)                    │
│       → itera tenants ativos (plano.status in ['ativo','trial'])│
│       → getTenantDB(tenant._id) + getModels(db)                 │
│       → Cliente.findOne({ telefone: { $in: variants } })        │
│       → retorna { models, tenantId, cliente } ou null           │
│                                                                 │
│    b) Se cliente encontrado:                                    │
│       models.Agendamento.findOne({                              │
│         cliente: cliente._id,                                   │
│         'confirmacao.tipo': 'pendente',                         │
│         dataHora: { $gte: -2h, $lte: +48h }                    │
│       }).sort({ dataHora: 1 })                                  │
│                                                                 │
│    c) Se não encontrou via cliente, tenta via lead:             │
│       resolveLeadTenant() — Agendamentos tipo 'Avaliacao'       │
│       com lead.telefone matching                                │
│                                                                 │
│    d) Se nenhum agendamento encontrado:                         │
│       → delegarParaIAAsync() → mensagem automática de saudação  │
│                                                                 │
│    e) Se encontrou agendamento e ehSim:                         │
│       agendamento.confirmacao.tipo = 'confirmado'               │
│       agendamento.confirmacao.respondidoEm = new Date()         │
│       agendamento.confirmacao.respondidoPor = 'cliente'         │
│       agendamento.status = 'Confirmado'                         │
│       agendamento.markModified('confirmacao')  ← FIX (ver §Bug) │
│       await agendamento.save()                                  │
│                                                                 │
│    f) sendWhatsAppMessage(telefone, "✅ Obrigada...")            │
│                                                                 │
│    g) Tenant.findById(agendamento.tenantId)                     │
│       → notifica admin via WhatsApp                             │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│ 5. WORKER 'alerta-admin-pendente' (5 min depois)                │
│    Agendamento.findById(agendamentoId)                          │
│    Se confirmacao.tipo !== 'pendente' → cancela alerta          │
│    Se confirmacao.tipo === 'pendente' → envia alerta ao admin   │
└─────────────────────────────────────────────────────────────────┘
```

---

## O Bug — Mongoose `markModified` em Nested Objects

### Causa raiz

O schema `Agendamento.confirmacao` é um **nested object** (subdocumento inline) com campos próprios:

```javascript
confirmacao: {
    tipo:          { type: String, enum: ['pendente','confirmado','rejeitado'], default: 'pendente' },
    respondidoEm:  { type: Date, default: null },
    respondidoPor: { type: String, enum: ['cliente','laura'], default: null }
}
```

Quando se faz:

```javascript
agendamento.confirmacao.tipo = 'confirmado';
agendamento.confirmacao.respondidoEm = new Date();
agendamento.confirmacao.respondidoPor = 'cliente';
await agendamento.save();
```

O **Mongoose não detecta automaticamente** as mudanças em nested objects em ligações DB-per-tenant criadas via `mongoose.connection.useDb()`. O documento é devolvido como um objecto simples sem os proxies de change-tracking que o Mongoose normalmente instala. O resultado:

- `agendamento.status = 'Confirmado'` **era persistido** (campo top-level, sempre tracked)
- `agendamento.confirmacao.tipo = 'confirmado'` **NÃO era persistido** (nested, tracking não activo)

Daí o comportamento observado: o cliente recebe "obrigado" (o `save()` não lança excepção porque persiste pelo menos o `status`), mas `confirmacao.tipo` fica `'pendente'` no MongoDB. O worker vê `'pendente'` e continua a disparar alertos ao admin.

### Como confirmar este bug nos logs

Se os logs do Render mostram:
```
[Webhook] ✅ Agendamento confirmado: 6636abc...
```
mas o MongoDB ainda tem `confirmacao.tipo: 'pendente'`, é exactamente este bug.

Se os logs mostram:
```
[Webhook] ⚠️ Nenhum agendamento pendente para 351912...
```
significa que o agendamento não foi encontrado (problema diferente — ver diagnóstico abaixo).

---

## Decisão

### Fix 1 — `markModified('confirmacao')` em `webhookController.js`

Adicionado antes de cada `save()` tanto para confirmação como para cancelamento:

```javascript
// SIM
agendamento.confirmacao.tipo = 'confirmado';
agendamento.confirmacao.respondidoEm = new Date();
agendamento.confirmacao.respondidoPor = 'cliente';
agendamento.status = 'Confirmado';
agendamento.markModified('confirmacao');  // ← FIX
await agendamento.save();

// NÃO
agendamento.confirmacao.tipo = 'rejeitado';
agendamento.confirmacao.respondidoEm = new Date();
agendamento.confirmacao.respondidoPor = 'cliente';
agendamento.status = 'Cancelado Pelo Cliente';
agendamento.markModified('confirmacao');  // ← FIX
await agendamento.save();
```

**Regra geral:** sempre que se mutam propriedades de um nested object (não Mixed, não subdocumento separado) num documento Mongoose obtido via `getModels(getTenantDB(...))`, chamar `markModified('nomeDoCampoNested')` antes do `save()`.

### Fix 2 — Palavras de reconhecimento expandidas em `webhookController.js`

O sistema anterior usava regex limitado. Substituído por arrays de strings para facilitar manutenção:

**PALAVRAS_SIM** (confirmação): `sim`, `s`, `confirmo/a/ar/ado`, `ok/okay`, `certo`, `correto`, `exato/exatamente`, `claro`, `com certeza/certeza`, `perfeito`, `combinado`, `pode/pode ser`, `beleza`, `boa`, `ta bom/bem`, `tudo bem/certo`, `yes`, `1`

**PALAVRAS_NAO** (cancelamento): `nao`, `n`, `cancelar/a/ado`, `desmarcar/o/que`, `nao posso/consigo/vou/quero`, `desistir/o`, `remover`, `nope/no`, `2`

Lógica: match exacto (`mensagem === palavra`) **OU** início de frase (`mensagem.startsWith(palavra + ' ')`). Assim "sim, obrigada" e "nao, nao vou conseguir" são correctamente reconhecidos.

**Para adicionar novas palavras no futuro:** editar os arrays `PALAVRAS_SIM` / `PALAVRAS_NAO` em `src/modules/ia/webhookController.js` (linhas ~138-157). Sem regex para manter.

### Fix 3 — Polling automático em `Agendamentos.jsx`

O dashboard de agendamentos re-fetch a lista de 30 em 30 segundos de forma silenciosa (sem spinner, sem toast de erro), para que o admin veja confirmações sem ter de recarregar a página manualmente:

```javascript
// carregarAgendamentos(silencioso = false)
const intervaloPolling = setInterval(() => carregarAgendamentos(true), 30000);
return () => clearInterval(intervaloPolling);  // cleanup no unmount
```

---

## Diagnóstico para Problemas Futuros

Se o fluxo de confirmação voltar a não funcionar, verificar pela ordem:

| Passo | O que verificar | Onde |
|---|---|---|
| 1 | Logs Render: `[Webhook] 📥 Recebido:` aparece? | Significa que o Evolution API está a enviar o webhook |
| 2 | Logs: `[Webhook] ✅ Detectado resposta de confirmação`? | Significa que o texto foi reconhecido como SIM/NÃO |
| 3 | Logs: `[Webhook] ✅ Cliente encontrado:` ou `⚠️ Nenhum agendamento pendente`? | Confirma se o agendamento foi encontrado |
| 4 | Logs: `[Webhook] ✅ Agendamento confirmado: <id>`? | Significa que o `save()` não lançou excepção |
| 5 | MongoDB: `confirmacao.tipo` === `'confirmado'`? | Confirma se o `markModified` funcionou |
| 6 | Worker: log `[Worker] Cliente já confirmou — alerta ao admin cancelado`? | Confirma que o worker vê o campo correcto |

Se o passo 4 aparece mas o passo 5 falha → rever se `markModified('confirmacao')` está presente antes do `save()`.

Se o passo 3 mostra `⚠️ Nenhum agendamento pendente`:
- Verificar formato do telefone (variantes: `351XXXXXXXXX`, `XXXXXXXXX`, sem prefixo)
- Verificar se o agendamento tem `confirmacao.tipo: 'pendente'` no MongoDB (pode já ter sido confirmado)
- Verificar se `dataHora` está dentro da janela `[-2h, +48h]`
- Verificar se o tenant está activo (`plano.status in ['ativo','trial']`)

---

## Ficheiros Alterados

| Ficheiro | Mudança |
|---|---|
| `src/modules/ia/webhookController.js` | `markModified('confirmacao')` em ehSim e ehNao; arrays `PALAVRAS_SIM`/`PALAVRAS_NAO` substituem regex |
| `laura-saas-frontend/src/pages/Agendamentos.jsx` | Polling silencioso 30s; param `silencioso` em `carregarAgendamentos` |

---

## Consequências

### Positivas
- `confirmacao.tipo` é agora persistido correctamente → worker `alerta-admin-pendente` cancela o alerta quando o cliente confirma
- Padrões de reconhecimento SIM/NÃO cobrem o vocabulário real dos clientes portugueses/brasileiros
- Dashboard actualiza automaticamente sem intervenção do admin

### Negativas / Trade-offs
- Polling de 30s gera 1 request HTTP por tab aberta por minuto — carga negligenciável mas real; aumentar intervalo para 60s se necessário
- Arrays `PALAVRAS_SIM`/`PALAVRAS_NAO` precisam de ser mantidos manualmente — sem regex, mais legível mas sem expressividade

---

## Links e Referências

- **ADR-013:** [Notification Pipeline BullMQ](./ADR-013-notification-pipeline-bullmq.md) — worker que consome `confirmacao.tipo`
- **ADR-016:** [Evolution API v2 Upgrade](./ADR-016-evolution-api-v2-upgrade.md) — checklist item `confirmacao.tipo === 'confirmado'` (item agora resolvido por este ADR)
- **Ficheiros chave:**
  - `src/modules/ia/webhookController.js` — fluxo de confirmação completo
  - `src/workers/notificationWorker.js` — consumidor do `confirmacao.tipo`
  - `src/utils/scheduleNotifications.js` — agendador dos jobs BullMQ
  - `src/models/Agendamento.js` — schema com campo `confirmacao`
  - `src/config/tenantDB.js` — `getTenantDB()` + `connectionCache`
  - `src/models/registry.js` — `getModels(db)` por tenant
