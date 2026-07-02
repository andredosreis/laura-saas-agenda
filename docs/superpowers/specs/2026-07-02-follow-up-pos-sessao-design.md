# Follow-up pós-sessão — Design

**Data:** 2026-07-02
**Estado:** Aprovado (brainstorming com André)

## Objectivo

Depois de uma sessão terminar (ex. 14:00), a IA contacta o cliente ~5 minutos depois (ex. 14:05) por WhatsApp para perguntar como correu. A resposta do cliente serve também para apurar presença (Compareceu / Não Compareceu). Se o cliente tiver sessões de pacote disponíveis, a IA propõe marcar a próxima; se era a última sessão do pacote, propõe renovação (com handoff para a Laura). A marcação da próxima sessão é fechada pelo agente IA existente, com mensagem automática de confirmação já existente.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Trigger | Por horário: job BullMQ com delay para `dataHora + duração + 5 min`. O follow-up apura presença — não depende de a Laura marcar status |
| Status quando cliente confirma presença | `Compareceu` (sem efeito financeiro). A Laura promove a `Realizado` (que consome sessão via `usarSessao`) |
| Status quando cliente diz que faltou | `Não Compareceu` + IA propõe outro dia na mesma conversa |
| Elegibilidade | Todos os clientes recebem follow-up; proposta de marcação só com sessões de pacote disponíveis; proposta de renovação quando era a última sessão |
| Forma da proposta | Pergunta aberta — o agente IA negoceia dia/hora em conversa (tools existentes) |
| Renovação de pacote | Handoff: IA propõe; se o cliente aceitar, alerta a Laura (push + WhatsApp admin). A IA **nunca** cria a CompraPacote |
| Arquitectura | Template fixo enviado pelo worker Node; respostas tratadas pelo agente cliente (ia-service) com contexto e tools novas |
| Leads | Fora do MVP — só agendamentos com `cliente` associado |
| Lembretes existentes | **Intocados.** O pipeline de lembretes não é responsabilidade da IA e não é alterado (instância global, `registarNaThread`, ADR-027 mantêm-se como estão) |

## 1. Agendamento do job (Node, BullMQ)

`src/utils/scheduleNotifications.js` passa a criar um 4º job na fila `notifications`:

- **Tipo:** `follow-up-pos-sessao`
- **jobId:** `${agendamentoId}-followup` (determinístico; adicionado à lista de remoção na remarcação)
- **Delay:** `dataHora + duracaoSessao + 5 min − agora` (duração = `tenant.configuracoes.duracaoSessaoPadrao`, default 60 min; não existe campo de duração no Agendamento)
- **job.data:** `{ tipo, agendamentoId, tenantId, dataHora }` (mesmo padrão dos lembretes)

Comportamento herdado do padrão actual:

- Remarcação → job antigo removido e recriado com o novo horário
- Cancelamento → job não é removido; auto-invalida-se no disparo
- Sem Redis → degrada graciosamente: o follow-up simplesmente não é agendado (sem fallback imediato — ao contrário da confirmação)

## 2. Disparo (src/workers/notificationWorker.js — handler novo)

Resolve o DB do tenant (`getTenantDB(tenantId)` → `getModels(db)`, padrão dos jobs existentes). Verificações por ordem — qualquer falha termina o job silenciosamente (log, sem envio):

1. **Obsolescência** — agendamento inexistente, status cancelado, ou `dataHora` diferente da do job (reutiliza/estende `lembreteObsoleto`)
2. **Tem `cliente`** — agendamentos de lead (sem ref `cliente`) são ignorados
3. **Idempotência** — `agendamento.followUp?.enviadoEm` já existe → não reenvia
4. **Gating IA** — exige `Tenant.configuracoes.iaGlobalAtiva === true` **e** `Cliente.iaAtiva === true` **e** `Tenant.configuracoes.followUpPosSessaoAtivo === true`. Sem IA activa não há follow-up (a resposta do cliente precisa do agente para ser tratada)

### Situação do pacote

Se `agendamento.compraPacote` existe, carregar a CompraPacote e calcular:

```
consumida = historico contém uso desta sessão (Laura já marcou Realizado)
sessoesRestantesAposEsta = sessoesRestantes − (consumida ? 0 : 1)
```

- `> 0` → propor marcação da próxima
- `== 0` → era a última sessão → mencionar fim do pacote (gancho para renovação)
- Sem `compraPacote` (avulso/oferta) → só feedback, sem proposta

### Variantes do template

| Condição no disparo | Mensagem |
|---|---|
| Status `Agendado`/`Confirmado`/`Compareceu`/`Realizado` | "Olá {nome}! Como correu a sessão de hoje? 😊" + se `restantesAposEsta > 0`: "Ainda tem {n} sessões no pacote — quer deixar já marcada a próxima?" + se `== 0`: "Esta era a última sessão do seu pacote — quer saber como renovar?" |
| Laura já marcou `Não Compareceu` | "Sentimos a sua falta hoje, {nome} 💜 Quer remarcar a sua sessão?" |

### Envio e persistência

- Envio via `sendWhatsAppMessage(telefone, texto, tenant.whatsapp.instanceName)` — **este job novo** usa a instância do tenant. Os jobs de lembrete existentes não são alterados.
- Gravar `Mensagem` com `origem: 'laura'`, `direcao: 'saida'`, `geradoPor: 'sistema'`, **ligada à `Conversa`** (encontrar/criar por telefone — padrão do endpoint `POST /api/internal/clientes/mensagens`). Não reutilizar o `registarNaThread` actual nem o modificar.
- Gravar `agendamento.followUp = { enviadoEm: agora }`.

## 3. Modelo de dados

- **`Agendamento.followUp`** (subdocumento novo, opcional): `{ enviadoEm: Date, respostaEm: Date, feedback: String }`
- **`Tenant.configuracoes.followUpPosSessaoAtivo`**: `Boolean, default: true` — kill-switch por tenant, independente do master switch da IA

Sem migração necessária: campos novos opcionais/default em documentos existentes.

## 4. Resposta do cliente (ia-service Python)

A resposta entra pelo webhook normal → `messageRouter` (routing inalterado) → `client_orchestrator` → `client_agent`.

### Injecção de contexto

O endpoint interno `GET /api/internal/clientes/:id/agendamentos` passa a devolver também o subdocumento `followUp` de cada agendamento. O `client_orchestrator` (que já chama `marcai_client.get_client_appointments`) detecta um follow-up pendente — agendamento com `followUp.enviadoEm` **nas últimas 24 horas** e sem `respostaEm` — e injecta no prompt do agente:

> "Foi enviado um follow-up da sessão de {data} às {hora}. Interpreta a resposta do cliente: (1) regista a presença com `registar_presenca`; (2) se compareceu e tem {n} sessões disponíveis, propõe marcar a próxima; (3) se era a última sessão do pacote, propõe renovação e usa `sinalizar_interesse_renovacao` se aceitar; (4) se não compareceu, propõe remarcar."

Passadas 24h sem resposta, o contexto deixa de ser injectado e a conversa segue o fluxo normal.

### Tools novas no client_agent

1. **`registar_presenca(compareceu: bool, feedback: str | None)`**
   → `PATCH /api/internal/clientes/:id/agendamentos/:agendamentoId/presenca`
   - O `agendamentoId` do follow-up pendente é capturado por closure na factory da tool (padrão existente: `tenant_id`/`cliente_id` nunca são expostos ao LLM). A tool só é registada no agente quando há follow-up pendente.
   - Marca `Compareceu` ou `Não Compareceu` **apenas** se o status actual for `Agendado` ou `Confirmado` — nunca sobrepõe status já definido pela Laura (`Realizado`, `Fechado`, cancelados). Nesse caso devolve sucesso-noop com o status actual.
   - Grava `followUp.respostaEm = agora` e `followUp.feedback` (texto livre do cliente, se dado).
2. **`sinalizar_interesse_renovacao()`**
   → endpoint interno novo → notifica a Laura: push (pushService) + WhatsApp ao número do admin (padrão do `alerta-admin-pendente`). Payload: cliente, pacote terminado, data. A IA não cria compra nem fala de preços além do que o tenant knowledge já permitir.

### Marcação da próxima sessão

Tool existente `create_client_appointment` — já valida pacotes activos, slots disponíveis, máx. 1 agendamento pendente por cliente. A mensagem automática de confirmação já existe (job `confirmacao` do `scheduleNotifications`). Nada de novo aqui.

## 5. Endpoints internos novos (Node, `requireServiceToken`)

| Endpoint | Função |
|---|---|
| `PATCH /api/internal/clientes/:id/agendamentos/:agendamentoId/presenca` | Regista presença (regras acima), grava followUp.respostaEm/feedback. Query tenant-scoped; recurso de outro tenant → 404 |
| `POST /api/internal/clientes/:id/renovacao-interesse` | Alerta a Laura (push + WhatsApp admin) do interesse em renovar |

Ambos seguem o contrato `{ success, data/error }` e validação de ObjectId.

## 6. Casos limite

- **Sessão tardia (20:30)** → follow-up ~21:35. Aceite sem quiet-hours, coerente com o comportamento dos lembretes actuais.
- **Resposta dias depois** → contexto expira às 24h; o agente trata como conversa normal.
- **Vários agendamentos no mesmo dia** → um follow-up por agendamento (jobId por agendamento).
- **Cliente com IA pausada (`iaAtiva: false`)** → sem follow-up; a Laura está a gerir esse contacto manualmente.
- **Remarcação depois do follow-up enviado** → fluxo normal de remarcação; o followUp do agendamento antigo mantém-se histórico.
- **Rollout seguro** → em produção `iaGlobalAtiva` está `false`, logo o deploy não tem efeito até a Laura ligar a IA. Kill-switch adicional por tenant (`followUpPosSessaoAtivo`).

## 7. Testes

### Jest (backend)

- `scheduleNotifications`: cria job `-followup` com delay correcto; remove e recria na remarcação; sem Redis não rebenta.
- Handler do worker: cada skip condition (cancelado, dataHora mudou, sem cliente, já enviado, cada flag de gating a false); variante `Não Compareceu`; matemática do pacote (consumida vs não consumida, última sessão, avulso); Mensagem ligada à Conversa; `followUp.enviadoEm` gravado.
- Endpoint `/presenca`: transições permitidas (Agendado/Confirmado → Compareceu/Não Compareceu), noop sobre `Realizado`, **teste de isolamento multi-tenant (404)**.
- Endpoint `/renovacao-interesse`: notificação disparada, isolamento multi-tenant (404).

### pytest (ia-service)

- `registar_presenca` e `sinalizar_interesse_renovacao` com `marcai_client` mockado (sucesso, noop, erro HTTP).
- Injecção de contexto de follow-up no orchestrator: presente dentro das 24h, ausente depois / após `respostaEm`.

## Fora de âmbito (fases futuras)

- Follow-up para leads (agendamentos de Avaliação sem `cliente`)
- Geração da mensagem inicial por LLM (abordagem B — evolução possível sem mudar arquitectura)
- Criação automática de CompraPacote na renovação
- Quiet-hours para envios tardios
- Promoção automática Compareceu→Realizado (job nocturno)
- UI de configuração do `followUpPosSessaoAtivo` no painel
