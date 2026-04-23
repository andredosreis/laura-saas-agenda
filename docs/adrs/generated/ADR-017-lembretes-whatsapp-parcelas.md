# ADR-017: Lembretes Automáticos de Parcelas via WhatsApp (Evolution API)

**Status:** Proposed
**Data:** 2026-04-23
**Módulo:** NOTIF (secundário: FIN/PKG, WA, INFRA)
**Autor:** André dos Reis
**Score de Impacto:** 125 (Médio-Alto)

---

## Contexto

Com a introdução de **vendas parceladas** (entrada livre + N parcelas, ver fluxo em `compraPacoteController.venderPacote`) e o registo manual de cada pagamento em `Transacoes → Registar Pagamento` (ADR implícito na Fase 4 — `POST /transacoes/:id/pagamento`), surge um problema de **follow-up**:

**Problema:** a profissional tem agora clientes com parcelas a pagar no futuro. Sem recordatório automático, cada parcela em atraso exige acompanhamento manual — chamada ou mensagem individual — o que rapidamente se torna inviável à medida que a carteira de clientes parceladas cresce. A consequência típica é atraso ou incumprimento, com impacto directo na receita.

**Constrangimentos específicos:**
- A integração WhatsApp é agora via **Evolution API self-hosted** (ver ADR-014 e ADR-016), substituindo Z-API.
- O projecto tem CRONs co-localizados no processo Express — identificado como risco em `ADRs Pendentes (alta prioridade)` no `README.md` dos ADRs e endereçado em [ADR-013](./ADR-013-notification-pipeline-bullmq.md) com a decisão de migrar para BullMQ + Redis (Fase 2).
- O fluxo existente `scheduleNotifications.js` já agenda notificações ligadas a `Agendamento` — este novo caso de uso liga-se a `CompraPacote` em vez de `Agendamento`, mas pode reutilizar a mesma infraestrutura.

**Oportunidade:** aproveitar a infraestrutura de notificações existente (Evolution API + utility `sendWhatsAppMessage`) para automatizar o lembrete 1–2 dias antes da data prevista de cada parcela.

---

## Decisão

Implementar **lembretes automáticos de parcelas** com os seguintes componentes:

### 1. Dados — novo campo em `CompraPacote`

```javascript
// src/models/CompraPacote.js
proximaDataPagamento: {
  type: Date,
  default: null,
  index: true
}
```

- `null` quando: à vista, ou todas as parcelas pagas, ou venda cancelada.
- Preenchido na **criação** (se parcelado): `dataCompra + 30 dias` (configurável por tenant em Fase 2).
- Recalculado ao **registar um pagamento parcial**: se ainda há parcelas em falta → `dataPagamento + 30 dias`; caso contrário → `null`.

### 2. Agendamento — estratégia híbrida (CRON → BullMQ)

**Curto prazo (Fase 5 — agora):** CRON diário co-localizado no processo Express (padrão já em uso no projecto, ver `scheduleNotifications.js`).

```javascript
// src/jobs/lembreteParcelas.js — corre 1x/dia (08:00 Europe/Lisbon)
// Busca CompraPacote com proximaDataPagamento ∈ [hoje+1d, hoje+2d]
// Envia WhatsApp via evolutionClient.sendWhatsAppMessage
// Marca campo auxiliar `ultimoLembreteEnviado` para evitar duplicados
```

**Longo prazo (Fase 2 da infra — ADR-013):** migrar para BullMQ scheduled jobs, em conjunto com o resto do pipeline de notificações. Esta decisão fica explicitamente atada ao roadmap de ADR-013.

### 3. Envio — reutilizar `evolutionClient`

```javascript
import { sendWhatsAppMessage } from '../utils/evolutionClient.js';

const mensagem = `Olá ${cliente.nome}! 😊\n\n` +
  `Passamos a lembrar que a próxima parcela do seu ${pacote.nome} ` +
  `no valor de €${valorParcela} vence a ${dataFormatada}.\n\n` +
  `Qualquer dúvida, estamos aqui para ajudar!`;

await sendWhatsAppMessage(cliente.telefone, mensagem, tenantId);
```

### 4. Idempotência e observabilidade

- Campo auxiliar `ultimosLembretes: [{ data, tipo }]` em `CompraPacote` — array append-only.
- Antes de enviar, verificar se já existe lembrete para a mesma `proximaDataPagamento` → skip.
- Log estruturado: `[lembreteParcelas] tenant=X cliente=Y compra=Z enviado=true`.

---

## Alternativas Consideradas

### Alternativa A — Calcular a próxima data on-the-fly (sem novo campo)

Em vez de armazenar `proximaDataPagamento`, calcular no job diário: `SELECT * FROM CompraPacote WHERE parcelasPagas < numeroParcelas` e derivar a data a partir de `dataCompra + 30 * (parcelasPagas + 1)`.

- ✅ Sem alteração de schema.
- ❌ Não permite ao user ajustar manualmente a data da próxima parcela (ex: cliente pediu para adiar). Força a lógica `+30 dias` rígida.
- ❌ Mais pesado no job diário — lê toda a tabela, calcula, filtra em memória.
- **Rejeitada** porque tira flexibilidade ao user e prejudica performance.

### Alternativa B — Job no mesmo controller do `registrarPagamento`

Em vez de CRON, criar o job de lembrete via `setTimeout` / `schedule-job` no momento em que o pagamento é registado, apontando para daqui a ~29 dias.

- ✅ Precisão temporal exacta.
- ❌ Perde-se se o processo Express reiniciar (crash, deploy, cold start no Render free tier). Mesmo problema identificado em ADR-013.
- ❌ Impossível ajustar data depois (delete + create novo setTimeout sem persistência).
- **Rejeitada** por fragilidade operacional.

### Alternativa C — Serviço externo (Twilio Schedule, Zapier, etc.)

Delegar o agendamento e envio a uma plataforma SaaS de automação.

- ✅ Elimina operação de job runner.
- ❌ Custo recorrente adicional (Twilio Schedule ~€0.005/mensagem).
- ❌ Conflito directo com ADR-014 (migração Z-API → Evolution API foi motivada por custo e controlo). Introduzir outro gateway SaaS anula o benefício.
- ❌ Duplicação de stack de mensagens.
- **Rejeitada** por custo e incoerência arquitectural.

### Alternativa D — Não automatizar (manual)

Mostrar na UI `PacotesAtivos` um alerta de "parcela vence em 2 dias" e deixar o user enviar manualmente via o WhatsApp.

- ✅ Zero trabalho técnico.
- ❌ Não resolve o problema central (o user quer automação, não mais alertas para gerir).
- ❌ Não escala.
- **Rejeitada** porque não atende ao requisito.

---

## Consequências

### Positivas

- **Redução de incumprimento:** lembretes automáticos 1–2 dias antes reduzem atrasos de parcelas — efeito documentado em produtos SaaS B2B de cobrança.
- **Reutilização máxima:** aproveita `evolutionClient` (ADR-014), modelo `CompraPacote` e padrão CRON co-localizado já em uso — sem nova dependência.
- **UX consistente:** mensagem segue o mesmo tom dos lembretes de agendamento existentes.
- **Preparado para BullMQ:** a lógica do job é encapsulada e facilmente migrável para BullMQ Scheduled Jobs quando ADR-013 for implementado.

### Negativas / Trade-offs

- **CRON co-localizado herda os mesmos riscos de ADR-013 (pendente):** cold start no Render free tier pode atrasar o job se nenhum request chegar à hora prevista. Mitigação: uptime monitor externo (UptimeRobot) ou migrar para BullMQ na Fase 2.
- **Dependência da Evolution API:** se a instância Docker estiver offline, lembretes silenciosamente falham. Mitigação: alertas via log + retry no dia seguinte (não implementado nesta ADR — fica para iteração).
- **Granularidade fixa de 30 dias:** a primeira versão assume ciclo mensal. Clientes com acordos diferentes precisam de editar manualmente a `proximaDataPagamento` (suportado, mas sem UI dedicada nesta fase).
- **Custo de envio:** 1 mensagem por parcela vencível por dia × N clientes. Para tenants com muitos clientes parceladas, pode pressionar o rate limit da instância Evolution API. Mitigação futura: throttling no worker.
- **Idempotência frágil:** se o job correr 2x no mesmo dia (ex: restart), o guard `ultimosLembretes` protege, mas assume que o clock da máquina está correcto.

### Riscos

- **Falso positivo (mensagem enviada mas cliente já pagou):** se o pagamento for registado com delay na UI, cliente recebe lembrete desnecessário. Mitigação: verificar `statusPagamento !== 'Pago'` e `valorPendente > 0` imediatamente antes do envio.
- **Spam percebido:** enviar lembrete todas as parcelas pode irritar alguns clientes. Mitigação futura: opt-out por cliente (campo `aceitaLembretesWhatsApp` em `Cliente`).

---

## Links e Referências

- [ADR-006: Z-API WhatsApp Integration](./ADR-006-z-api-whatsapp-integration.md) — substituído por ADR-014
- [ADR-013: Notification Pipeline com BullMQ + Redis](./ADR-013-notification-pipeline-bullmq.md) — esta ADR depende da migração prevista em ADR-013
- [ADR-014: Migração Z-API → Evolution API](./ADR-014-evolution-api-whatsapp-migration.md) — infraestrutura WhatsApp actual
- [ADR-016: Evolution API v2 Upgrade](./ADR-016-evolution-api-v2-upgrade.md) — versão em uso
- [ADR-011: Modular Monolith Agendamento/Financeiro](./ADR-011-modular-monolith-agendamento-financeiro.md) — fronteiras entre módulos PKG/FIN e NOTIF
- Código relacionado:
  - `src/models/CompraPacote.js` — receberá campo `proximaDataPagamento`
  - `src/controllers/transacaoController.js::registrarPagamento` — ponto de update da próxima data
  - `src/utils/evolutionClient.js::sendWhatsAppMessage` — canal de envio
  - `src/utils/scheduleNotifications.js` — padrão existente a seguir
