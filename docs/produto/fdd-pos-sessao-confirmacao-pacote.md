# FDD — Pós-sessão: confirmação automática, testemunho e consumo de pacote

**Status:** Proposed
**Data:** 2026-05-31
**Módulo:** MESSAGING / NOTIF / AGENDAMENTO / IA
**Autor:** André dos Reis
**Relacionado:** ADR-013 (pipeline BullMQ), FDD Conversas inbox, [[project_client_lifecycle_package_consumption]]

---

## 1. Objectivo

Automatizar o **pós-sessão** para (a) tirar à Laura o trabalho manual de marcar cada agendamento como "Realizado" e (b) capturar **feedback/testemunho** do cliente no histórico. Como efeito colateral desejado, a confirmação do cliente dispara o consumo correcto da sessão do pacote.

Duas dores resolvidas de uma vez:
1. **Laura marca "Realizado" à mão** em cada sessão (tedioso, esquece-se).
2. **As marcações da IA não consomem o pacote** — a IA não liga o agendamento à `CompraPacote`, por isso o `Realizado → usarSessao` nunca dispara para sessões marcadas pela IA.

---

## 2. Fluxo

```
Sessão marcada para [data hora]
  └─ +~1h15 → job "pos-sessao" (mesma pipeline BullMQ dos lembretes)
       └─ WhatsApp ao cliente: "Olá [nome], a sua sessão de hoje correu
          bem? Gostávamos muito da sua opinião 😊"
            ├─ "sim, foi óptimo" → marca Realizado (→ consome sessão do pacote)
            │                       + guarda feedback no histórico
            ├─ "não fui / cancelei" → marca Não Compareceu + avisa a Laura
            └─ texto livre (testemunho) → guarda no histórico do cliente
       └─ (sem resposta em X h) → fica por marcar; Laura confirma no app (fallback)
```

---

## 3. O que já existe (reaproveitar)

- **Pipeline de lembretes** (`scheduleNotifications` + `notificationWorker`, BullMQ/Redis — activo em produção): o job pós-sessão é só mais um tipo, com `delay = dataHora + 75min`.
- **`Realizado → usarSessao()`**: `agendamentoController.js:277` — ao mudar status para `Realizado` com `compraPacote` definido, decrementa a sessão. **Já consome ao realizar, como desejado.**
- **`Agendamento.compraPacote`** (ref CompraPacote) — campo já existe.
- **`HistoricoAtendimento`** — casa natural para o feedback/testemunho.

---

## 4. Lacunas a fechar

| Lacuna | O quê |
|---|---|
| Marcação da IA não liga ao pacote | `clienteInternalRoutes.js` POST cria agendamento **sem** `compraPacote` → consumo nunca dispara |
| Disponibilidade não é calculada | usa "max-1" cego em vez de `restantes − futuros que usam o pacote` |
| Sem job pós-sessão | adicionar tipo `pos-sessao` (delay = dataHora + 75min) |
| Sem handler da resposta pós-sessão | rotear "sim/não/testemunho" → marcar status + guardar feedback |
| Sem campo de feedback/testemunho | guardar em `HistoricoAtendimento` (ou campo `feedback` no Agendamento) |

---

## 5. Regras de negócio (confirmadas + a confirmar)

**Confirmado:**
- Sessão de pacote **consome ao Realizado**, não ao marcar (cancelar não gasta).
- Limite de marcações = **sessões disponíveis** no pacote (`restantes − futuros não cancelados`), **não** "max-1". Esgotado → renovação com a Laura (IA não vende avulsa nesse caso).

**A decidir (pendente da Laura/André):**
1. **Auto-Realizado pela palavra do cliente?**
   - A) Auto-marca com o "sim" (zero trabalho, confia no cliente)
   - B) Pré-marca, Laura confirma com 1 clique (mais seguro)
   - C) Auto-marca + resumo diário à Laura para corrigir
2. **Resposta negativa** ("não fui") → marcar **Não Compareceu** + alertar Laura?
3. **Timing** do follow-up: +1h15? +2h? fim do dia?
4. **Testemunho público** (marketing) → pedir **opt-in** na mensagem (GDPR). Guardar no histórico é livre.
5. **Avulsa (sem pacote)** — limite de marcações? Cancelar liberta vaga (sim).

---

## 6. Implementação (alto nível, seguir `.claude/rules/`)

### Backend
1. **`clienteInternalRoutes.js` POST /:id/agendamentos**: aceitar `compraPacote`; ligar ao agendamento; calcular `disponivel = sessoesRestantes − agendamentos futuros (não cancelados) com esse compraPacote`; rejeitar com código `pacote_esgotado` se 0 (substitui o max-1).
2. **`scheduleNotifications`**: adicionar job `pos-sessao` com `delay = dataHora + 75min`.
3. **`notificationWorker`**: handler do `pos-sessao` (envia a mensagem de follow-up).
4. **Endpoint/rota** para processar a resposta pós-sessão → set status (`Realizado` / `Não Compareceu`) + gravar feedback em `HistoricoAtendimento`.

### ia-service
5. **`tools/client_tools.py`** `get_my_packages` → expor o `_id` da CompraPacote.
6. **`create_client_appointment`** (tool + rota) → passar/ligar `compraPacote`.
7. **Handler da resposta pós-sessão** — pode ser o próprio client agent (reconhece "sim/não/opinião" referente à última sessão) OU um handler dedicado no router.

### Prompt
8. `system_client_agent.md` regra 3 (já proactiva) → usar a **disponibilidade real**.
9. Tom do pedido de opinião (PT-PT, caloroso, opcional opt-in para testemunho).

---

## 7. Fases

1. **Consumo de pacote correcto** (backend + tool: ligar compraPacote + disponibilidade). Base de tudo.
2. **Job pós-sessao** (agendar + enviar follow-up).
3. **Handler da resposta** (sim → Realizado + feedback; não → Não Compareceu + alerta).
4. **Testemunho/feedback no histórico** + (opcional) consentimento marketing.
5. **Resumo/painel à Laura** (se opção B/C).

---

## 8. Fora de âmbito
- Publicação automática de testemunhos em marketing (só com consentimento, fase futura).
- NPS/score formal (pode vir depois do feedback livre).
- Não substitui totalmente o controlo da Laura — ela mantém override no app.

---

## 9. Riscos / Notas
- **Depende do Redis/BullMQ** (activo em produção via VPS Hostinger). Sem Redis (ex: local), o job pós-sessão não dispara.
- **Confiar no cliente para Realizado** consome pacote — daí a decisão 1 (A/B/C).
- **Routing da resposta pós-sessão** tem de associar o "sim" ao agendamento certo (último realizado/recente do cliente).
- O `Realizado → usarSessao` já existe; o trabalho é **alimentá-lo** a partir da IA (ligar compraPacote) e do follow-up.
