# Próximos Passos — Lead Lifecycle + Beyond

Roadmap identificado durante a sessão de testes E2E de 2026-05-18.

## 🎯 Prioridade 1 — Migrar `lead_agent.py` para LangGraph

### Por quê

A sessão demonstrou que **prompt-only approach não escala**. Cada
cenário novo expõe um caso que o system prompt não cobriu:

- "Maria" funciona, mas o "Olá!" repete em cada turn
- "Silvia" é capturada mas o agent faz reset à mesma
- "Deys" não é capturado contextualmente sem regra explícita
- "as 9 da?" é classificado como `primeira_msg` sem regra explícita

Cada fix adiciona regras defensivas ao prompt. Eventualmente o prompt
fica > 800 linhas, o LLM ignora regras inferiores no contexto, e
introduzem-se regressões.

**LangGraph state machine** elimina esta classe de bug — cada nó
conhece a sua fase e o que falta. Transições são determinísticas.

### Design proposto

```python
# ia-service/src/ia_service/agents/lead_graph.py
from langgraph.graph import StateGraph, END

class LeadState(TypedDict):
    tenant_id: str
    lead_id: str
    nome: str | None
    motivo: str | None
    urgencia: str | None
    score: int
    history: list[dict]
    current_message: str
    reply: str | None
    next_action: str | None  # qual tool/decisão tomar

def route_after_state_check(state: LeadState) -> str:
    """Decide qual nó executar baseado no estado actual."""
    if state["next_action"] == "desistir":
        return "handle_desistir"
    if not state["nome"]:
        return "collect_name"
    if not state["motivo"]:
        return "discovery"
    if state["next_action"] == "escolher_slot":
        return "propose_or_confirm_slot"
    return "discovery"  # default — continuar descoberta

graph = StateGraph(LeadState)
graph.add_node("classify_intent", classify_node)  # corre F07 extractor
graph.add_node("collect_name", collect_name_node)
graph.add_node("discovery", discovery_node)
graph.add_node("propose_or_confirm_slot", slot_node)
graph.add_node("handle_desistir", desistir_node)
graph.add_node("send_reply", send_reply_node)

graph.set_entry_point("classify_intent")
graph.add_conditional_edges("classify_intent", route_after_state_check)

graph.add_edge("collect_name", "send_reply")
graph.add_edge("discovery", "send_reply")
graph.add_edge("propose_or_confirm_slot", "send_reply")
graph.add_edge("send_reply", END)

compiled = graph.compile()
```

### Nós explícitos

| Nó | Quando dispara | O que faz |
|---|---|---|
| `classify_intent` | Sempre primeiro | Corre F07 extractor + carrega Lead state |
| `collect_name` | `nome=None` | Resposta foca em pedir nome com naturalidade |
| `discovery` | `nome` ✓ + `motivo=None` | Explora dor / objectivo |
| `propose_or_confirm_slot` | `nome` ✓ + `motivo` ✓ + lead pediu agendar | Propõe slots via tool |
| `handle_desistir` | `intent='desistir'` | Probe objection ou fecha |
| `send_reply` | Sempre último | Persiste + envia via Evolution |

### Vantagens vs approach actual

- **Sem reset acidental** — `discovery` nó nunca diz "Olá! Em que posso
  ajudar?", só `collect_name` saúda.
- **Sem ambiguidade do extractor** — o nó só usa `intent` para detectar
  desistência ou pedido de slot, não para decidir a fase.
- **Testes determinísticos** — cada nó testável isoladamente com
  fixtures de state.
- **LangSmith tracing** — permite ver o caminho exacto do grafo em cada
  conversa real, identificando outliers.

### Estimativa

1-2 dias de trabalho focado. Adiciona dependência `langgraph` (~10MB).
Mantém `lead_agent.py` como fallback durante 1-2 semanas para A/B.

## 🎯 Prioridade 2 — Client Lifecycle Agent

Hoje o F12 route `CLIENT_LIFECYCLE_PENDING` cai em `LEGACY_FALLBACK`
greeting (stub). É o trabalho que estávamos a preparar nesta sessão de
testes Lead lifecycle.

### Design

Cliente existente vai precisar de:
- Reagendar consulta existente
- Cancelar consulta
- Marcar nova consulta (re-using preferências históricas)
- Perguntar sobre tratamento anterior (consulta `HistoricoAtendimento`)

Tools próprias do client agent (diferentes do Lead):
- `find_my_appointments(cliente_id)` — lista agendamentos próximos
- `reschedule_appointment(appointment_id, new_data, new_hora)` — atómico
- `cancel_appointment(appointment_id, motivo)`
- `find_historico(cliente_id)` — last N visits + observações
- `find_servico` — mesma do Lead (read-only)

### Arquitectura proposta

Se Prioridade 1 (LangGraph) for feita primeiro, o Client agent é outro
grafo `client_graph.py` com nós próprios:
- `intent_classifier` (reagendar / cancelar / marcar / perguntar)
- `lookup_appointments`
- `reschedule_node`
- `cancel_node`
- `new_appointment_node`
- `info_node`

O F12 router já está pronto para distinguir — passa `existingClient`
em `persistedState`. Falta o handler Python receber e despachar para
o client graph.

### Estimativa

2-3 dias se Prioridade 1 estiver feita (reuso de patterns).
3-5 dias se for feito antes do LangGraph (mais código de prompt).

## 🎯 Prioridade 3 — Avaliação automatizada (LLM-as-judge)

Para validar mudanças no agent sem ter de fazer testes manuais via
WhatsApp, criar suite de evals:

### Componentes

- **Fixtures de leads-tipo** (`tests/evals/fixtures/`):
  - `lead_preco_shopper.json` — turns + ground truth
  - `lead_urgencia_alta.json` — casamento próxima semana
  - `lead_hesitante.json` — "vou pensar"
  - `lead_desistente.json` — recusa logo
  - `lead_pt_br.json` — português brasileiro misto
  - 5+ outros

- **Runner** (`tests/evals/run_eval.py`):
  - Carrega fixture
  - Replay dos turns contra o agent local
  - Cada resposta avaliada por LLM-as-judge (gpt-4o) contra:
    - Tom apropriado?
    - Usa nome quando disponível?
    - Não saúda repetidamente?
    - Capturou intel correcto?
  - Output: relatório markdown com pass/fail por critério

### Estimativa

1 dia para skeleton + 3 fixtures iniciais. Cresce organicamente.

## 🎯 Prioridade 4 — Frontend Lead Detail polling

BUG-003 do `02-problemas-pendentes.md`. Adicionar polling 10s ao
componente `LeadDetalhe.tsx` para o thread atualizar em real-time
enquanto se observa um teste E2E.

### Estimativa

1-2h.

## 🎯 Prioridade 5 — Observabilidade do agent

Hoje só temos `structlog` no Python e `Pino` no Node. Suficiente para
debugging mas falta uma view consolidada:

- Histograma de `intent` classifications por dia
- Distribuição de `score_delta` per turn
- % turns com `agent_reply_generated` vs fallback
- Latency p50/p95 do agent end-to-end
- Token cost per turn

### Estimativa

2-3 dias. Provavelmente integrar com Sentry Performance ou
Grafana / DataDog.

## 🎯 Prioridade 6 — Phase 5 features do PRD

Ver `PRD_Marcai_CRM_Leads.md` §7:
- Birthday outreach (BullMQ)
- Notifications inbox UI
- Multi-instance Evolution per tenant
- Analytics dashboards
- `find_faq` LangChain tool
- In-app prompt editor

Estes são features de produto. Não bloqueiam.

---

## Ordem de execução sugerida

1. **Hoje / Amanhã:** BUG-003 + BUG-005 (frontend quick fixes) — 2-4h
2. **Sprint 1:** LangGraph migration do Lead agent — 1-2 dias
3. **Sprint 1 ainda:** Evals skeleton + 3 fixtures — 1 dia
4. **Sprint 2:** Client lifecycle agent — 2-3 dias
5. **Sprint 3:** Observabilidade consolidada — 2-3 dias
6. **Sprint 4+:** Phase 5 features conforme demanda

## Decisões em aberto

- **OpenAI gpt-4o-mini vs Gemini 2.5 Flash** — qual usar em produção?
  Custo OpenAI já confirmado <€0.05/lead. Gemini 2.5 Flash é gratis no
  tier free mas precisa de validar quality.
- **LangSmith ou self-hosted observability** — investimento vs custo.
- **Auto-reply pause vs full handoff** — quando profissional toma over,
  parar definitivamente ou permitir IA reactivar?
