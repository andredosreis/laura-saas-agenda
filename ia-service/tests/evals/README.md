# Lead-Agent Evals — Skeleton

Suite de avaliação automática do agente conversacional Python. Cada
fixture é uma **conversa real** capturada na sessão de testes E2E
(`docs/testes/ia/01-sessao-2026-05-18.md`) decomposta em turn-checkpoints
com expectativas comportamentais.

O objectivo é fechar o loop: mudaste o prompt? Corre o eval. Aparece
regressão num bug que estava resolvido? Não dá merge.

## Estrutura

```
tests/evals/
├── README.md                  # este ficheiro
├── fixtures/
│   ├── maria_happy_path.json           # conversa que terminou em agendamento
│   ├── jessica_no_repeat_greeting.json # BUG-001 — "Olá!" em cada turn
│   └── silvia_no_name_reset.json       # BUG-002 — reset ao dar o nome
├── evaluators.py              # 4 regras: no-greeting, uses-name, no-fab-slots, no-name-ask
├── target.py                  # adapter: chama make_lead_agent + extrai tool calls
└── run_eval.py                # CLI: local (default) ou --sync (LangSmith)
```

## Como correr

### Pré-requisitos

```bash
cd ia-service
./.venv/bin/pip install -e '.[dev]'        # instala langsmith>=0.2 + pytest tooling
```

`ia-service/.env` deve ter:
- `OPENAI_API_KEY` (ou `GOOGLE_API_KEY`) — para o agent invocar o LLM
- `LLM_PROVIDER=openai` ou `gemini`
- `LANGSMITH_*` (opcional — só necessário para `--sync`)

### Modo local (rápido, sem rede LangSmith)

Corre todos os fixtures, mostra pass/fail por evaluator, exit code != 0
se algum check falhar (CI-friendly):

```bash
cd ia-service
./.venv/bin/python -m tests.evals.run_eval
```

Filtrar a um fixture:

```bash
./.venv/bin/python -m tests.evals.run_eval --fixture maria
./.venv/bin/python -m tests.evals.run_eval --fixture silvia
```

Output exemplo:

```
→ Running 8 example(s) offline
  Evaluators: ['no_greeting_when_turn_gt_0', 'uses_lead_name_when_known',
               'no_slot_fabrication', 'no_redundant_name_ask']

  [maria_happy_path::t2_lead_describes_pain_lower_back]
      ✓ no_greeting_when_turn_gt_0
      ✓ uses_lead_name_when_known
      ✓ no_slot_fabrication
      ✓ no_redundant_name_ask
      reply: 'Compreendo, Maria. Lombar é uma queixa frequente...'

→ Summary: 30 pass / 2 fail / 0 n/a (of 32 checks across 8 examples)
```

### Modo LangSmith sync

Cria/atualiza o dataset **`marcai-lead-agent`** na conta LangSmith
(autenticação via `LANGSMITH_API_KEY` do `.env`) e corre uma experiência
versionada. Cada run aparece em **Projects → marcai-ia-service-local →
Experiments**, com diff vs experiências anteriores:

```bash
./.venv/bin/python -m tests.evals.run_eval --sync
```

O dataset fica visível e editável na UI — útil para a equipa adicionar
casos sem mexer no código.

## Adicionar fixture nova

1. Identifica uma conversa real (de WhatsApp / log do `ia-service`) que
   queres garantir que não regride.
2. Cria `fixtures/<slug>.json` com este shape:

   ```json
   {
     "name": "<slug>",
     "description": "<o que estás a validar>",
     "examples": [
       {
         "name": "t0_<descricao_do_turn>",
         "inputs": {
           "tenant_id": "695413fb6ce936a9097af750",
           "lead_id": null,
           "history": [{"role": "user|assistant", "content": "..."}],
           "current_message": "...",
           "lead_state": {"nome": "", "motivo": "", "urgencia": "", "score": 0},
           "turn_number": 0,
           "last_clinic_message": ""
         },
         "outputs": {
           "must_not_start_with_greeting_word": true,
           "must_contain_name": "Maria",
           "must_not_fabricate_slots": true,
           "must_ask_for_name": false,
           "notes": "..."
         }
       }
     ]
   }
   ```

3. Corre `--sync` para enviar para o LangSmith.

### Expectations disponíveis

| Flag | Tipo | Significado |
|---|---|---|
| `must_not_start_with_greeting_word` | bool | Resposta NÃO pode começar com Olá/Bom dia/Boa tarde/Boa noite/Bem-vindo/Que bom |
| `must_contain_name` | str \| null | Resposta DEVE conter este nome literal |
| `must_not_fabricate_slots` | bool | Se resposta cita HH:MM, agent tem de ter chamado `get_available_slots` |
| `must_ask_for_name` | bool | Se `false`, resposta não pode conter "seu nome?", "como te chamas?", etc. |

Adiciona novos checks em `evaluators.py` + entrada em `ALL_EVALUATORS`.

## Como o offline mode evita o MongoDB

Em produção, o agent pode chamar `get_available_slots`, que vai à DB
buscar a agenda real. Para correr o eval sem rede, `target.py`
monkey-patcha `mongo_reader.find_available_slots` com 8 slots fictícios
distribuídos em dois dias — basta para o agent demonstrar comportamento
sem precisar de Mongo.

`lead_id` é sempre `null` nos fixtures, por isso as tools que escrevem
no backend Marcai (`update_lead_info`, `qualify_lead`, `move_lead_stage`,
`create_appointment`) **não são sequer expostas** ao agent — não há
risco de tocar em produção a partir do eval.

## Limitações conhecidas

- **Não testa o extractor F07 (`lead_extractor.py`)** — só o agent
  conversacional. Para evals do extractor (intent, score_delta,
  captura de nome), criar um runner gémeo em `tests/evals/extractor/`.
- **Não testa LangGraph** porque ainda não existe — quando a migração
  do `04-proximos-passos.md` acontecer, o `target.py` é o único ponto
  que precisa de mudar.
- **Não substitui testes manuais via WhatsApp real.** Captura
  regressões previsíveis (greeting, nome, slot fab); não captura
  todos os modos de falha emergente.
