# ADR-015: Integração Google Calendar — Admin e Email do Cliente

**Status:** Proposed  
**Data:** 2026-04-18  
**Módulo:** NOTIF / CAL  
**Autor:** André dos Reis  
**Score de Impacto:** 110 (Alto)

---

## Contexto

O sistema envia confirmações e lembretes via WhatsApp (ADR-014) e tem pipeline BullMQ (ADR-013). No entanto, falta integração com o calendário da profissional e uma forma do cliente guardar facilmente o agendamento no seu próprio calendário.

Dois problemas distintos:

**1. Profissional (Laura):** Gere os agendamentos no sistema mas não tem sincronização automática com o Google Calendar. Tem de introduzir manualmente cada agendamento no calendário se quiser visibilidade no telemóvel ou integração com outros serviços.

**2. Cliente:** Recebe confirmação por WhatsApp mas não tem uma forma fácil de guardar o agendamento no seu calendário — aumentando o risco de esquecimento e faltas.

A redução de faltas é a proposta de valor central do produto. Qualquer canal adicional que ajude o cliente a lembrar-se do agendamento tem impacto directo na retenção da profissional.

---

## Decisão

Implementar a integração em duas fases com complexidades distintas:

### Fase 1 — Link Google Calendar no email do cliente (sem OAuth)

Ao criar um agendamento, enviar email de confirmação ao cliente com um botão "Adicionar ao Google Calendar". O link é uma URL pré-preenchida — não requer autenticação nem OAuth:

```
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text=Sessão+na+La+Estética+Avançada
  &dates=20260418T160000Z/20260418T170000Z
  &details=Agendamento+confirmado.+Qualquer+dúvida+contacte+o+salão.
  &location=Rua+das+Flores%2C+Lisboa
```

O cliente clica no link e adiciona ao Google Calendar (ou Apple Calendar, Outlook) com um clique — zero fricção, zero autenticação.

**Implementação:**
- `src/utils/calendarLink.js` — função `buildGoogleCalendarLink({ titulo, dataInicio, dataFim, descricao, local })`
- `src/services/emailService.js` — template HTML de confirmação com botão "Adicionar ao Calendário"
- `src/workers/notificationWorker.js` — job `confirmacao` passa a enviar email + WhatsApp (já previsto no ADR-013)

**Pré-requisito:** cliente ter email registado no perfil (`Cliente.email`); se não tiver, ignora silenciosamente.

---

### Fase 2 — Evento automático no Google Calendar da profissional (OAuth2)

Quando um agendamento é criado, criar automaticamente um evento no Google Calendar da Laura.

**Fluxo de autorização (uma vez):**
1. Laura vai a **Configurações → Google Calendar**
2. Clica "Ligar Google Calendar"
3. Redireccionada para Google OAuth consent screen
4. Autoriza acesso ao calendário
5. Google redireciona para `/api/auth/google/callback` com `code`
6. Backend troca `code` por `access_token` + `refresh_token`
7. Tokens guardados em `Tenant.whatsapp.googleCalendar` (ou campo dedicado)

**Criação de evento:**
```javascript
// Ao criar agendamento
await googleCalendarService.criarEvento(tenantId, {
  summary: `${cliente.nome} — ${servicoNome}`,
  start: { dateTime: dataHora, timeZone: 'Europe/Lisbon' },
  end: { dateTime: dataHoraFim, timeZone: 'Europe/Lisbon' },
  description: `Tel: ${cliente.telefone}`,
});
```

**Gestão do ciclo de vida:**
- Agendamento cancelado → evento eliminado do Google Calendar
- Agendamento reagendado → evento actualizado
- Token expirado → refresh automático com `refresh_token`

**Variáveis de ambiente:**
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://laura-saas.onrender.com/api/auth/google/callback
```

**Dependências:**
```bash
npm install googleapis
```

---

## Alternativas Consideradas

### 1. Apenas link no email (sem evento automático na profissional)
- **Vantagem:** Zero complexidade OAuth; funciona imediatamente
- **Desvantagem:** A profissional tem de clicar manualmente para adicionar ao seu calendário
- **Adoptada como Fase 1** — entrega valor imediato com esforço mínimo

### 2. iCalendar (.ics) em vez de link Google
- **Vantagem:** Funciona com qualquer calendário (Apple, Outlook, Google); padrão universal
- **Desvantagem:** Requer download de ficheiro; pior UX em mobile
- **Alternativa considerada** para Fase 1 — pode ser adicionado como opção secundária

### 3. Google Calendar API com Service Account (sem OAuth do utilizador)
- **Vantagem:** Sem fluxo OAuth por tenant; um service account para tudo
- **Desvantagem:** Eventos aparecem num calendário partilhado, não no calendário pessoal da profissional; requer partilha manual do calendário com o service account
- **Descartada** por má UX — a profissional quer ver os eventos no seu calendário pessoal

### 4. Calendly ou integração de terceiros
- **Vantagem:** Zero desenvolvimento; produto já existente
- **Desvantagem:** Custo adicional; perde o controlo do fluxo de agendamento; duplicação de dados
- **Descartada** — a proposta de valor do produto é ser o sistema de agendamento

---

## Consequências

### Positivas
- **Redução de faltas** — cliente tem o agendamento no calendário, recebe lembretes automáticos do Google
- **UX profissional** — profissional vê todos os agendamentos no Google Calendar sem acção manual
- **Credibilidade** — email de confirmação com link de calendário é percepcionado como profissional
- **Fase 1 sem OAuth** — entrega valor imediato ao cliente sem dependência de autorização da profissional

### Negativas / Trade-offs
- **Fase 2 requer setup no Google Cloud Console** — criar projecto, activar Google Calendar API, configurar OAuth consent screen; processo manual de ~30 minutos
- **Tokens precisam de refresh** — se `refresh_token` expirar ou for revogado (ex: Laura altera password Google), a integração para; necessário UI de estado da ligação em Configurações
- **Fase 2 multi-tenant** — cada tenant tem os seus próprios tokens OAuth; tokens guardados na DB (cifrados)
- **Email requer SMTP configurado** — depende de `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` no Render; sem SMTP, Fase 1 não funciona

### Dependência de Fase 1 em dados do cliente
- Cliente sem email → email não é enviado (degradação silenciosa, WhatsApp cobre)
- Cliente com email inválido → nodemailer lança erro → job BullMQ falha e retenta (3x)

---

## Plano de Implementação

### Fase 1 — Email + Link (estimativa: 2-3h)

```
1. src/utils/calendarLink.js        — buildGoogleCalendarLink()
2. src/services/emailService.js     — template HTML confirmação agendamento
3. src/workers/notificationWorker.js — job 'confirmacao' envia email
4. Render: configurar SMTP vars     — SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM
```

### Fase 2 — OAuth + Evento automático (estimativa: 1 dia)

```
1. Google Cloud Console             — OAuth2 credentials
2. src/services/googleCalendarService.js — criarEvento, actualizarEvento, eliminarEvento
3. src/routes/authRoutes.js         — GET /api/auth/google, GET /api/auth/google/callback
4. src/models/Tenant.js             — campo googleCalendar: { accessToken, refreshToken, calendarId }
5. laura-saas-frontend/Configuracoes.jsx — botão "Ligar Google Calendar" + estado da ligação
6. src/controllers/agendamentoController.js — chamar googleCalendarService após criar/cancelar
```

---

## Links e Referências

- **Data da decisão:** 2026-04-18
- **Google Calendar API:** `https://developers.google.com/calendar/api`
- **URL format Google Calendar:** `https://calendar.google.com/calendar/render?action=TEMPLATE&...`
- **Dependências Fase 2:** `npm install googleapis`
- **ADRs relacionados:**
  - [ADR-013: Notification Pipeline BullMQ](./ADR-013-notification-pipeline-bullmq.md)
  - [ADR-014: Evolution API WhatsApp](./ADR-014-evolution-api-whatsapp-migration.md)
  - [ADR-008: Web Push PWA](./ADR-008-web-push-pwa-notification-strategy.md)
  - [ADR-009: Split Deploy Render/Vercel](./ADR-009-split-deploy-render-vercel.md)
