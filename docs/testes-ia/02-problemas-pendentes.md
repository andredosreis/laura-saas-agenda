# Problemas Pendentes — Lead Lifecycle Agent

Bugs que **continuam activos** depois da sessão de 2026-05-18, com
severidade e proposta de resolução.

## 🔴 BUG-001 — Agent diz "Olá!" em cada mensagem (saudação repetida)

### Sintoma

```
Turn 1: "ola tudo bem?"  →  "Olá! Tudo bem... E consigo?"           ✅ OK
Turn 2: "vi anuncio"     →  "Olá! 😊 Que bom que nos encontrou!"   ❌ "Olá!" repetido
Turn 3: "quais serviços?"→  "Olá! 😊 Trabalhamos com..."           ❌ "Olá!" repetido
Turn 4: "Silvia"         →  "Olá! 😊 Em que posso ajudar?"         ❌ Reset total
```

### Causa raiz

Mesmo com `Lead.nome="Silvia"` populado e regra 6 do system prompt
("Saudações — só UMA vez por conversa"), o LLM continua a saudar.
Provável razão: o agent é stateless por invocação — vê a current message
como independente e reage a ela como se fosse início.

### Severidade

🔴 **Alta**. UX terrível — sente-se robótico. Quebra a ilusão humana.

### Proposta de fix

- **Quick fix (1-2h):** reescrever a regra 6 com exemplos negativos
  ainda mais agressivos e injectar uma variável `{{turn_number}}` no
  system prompt — se `turn_number > 1`, banir explicitamente "Olá!" /
  "Bom dia!" / "Boa tarde!" no início da resposta.

- **Solução real (1-2 dias):** **LangGraph state machine**. Cada nó
  do grafo conhece a sua fase. O nó `discovery`, `propose_slot`,
  `confirm_booking` nunca saúdam. Só o nó `entry`/`onboarding` saúda.
  Resolve estruturalmente.

## 🔴 BUG-002 — Agent faz reset quando lead responde só com o nome

### Sintoma

```
Laura: "Posso saber o seu primeiro nome?"
Andre: "Silvia"
Laura: "Olá! 😊 Em que posso ajudar?"   ← deveria ser "Olá Silvia! ..."
```

### Causa raiz

Apesar do extractor capturar `nome="Silvia"` e do system prompt receber
`{{lead_nome}}=Silvia`, o agent não usa essa info na geração da resposta.
O LLM tratou a mensagem isolada `"Silvia"` como entrada nova e fez reset
para o onboarding pattern.

### Severidade

🔴 **Alta**. Anula o esforço do user de fornecer o nome — sente-se
ignorado. Quebra a sequência de descoberta.

### Proposta de fix

- **Quick fix:** adicionar no system prompt regra explícita — *"Se a
  mensagem do user é APENAS uma palavra que coincide com `{{lead_nome}}`
  (ex: lead disse 'Silvia' e `Lead.nome=Silvia`), reconhece como
  confirmação do nome — responde com 'Olá {{lead_nome}}! [próxima
  pergunta]' e CONTINUA a conversa. NÃO faças reset."*

- **Solução real:** LangGraph. Nó `collect_name` valida a resposta e
  transiciona para `discovery` — sem ambiguidade.

## 🟡 BUG-003 — Frontend Lead Detail não actualiza thread em tempo real

### Sintoma

Ao abrir um Lead no Kanban e ver o detalhe (mensagens), as mensagens
novas que chegam por WhatsApp **não aparecem** automaticamente. É
preciso fazer F5 (refresh).

### Severidade

🟡 **Média**. Útil para a profissional acompanhar a IA em tempo real.
Não bloqueia o agent funcionar.

### Proposta de fix

Adicionar polling 10s no componente `LeadDetalhe.tsx` para refrescar
o thread (`GET /api/leads/:id`). Spec PRD F03 §6.2 já promete isto
("polling 10s no Kanban activo") — só falta implementar no detail panel.

Ou usar SSE / WebSocket para push em vez de polling. Out of scope para v1.

## 🟡 BUG-004 — Agent escolhe slot "Terça dia 19" sem confirmar disponibilidade real

### Sintoma

Conversa "Maria":
```
Andre: "essa semana quais dias?"
Laura: "Terça-feira, dia 19. Horários: 09:00, 11:00, 13:00, 14:00,
        15:00, 16:00, 17:00"
```

Agent propõe **8 slots** sem chamar tool `get_available_slots` para
verificar disponibilidade real. Pode propor slots já ocupados.

### Severidade

🟡 **Média**. Risco de double-booking visível ao lead (mas GAP-01 fix
do PRD §7.1 — partial unique index — protege a nível DB).

### Proposta de fix

Forçar via prompt que o agent **DEVE** chamar `get_available_slots`
antes de listar horários. Adicionar regra: *"Nunca inventes slots. Se
o lead pede horários, chama get_available_slots PRIMEIRO."*

## 🟢 BUG-005 — Lead.nome não atualiza no Kanban frontend em tempo real

### Sintoma

Quando o agent captura o nome, o card no Kanban continua a mostrar
"Sem nome" até o user fazer refresh manual.

### Severidade

🟢 **Baixa**. Polling 10s do Kanban já existe segundo PRD F02 §6.1,
mas talvez a página `Leads.tsx` não esteja a re-render correctamente.

### Proposta de fix

Verificar implementação real do polling em `LeadsKanban.tsx`. Garantir
que após `fetch /api/leads` o `setLeads(...)` é chamado e o React
re-renderiza com os novos dados.

## Estratégia de resolução proposta

### Curto prazo (sprint 1 — manter Marcai a funcionar)

1. BUG-004 (forçar `get_available_slots`) — fix de prompt, 30min.
2. BUG-003 (polling no Lead Detail) — 1-2h frontend.
3. BUG-005 (Kanban refresh) — verificar e corrigir, 1-2h.

### Médio prazo (sprint 2 — fixar comportamento conversacional)

4. **Migração para LangGraph** — resolve BUG-001 + BUG-002
   estruturalmente. Estimativa 1-2 dias. Ver `04-proximos-passos.md`.

### Longo prazo

5. Client lifecycle — agent simétrico para clientes existentes
   (matrix rows 4-5 do PRD §1.1).
6. Avaliação automatizada com LLM-as-judge — fixtures + ground truth.
7. Multi-instance Evolution per tenant (PRD §7 Phase 5).
