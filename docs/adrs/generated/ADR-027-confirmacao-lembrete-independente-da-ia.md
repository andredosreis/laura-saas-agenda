# ADR-027: Confirmação de Lembrete Independente do Switch da IA

**Status:** Accepted
**Data:** 2026-06-17
**Módulo:** MESSAGING (`src/modules/messaging/routing/`)
**Autor:** André dos Reis
**Relacionado:** ADR-022 (messaging como orquestrador cross-cutting), F12 (IA↔Legacy Handoff Coordinator)

---

## Contexto

O router de mensagens (`messageRouter.decide()`, F12) decide o destino de cada mensagem WhatsApp recebida. A confirmação de lembretes (respostas **SIM/NÃO** a um agendamento pendente) é tratada pela rota `LEGACY_CONFIRMATION` → `legacyConfirmation.handle()`, que muda `status` + `confirmacao.tipo` do agendamento, grava (o hook `pre('save')` do model deriva `ocupaSlot` do status, libertando o slot em cancelamentos) e envia uma resposta determinística ao cliente.

O problema: na ordem original do `decide()`, os **guards de disponibilidade da IA** eram avaliados **antes** da rota de confirmação:

```
1. tenant/plano
2. IA service desligado (env)   → LEGACY_FALLBACK   (saudação genérica)
3. master switch da clínica off → MANUAL_SILENT     (silêncio total)
4. leads desligados
5. confirmação SIM/NÃO + pendente → LEGACY_CONFIRMATION   ← nunca alcançado se 2/3 disparassem
```

Consequência observada em produção: com a IA desligada pela Laura no inbox (`Tenant.configuracoes.iaGlobalAtiva = false` → `MANUAL_SILENT`), um cliente que respondia **SIM/NÃO** ao lembrete via a sua mensagem cair no inbox em silêncio — **o agendamento não era confirmado nem cancelado, o status não mudava e o slot não era libertado**. O mesmo acontecia com a IA desligada por env (`LEGACY_FALLBACK`).

A incoerência: os **lembretes continuam a sair** (são jobs BullMQ, independentes do switch da IA). O sistema pedia "responda SIM/NÃO" e depois ignorava a resposta.

A causa-raiz é conceptual: confirmar um lembrete é uma **máquina de estados determinística** — não precisa do LLM. Estava indevidamente acoplada ao estado de ligação da IA conversacional.

---

## Decisão

Mover a avaliação da rota de confirmação para **antes** dos guards de disponibilidade da IA, mantendo-a **depois** dos guards de tenant/plano. Nova ordem:

```
1. tenant/plano                          → IGNORE (precede tudo)
2. confirmação SIM/NÃO + pendente        → LEGACY_CONFIRMATION   ← agora aqui
3. IA service desligado (env)            → LEGACY_FALLBACK
4. master switch da clínica off          → MANUAL_SILENT
5. leads desligados                      → LEGACY_FALLBACK
6. client lifecycle / lead / default
```

Uma resposta genuína SIM/NÃO a um agendamento pendente passa a confirmar/cancelar **independentemente de a IA estar ligada ou desligada** (master switch ou env).

### Invariantes preservadas

- **Tenant/plano continuam a ter precedência** sobre a confirmação. Plano inativo → `IGNORE` (sistema desligado por faturação).
- **Proteção anti-hijack (Jasmin/Joana, 2026-05-20) intacta.** A confirmação só dispara quando `hasPendingAppointment === true`, nunca a meio de uma conversa com a IA (`iaConversationActive`), e para clientes existentes só em resposta curta (≤2 palavras). Mensagens como "ok agradeço mas vou pensar" continuam a seguir para o agente.
- **Conversas continuam silenciadas com a IA off.** O master switch (`MANUAL_SILENT`) e o env (`LEGACY_FALLBACK`) continuam a aplicar-se a **todas as mensagens que não são confirmação de lembrete**. O switch silencia o LLM, não a máquina de estados dos lembretes.

### Comportamento com a IA off (decisão de produto)

Quando a confirmação dispara com a IA off, usa-se o handler `legacyConfirmation` **completo**: atualiza o agendamento (status + slot), **responde** ao cliente ("✅ Obrigada pela confirmação…") e notifica o admin. Justificação: o lembrete que originou a resposta também foi enviado automaticamente, logo um acknowledgment determinístico é coerente — e não é o LLM a "conversar".

---

## Alternativas Consideradas

1. **Mover a confirmação só para cima do master switch (não do env).** Rejeitada — deixaria a mesma incoerência no caminho `IA_SERVICE` desligado. A confirmação é determinística em ambos os casos; tratar só um seria um bug latente.
2. **Atualizar o estado em silêncio (sem resposta ao cliente).** Considerada (respeitaria o "silêncio total" à risca), mas rejeitada pelo dono do produto: o cliente que responde SIM a um lembrete deve receber confirmação. O "silêncio" do master switch destina-se ao agente conversacional, não ao acknowledgment do lembrete.
3. **Toggle separado "confirmações automáticas" independente do master switch.** Mais flexível, mas é over-engineering para já — a regra "confirmação de lembrete é sempre determinística e independente da IA" cobre o caso real sem nova configuração.

---

## Consequências

**Positivas:**
- SIM/NÃO a lembretes confirma/cancela e liberta o slot mesmo com a IA desligada — alinhado com o facto de os lembretes continuarem a sair.
- O slot deixa de depender de o operador clicar manualmente no painel para se libertar após um cancelamento por WhatsApp.
- Sem regressão no caminho normal (IA ligada): a confirmação já era alcançada nessa ordem; só muda a posição relativa aos guards de IA.

**Negativas / a vigiar:**
- Com a IA off, o cliente passa a receber a resposta automática de confirmação. É intencional (ver Decisão), mas quebra a leitura literal de "silêncio total" do master switch — documentado aqui para evitar surpresa.

**Cobertura de testes:**
- `tests/message-router.test.js` — casos unitários: master switch off + SIM/NÃO + pendente → `LEGACY_CONFIRMATION`; free-text/sem-pendente → `MANUAL_SILENT`; env IA off + SIM + pendente → `LEGACY_CONFIRMATION`; guarda anti-hijack mid-IA.
- `tests/webhook-routing-matrix.test.js` — E2E: master switch off + SIM → `Confirmado` (slot ocupado); + NÃO → `Cancelado Pelo Cliente` (slot libertado).
