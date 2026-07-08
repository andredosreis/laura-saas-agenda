# Aviso de ligação WhatsApp (Evolution) em baixo — Design

- **Data:** 2026-07-08
- **Estado:** Aprovado (brainstorming) — pendente de plano de implementação
- **Autor:** André + Claude

## 1. Contexto e problema

A 2026-07-08, a instância Evolution `marcai` perdeu a ligação ao WhatsApp
(estado `close`/`connecting`, sessão deslogada com a Laura no estrangeiro).
A partir de ~00:45 (Lisboa) **todos** os envios passaram a devolver
`HTTP 500 {"message":"Connection Closed"}` — envios manuais do inbox,
respostas da IA e lembretes automáticos, todos em silêncio. O problema só foi
notado horas depois, quando um envio manual falhou visivelmente no painel.

**O sistema falha silenciosamente todos os envios quando a ligação cai, sem
avisar ninguém.** Objectivo desta feature: detectar a queda e avisar por um
canal **independente do WhatsApp**, para que não volte a passar despercebido.

### Diagnóstico relevante (referência)
- Envio manual e automáticos usam a mesma função `sendWhatsAppMessage`
  (`src/utils/evolutionClient.js`); a diferença é só a instância. Ambos = `marcai`.
- Produção fala com `EVOLUTION_API_URL=http://evolution-api:8080` (rede Docker
  interna do Contabo). ⚠️ O `EVOLUTION_API_URL` do `.env` **local** aponta para
  outro servidor — não é autoritativo. O poller corre no backend, logo usa o URL
  interno correcto.
- Recuperação exige re-scan do QR pela Laura (esta Evolution, evoapicloud
  v2.3.7, não emite pairing code) via Manager `https://wa.80.241.222.235.sslip.io/manager/`.
- Detalhe completo: memória `reference_evolution_connection_diagnostics`.

## 2. Objectivos e não-objectivos

**Objectivos**
- Detectar `connectionState != open` da(s) instância(s) Evolution, incluindo o
  caso "Evolution API totalmente inacessível".
- Avisar por **email (Resend)** + registar no **Sentry** — canais independentes
  do WhatsApp.
- Ritmo: 1 email ao **cair**, **lembrete diário** enquanto continuar em baixo,
  1 email ao **recuperar**.
- Detecção proativa (apanha quedas de madrugada sem tráfego) **e** reactiva
  (deteção rápida quando um envio falha) — abordagem híbrida.
- O email traz o **runbook de recuperação** embutido (link do Manager + passos).

**Não-objectivos (YAGNI)**
- Banner/aviso in-app no painel (decidido: só email + Sentry).
- Web push como canal de alerta.
- Reconexão automática da instância (restart/QR do nosso lado não religa — foi
  testado; exige a Laura).
- Dashboard/histórico de uptime da ligação.
- Dedup partilhado entre réplicas (assume-se 1 backend — ver §7).

## 3. Arquitectura

Os dois caminhos de detecção convergem numa única função `checkInstanceHealth`,
que usa um **decisor puro** `decideAlert(...)`. Sem lógica de alerta duplicada.
Espelha o padrão já existente `messageRouter.decide` (decisor puro + caller impuro).

```
                    ┌─────────────────────────────────────────┐
   CRON (5 min) ───►│   checkInstanceHealth(tenant)           │
   (proativo)       │   1. getConnectionState(instance) ──────┼─► GET /instance/
                    │   2. decideAlert(guardado, obs, agora)  │   connectionState/{inst}
   sendWhatsApp ───►│      ◄── PURO                            │
   falha c/         │   3. persiste no Tenant ($set cirúrgico) │
   "Connection      │   4. executa acção (email + Sentry)     │
   Closed"      ───►└─────────────────────────────────────────┘
   (reactivo,
    debounced)
```

## 4. Componentes

Cinco unidades pequenas e focadas:

1. **`src/utils/evolutionClient.js`** — nova função `getConnectionState(instanceName)`:
   `GET /instance/connectionState/{inst}`. Devolve `{ ok: true, state }`
   (`open`/`close`/`connecting`) ou `{ ok: false, unreachable: true, error }`
   em erro de rede/timeout. Reusa `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` do env.

2. **`src/services/evolutionHealthService.js`**:
   - `decideAlert(stored, observed, now)` — **função pura**. Devolve
     `{ nextState, action, reason }`, `action ∈ none|notify_down|notify_daily|notify_recovered`.
   - `checkInstanceHealth(tenant)` — orquestra: consulta estado → `decideAlert`
     → persiste no Tenant → dispara canal. Guarda `inFlight` por instância.
   - `noteSendFailure(instanceName, error)` — entrada reactiva: se o erro é de
     desconexão (`Connection Closed`), com debounce (≤1 recheck/instância/60s),
     dispara `checkInstanceHealth` imediato **e** agenda 1 recheck de confirmação
     a `CONFIRM_MS`.
   - `sendAlertEmail(...)` / `captureSentry(...)` — helpers de canal.

3. **`src/jobs/evolutionHealthJob.js`** — `startEvolutionHealthCron()` com
   `node-cron`, gated por env (igual a `lembreteParcelaJob`). A cada 5 min itera
   os tenants com `whatsapp.instanceName` definido e chama `checkInstanceHealth`
   em paralelo (`Promise.all`, cada um em try/catch).

4. **Ligação reactiva** — uma linha no `catch` de `sendWhatsAppMessage`:
   `noteSendFailure(instance, error)` (fire-and-forget).

5. **Canais** — `emailService.sendEmail({ to: ALERT_EMAIL, subject, html, text })`
   + `Sentry.captureMessage`.

**Persistência** — subdoc no Tenant:
`whatsapp.health = { state: 'open'|'down'|'unknown', downSince: Date|null, lastAlertAt: Date|null }`,
actualizado por `$set` cirúrgico nos caminhos com ponto (`whatsapp.health.*`),
para preservar os irmãos de `whatsapp` (lição do "wipe silencioso").

## 5. Máquina de estados (`decideAlert`)

**Entrada observada** normalizada em `healthy` (state `open`) vs `unhealthy`
(`close`/`connecting` → reason *sessão caída*; `unreachable` → reason *API
Evolution em baixo*).

**Anti-flapping:** o alerta de queda só dispara com `downSince` há ≥ `CONFIRM_MS`
(default 3 min). Um blip que recupera dentro da janela nunca gera email.

| Estado guardado | Observado | Condição | Acção | Próximo estado |
|---|---|---|---|---|
| open / unknown | healthy | — | `none` | open, limpa |
| open / unknown | unhealthy | novo episódio | `none` (arma relógio) | down, downSince=agora, lastAlertAt=∅ |
| down | unhealthy | não alertou **e** downSince ≥ CONFIRM_MS | `notify_down` | down, lastAlertAt=agora |
| down | unhealthy | não alertou **e** downSince < CONFIRM_MS | `none` | down |
| down | unhealthy | já alertou **e** lastAlertAt ≥ DAILY_MS | `notify_daily` | down, lastAlertAt=agora |
| down | unhealthy | já alertou **e** lastAlertAt < DAILY_MS | `none` | down |
| down (já alertado) | healthy | — | `notify_recovered` | open, limpa |
| down (nunca alertou) | healthy | era um blip | `none` | open, limpa |

`decideAlert` recebe `now` como argumento (determinístico, sem `DateTime.now()`
lá dentro) — usa Luxon `Europe/Lisbon` no caller.

## 6. Configuração (env)

| Var | Default | Função |
|---|---|---|
| `EVOLUTION_HEALTH_CRON` | (on) | `off` desliga a feature toda |
| `EVOLUTION_HEALTH_CRON_SCHEDULE` | `*/5 * * * *` | cadência do poller |
| `EVOLUTION_HEALTH_CONFIRM_MS` | `180000` | janela anti-flap (3 min) |
| `EVOLUTION_HEALTH_DAILY_MS` | `86400000` | intervalo do lembrete diário (24h) |
| `EVOLUTION_HEALTH_RECHECK_DEBOUNCE_MS` | `60000` | debounce do caminho reactivo |
| `ALERT_EMAIL` | (vazio) | destinatário; vazio → só Sentry + warn |

Nenhum segredo hardcoded — chaves e URLs vêm de `process.env` (`EVOLUTION_API_KEY`,
`EVOLUTION_API_URL` já existentes).

**Email** — assunto `⚠️ Marcai: WhatsApp desligado (instância <instanceName>)` /
recuperação `✅ Marcai: WhatsApp reconectado (instância <instanceName>)`, onde
`<instanceName>` é a instância afectada (hoje `marcai`). Corpo: instância, tenant, desde
quando (Lisboa), motivo (sessão caída vs API em baixo) e o runbook:
> Abrir o Manager `https://wa.80.241.222.235.sslip.io/manager/` (login = API key),
> instância `marcai` → a Laura scaneia o QR no telemóvel (Dispositivos ligados).

## 7. Tratamento de erros

1. **Inacessível ≠ caída** — `unreachable` conta como `unhealthy` com motivo próprio.
2. **Alerta que falha não suprime o próximo** — persiste sempre `state`/`downSince`;
   `lastAlertAt` só grava **após** email OK. Email falhou → `lastAlertAt=∅` → o
   próximo poll re-tenta.
3. **Reactivo nunca parte o envio** — `noteSendFailure` fire-and-forget, sem
   `await`, sem lançar. `sendWhatsAppMessage` devolve o mesmo de hoje.
4. **Poller robusto** — cada tenant em try/catch; checks em paralelo
   (`Promise.all`, sem `await` em loop, regra do projeto). `inFlight` por
   instância evita poller × reactivo em simultâneo.
5. **Graceful degrade** — `=off` não arranca; `ALERT_EMAIL` vazio → só Sentry +
   warn no boot.
6. **Assunção:** dedup em memória assume **1 réplica de backend** (caso do
   Contabo). Escalar para N réplicas → mover dedup para Redis (fora de âmbito).

## 8. Testes

Jest + `mongodb-memory-server`; `emailService`, `evolutionClient` e Sentry
mockados — sem Evolution/SMTP reais.

- **`decideAlert` (puro) — 100%**, table-driven: cada linha da §5 (blip <CONFIRM
  sem email, confirma ≥CONFIRM = `notify_down`, diário ≥DAILY, recuperação,
  unreachable vs close).
- **`checkInstanceHealth`** — mock `getConnectionState`+`sendEmail`, Tenant em
  memória: email certo ao cair; `$set` cirúrgico preserva irmãos (teste do
  não-wipe); `lastAlertAt` só com email OK; re-tenta se email falha.
- **`noteSendFailure`** — debounce (2 falhas → 1 check), ignora erros
  não-desconexão, nunca lança.
- **Cron starter** — respeita `=off`, só itera tenants com `instanceName`, erro
  de um tenant não trava os outros.

Cobertura: `decideAlert` 100%; `evolutionHealthService` ≥ 70%.

## 9. Rollout

- Feature liga por default; controlável por `EVOLUTION_HEALTH_CRON`.
- Definir `ALERT_EMAIL` no env de produção (Contabo) antes/ao deploy.
- Auto-deploy: push a `main` (`src/`) → rebuild do backend no Contabo.
- Validação pós-deploy: forçar `connectionState != open` (ou baixar a instância
  em janela controlada) e confirmar a chegada do email + evento no Sentry.

## 10. Fora de âmbito / futuro

- Banner in-app no painel (se um dia se quiser que a Laura veja o motivo de a IA
  ter parado).
- Alerta reactivo mais fino (marcar suspeita já no 1º erro sem recheck).
- Dedup via Redis para multi-réplica.
- Métricas de uptime da ligação.
