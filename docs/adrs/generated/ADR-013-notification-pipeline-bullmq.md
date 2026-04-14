# ADR-013: Notification Pipeline com BullMQ + Redis

**Status:** Accepted — Implementação planeada Fase 2  
**Data:** 2026-04-12  
**Módulo:** NOTIF  
**Autor:** André dos Reis  
**Score de Impacto:** 135 (Alto)

---

## Contexto

O sistema actual de notificações tem dois problemas estruturais:

**1. CRON único às 19h (frágil):**
O lembrete de agendamentos corre uma vez por dia às 19h no mesmo processo Express. Não tem granularidade horária — todos os lembretes do dia seguinte são enviados de uma vez, independentemente da hora do agendamento. Se o processo estiver em sleep (Render free tier), os lembretes não são enviados.

**2. Sem pipeline de notificações:**
O sistema não tem capacidade de enviar notificações em momentos específicos relativos ao agendamento — confirmação imediata, lembrete 24h antes, 1h antes, 30 minutos antes. Implementar isto com CRONs seria inviável e frágil.

A profissional e a sua cliente precisam de um pipeline de comunicação claro e fiável que reduza faltas — a proposta de valor central do produto.

---

## Decisão

Adoptar **BullMQ + Redis** como infraestrutura de fila de jobs para o pipeline de notificações, correndo num **worker separado** do processo HTTP principal.

**Pipeline de notificações por agendamento:**

```
Agendamento criado
  → Job imediato:    confirmação por email + WhatsApp
  → Job -24h:        lembrete "amanhã às HH:MM"
  → Job -1h:         lembrete "daqui a 1 hora"
  → Job -30min:      lembrete "estamos à sua espera"
```

**Implementação — NotificationScheduler:**

```javascript
// src/modules/notificacoes/NotificationScheduler.js

export class NotificationScheduler {

  async onAgendamentoCriado(agendamento) {
    const { dataHora, clienteEmail, clienteTelefone, tenantId } = agendamento;
    const now = Date.now();
    const horaAgendamento = new Date(dataHora).getTime();

    // Confirmação imediata
    await notifQueue.add('notificacao',
      { tipo: 'confirmacao', agendamento },
      { delay: 0 }
    );

    // Lembrete 24h antes
    const delay24h = horaAgendamento - now - 24 * 60 * 60 * 1000;
    if (delay24h > 0) {
      await notifQueue.add('notificacao',
        { tipo: 'lembrete_24h', agendamento },
        { delay: delay24h, jobId: `24h-${agendamento._id}` }
      );
    }

    // Lembrete 1h antes
    const delay1h = horaAgendamento - now - 60 * 60 * 1000;
    if (delay1h > 0) {
      await notifQueue.add('notificacao',
        { tipo: 'lembrete_1h', agendamento },
        { delay: delay1h, jobId: `1h-${agendamento._id}` }
      );
    }

    // Lembrete 30min antes
    const delay30min = horaAgendamento - now - 30 * 60 * 1000;
    if (delay30min > 0) {
      await notifQueue.add('notificacao',
        { tipo: 'lembrete_30min', agendamento },
        { delay: delay30min, jobId: `30min-${agendamento._id}` }
      );
    }
  }

  // Cancelar todos os jobs pendentes se o agendamento for cancelado
  async onAgendamentoCancelado(agendamentoId) {
    await notifQueue.remove(`24h-${agendamentoId}`);
    await notifQueue.remove(`1h-${agendamentoId}`);
    await notifQueue.remove(`30min-${agendamentoId}`);

    // Notificar cancelamento
    await notifQueue.add('notificacao',
      { tipo: 'cancelamento', agendamentoId },
      { delay: 0 }
    );
  }

  // Re-agendar jobs se a hora do agendamento for alterada
  async onAgendamentoAlterado(agendamento, anterior) {
    await this.onAgendamentoCancelado(agendamento._id);
    await this.onAgendamentoCriado(agendamento);
  }
}
```

**Worker separado:**

```javascript
// src/worker.js — processo independente do Express

const worker = new Worker('notificacoes', async (job) => {
  const { tipo, agendamento } = job.data;

  switch (tipo) {
    case 'confirmacao':
      await enviarEmail(agendamento);
      await enviarWhatsApp(agendamento, templateConfirmacao);
      break;
    case 'lembrete_24h':
      await enviarWhatsApp(agendamento, templateLembrete24h);
      break;
    case 'lembrete_1h':
      await enviarWhatsApp(agendamento, templateLembrete1h);
      break;
    case 'lembrete_30min':
      await enviarWhatsApp(agendamento, templateLembrete30min);
      break;
    case 'cancelamento':
      await enviarWhatsApp(agendamento, templateCancelamento);
      break;
  }
}, { connection: redis });
```

---

## Alternativas Consideradas

### 1. CRON múltiplos (ex: a cada hora verificar agendamentos próximos)
- **Vantagem:** Sem dependência de Redis; implementação simples
- **Desvantagem:** Queries frequentes à base de dados; granularidade limitada (mínimo 1 minuto de erro); se o processo cair entre CRONs, as notificações perdem-se; não escala com múltiplos tenants
- **Descartada** por fragilidade e falta de precisão

### 2. Serviço externo (Twilio, SendGrid Scheduled)
- **Vantagem:** Zero infraestrutura a gerir
- **Desvantagem:** Custo por notificação; dependência de vendor para funcionalidade core do produto; sem controlo sobre retry logic
- **Descartada** por custo e dependência

### 3. BullMQ + Redis (decisão adoptada)
- **Vantagem:** Jobs persistidos no Redis — sobrevivem a reinícios do servidor; retry automático em caso de falha; `jobId` único por agendamento permite cancelar jobs específicos; worker independente do processo HTTP
- **Desvantagem:** Redis como nova dependência de infraestrutura; BullMQ requer aprendizagem
- **Adoptada** como única solução que garante fiabilidade e granularidade temporal

---

## Consequências

### Positivas
- **Fiabilidade:** Jobs persistidos no Redis — um restart do servidor não perde notificações agendadas
- **Precisão temporal:** Cada notificação é enviada no momento exacto, não numa janela de 1 hora
- **Cancelamento de jobs:** Se o agendamento é cancelado, os lembretes pendentes são removidos da fila — sem mensagens fantasma
- **Retry automático:** BullMQ tenta novamente em caso de falha (ex: WhatsApp indisponível) com backoff configurável
- **Resolve o cold start:** Worker em processo separado — não depende do processo HTTP estar activo

### Negativas / Trade-offs
- **Redis como dependência:** Nova peça de infraestrutura — requer Docker (ADR-012) ou Redis gerido (Upstash tem free tier)
- **Complexidade operacional:** Monitorizar a fila de jobs, gerir jobs falhados, dashboards BullMQ (Bull Board)
- **Jobs de agendamentos passados:** Se um agendamento for criado com menos de 24h de antecedência, o lembrete de 24h é ignorado — lógica de `delay > 0` necessária

### Opção de Redis gerido (sem Docker imediato)
> **Upstash Redis** — free tier com 10.000 comandos/dia, suficiente para a fase actual. Permite usar BullMQ sem gerir infraestrutura Redis própria. URL de conexão directamente nas variáveis de ambiente.

---

## Canais de notificação por tipo

| Tipo | Email | WhatsApp | Web Push |
|------|-------|----------|----------|
| Confirmação imediata | ✅ | ✅ | ✅ (profissional) |
| Lembrete 24h antes | — | ✅ | — |
| Lembrete 1h antes | — | ✅ | — |
| Lembrete 30min antes | — | ✅ | — |
| Cancelamento | ✅ | ✅ | ✅ (profissional) |

---

## Links e Referências

- **Data da decisão:** 2026-04-12
- **Dependência:** Redis (Upstash free tier ou Docker local)
- **Instalar:**
  ```bash
  npm install bullmq ioredis
  ```
- **Ficheiros a criar:**
  - `src/modules/notificacoes/NotificationScheduler.js`
  - `src/worker.js` — processo worker independente
  - `src/queues/notifQueue.js` — configuração da fila
- **ADRs relacionados:**
  - [ADR-008: Web Push PWA](./ADR-008-web-push-pwa-notification-strategy.md)
  - [ADR-006: Z-API WhatsApp](./ADR-006-z-api-whatsapp-integration.md)
  - [ADR-012: Docker Containerization](./ADR-012-docker-containerization-strategy.md)
