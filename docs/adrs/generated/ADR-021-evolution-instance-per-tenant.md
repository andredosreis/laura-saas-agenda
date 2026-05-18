# ADR-021: Evolution API — instância dedicada por tenant

**Status:** Aceito
**Data:** 2026-05-04
**Módulo:** WA, TENANT
**Autor:** André dos Reis
**Score de Impacto:** 90 (Alto)
**Relacionado:** [ADR-014](./ADR-014-evolution-api-whatsapp-migration.md), [ADR-016](./ADR-016-evolution-api-v2-upgrade.md), [ADR-001](./ADR-001-database-per-tenant-architecture.md)

---

## Contexto

O Marcai usa actualmente **uma única instância Evolution partilhada** (`marcai`) entre todos os tenants. O webhook `/webhook/evolution` recebe payload sem distinção de origem e resolve o tenant a partir do **telefone do remetente**, fazendo um scan sequencial em todas as DBs de tenants activos (`resolveClienteTenant`/`resolveLeadTenant` em `src/modules/ia/webhookController.js`).

Esta abordagem tem três limitações que se agravam com o crescimento comercial e com o módulo de Leads (em desenvolvimento):

1. **Performance N×DB**: cada inbound dispara N queries a N DBs até encontrar o telefone. Com 5 tenants = 5×roundtrip; com 50 = 50×. Para o módulo de Leads (mensagens novas de números desconhecidos), é ainda pior — só após esgotar todas as DBs concluímos "número desconhecido".
2. **Ambiguidade**: o mesmo telefone pode aparecer em mais que um tenant (clientes que fazem agendamentos em duas clínicas). O scan resolve para o primeiro match encontrado — não-determinístico.
3. **Escala comercial**: cada nova clínica obriga-nos a partilhar um número WhatsApp comum. Inviável para vender o produto a clínicas que querem o seu próprio número/identidade.

O módulo de Leads, ao introduzir mensagens inbound de **números desconhecidos**, força a decisão: precisamos de saber a que tenant atribuir o lead **antes** de qualquer query, e fazê-lo de forma determinística.

---

## Decisão

Adoptar **uma instância Evolution por tenant**. O nome da instância (`whatsapp.instanceName`) é único globalmente e armazenado no documento `Tenant`. O webhook resolve o tenant em **uma única query indexada** lendo `req.body.instance` do payload Evolution.

**Schema (`src/models/Tenant.js`):**

```js
whatsapp: {
  // ...campos existentes...
  instanceName: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^[a-z0-9-]+$/, '...']
  },
  instanceToken: { type: String }
}
```

**Índice:**

```js
TenantSchema.index({ 'whatsapp.instanceName': 1 }, { unique: true, sparse: true });
```

`unique` evita colisões; `sparse` permite tenants ainda sem Evolution configurada.

**Resolução no webhook (`src/modules/ia/webhookController.js`):**

```js
async function resolveTenantByInstance(instanceName) {
  if (!instanceName) return null;
  const tenant = await Tenant.findOne({
    'whatsapp.instanceName': instanceName.trim().toLowerCase(),
    'plano.status': { $in: ['ativo', 'trial'] }
  }).lean();
  if (!tenant) return null;
  const db = getTenantDB(tenant._id.toString());
  return { tenant, models: getModels(db), tenantId: tenant._id.toString() };
}
```

**Cliente de envio (`src/utils/evolutionClient.js`):**

```js
sendWhatsAppMessage(to, message, instanceName?)  // 3º arg novo, opcional
```

Quando `instanceName` é omisso, cai no `EVOLUTION_INSTANCE` env (legacy `marcai`) — preserva retrocompat para os ~14 callers existentes.

**Estratégia de fallback durante migração:**

Se `req.body.instance` está ausente OU não corresponde a nenhum tenant, o webhook avisa via `console.warn('[Webhook] ⚠️ legacy_evolution_routing: ...')` e cai no scan global existente (`resolveClienteTenant` / `resolveLeadTenant`). Isto mantém o sistema actual a funcionar enquanto a migração está incompleta.

---

## Consequências

### Positivas

- **Resolução de tenant O(1)** via índice, em vez de O(N×DBs).
- **Routing determinístico** para o módulo de Leads (Phase 1+): inbound de número desconhecido tem destino claro.
- **Escala comercial**: cada clínica tem o seu próprio número WhatsApp e identidade. Onboarding de tenant inclui criar instância dedicada.
- **Custos OpenAI claros por tenant** (Phase 4): o `ia-service` Python recebe `tenantId` resolvido sem ambiguidade.
- **Retrocompatibilidade**: legacy scan mantido como fallback. Tenants existentes (1 piloto: Laura) continuam a funcionar sem mexer em nada até a migration script atribuir `instanceName='marcai'`.

### Negativas

- **Custo de hosting Evolution**: cada nova clínica precisa de uma instância. Railway permite múltiplas instâncias na mesma conta; pode-se ter um único container Evolution v2.x com várias instâncias internas (mesma URL/key, `instanceName` diferente).
- **Onboarding de novo tenant**: inclui criar instância no Evolution Manager, configurar webhook URL, gravar `instanceName` + `instanceToken` em `Tenant`. A documentar em `docs/runbooks/onboard-tenant.md` na Phase 2.
- **Limpeza eventual do scan legacy**: depois de todas os tenants migrarem para `instanceName`, remover `resolveClienteTenant`/`resolveLeadTenant`. Marcado como follow-up.

### Migração de dados

Migration script `scripts/migrations/2026-XX-set-default-evolution-instance.js`:

- Idempotente, com flag `--dry-run` (default).
- Atribui `whatsapp.instanceName = 'marcai'` ao tenant piloto único actual (Laura).
- Não corre automaticamente — execução manual após confirmar com Laura.
- Reversível: descobre tenants com `instanceName='marcai'` e remove o campo (não destrói nada da Evolution real).

---

## Alternativas consideradas

1. **Mapeamento separado `EvolutionInstanceMap` em DB partilhada**
   - Tabela com `{ instanceName, tenantId }`. Lookup via colecção em vez de campo no Tenant.
   - **Rejeitada**: duplica fonte de verdade. Tenant já é o "lar natural" do `instanceName`.

2. **Manter `marcai` partilhado e desambiguar por número-destino**
   - Evolution payload inclui `to` (number da clínica). Resolver tenant por `whatsapp.numeroWhatsapp`.
   - **Rejeitada**: complica o scan e ainda exige índice; e não resolve ambiguidade de telefones de clientes que aparecem em vários tenants.

3. **Header HTTP `x-tenant-id` adicionado no Evolution Manager**
   - Configurar header custom no webhook que identifique o tenant.
   - **Rejeitada**: depende de configuração frágil do Evolution Manager por instância. `instance` já vem no payload de série na v1.8.7+.

---

## Implementação

Esta decisão é executada em **Phase 0** do plano de leads (`feat/leads-phase0-evolution-per-tenant`):

- ✅ Schema actualizado em `Tenant.js`
- ✅ Índice unique sparse em `whatsapp.instanceName`
- ✅ `evolutionClient.sendWhatsAppMessage(to, message, instanceName?)` com fallback ao env
- ✅ `webhookController.processarConfirmacaoAsync` e `delegarParaIAAsync` aceitam `instanceName`
- ✅ Helper `resolveTenantByInstance(instanceName)`
- ✅ Helper `resolveOutboundInstance(tenantId, currentInstance)` resolve a instância de envio
- ✅ Migration script idempotente
- ✅ Testes unitários e de isolamento

Phases seguintes consomem este routing (Phase 1: webhook chamará `resolveOrCreateLead` apenas no tenant resolvido; Phase 2: o `ia-service` Python recebe `tenantId` confiável via `req.body.instance`).
