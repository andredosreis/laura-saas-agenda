# Fase A — Grelha de slots com intervalo de arrumação (ancorada nos agendamentos reais)

- **Data:** 2026-07-02
- **Branch:** `feat/disponibilidade-intervalo-arrumacao` (a partir de `main`)
- **Contexto:** ADR-028 (disponibilidade unificada painel + IA)
- **Estado:** design aprovado no essencial; pendente de escrita do plano de implementação
- **Autor da regra de negócio:** André (dono do produto), a validar detalhes finos com a Laura

---

## 1. Motivação

Cada sessão dura ~60 min, mas a Laura precisa de **~15 min para arrumar a sala** antes de
atender a pessoa seguinte. Hoje o sistema propõe/aceita marcações **hora a hora, sem
intervalo**. Queremos que a disponibilidade passe a reservar esses 15 min de arrumação
entre sessões consecutivas.

Exemplo pretendido (tarde, fecho às 20:00):

```
13:00–14:00 · 14:15–15:15 · 15:30–16:30 · 16:45–17:45 · 18:00–19:00 · 19:15–20:15
```

Cada início está a 75 min do anterior (60 de sessão + 15 de arrumação).

## 2. Estado atual (verificado)

- A **fonte única** de disponibilidade é `resolveAvailableSlots()` em
  `src/controllers/scheduleController.js`. Alimenta **três** consumidores:
  - a **IA** (via `GET /api/internal/disponibilidade` → `mongo_reader.find_available_slots`);
  - o **painel admin** e o **PWA** (via `GET /api/schedules/available-slots`).
- Hoje gera slots **hora a hora**: `for (t = start; t < end; t += duração)` e
  descarta os que colidem com a pausa, com agendamentos ocupados, ou que ultrapassam o fecho.
- A janela de trabalho vem do modelo `Schedule` (por dia da semana) + `ScheduleException`
  (por data). **Não** vem do prompt: `agent_business_rules.py` está **deprecado** (F03).

## 3. Descobertas dos dados de produção (2026-07-02, só-leitura)

Amostra: 230 agendamentos (últimos 120 dias + futuros) do tenant da Laura
(`695413fb6ce936a9097af750`).

- **Config real (`Schedule`):** Seg–Sex **09:00–20:00** (pausa 12:00–13:00), Sáb 09:00–13:00,
  Dom fechado. O prompt deprecado dizia 09:00–**19:00** → desalinhado.
- **Realidade das marcações:** de **~07:00 a ~20:30**; `19:30` aparece quase todos os dias.
- **Cadência real:** hora-a-hora (gap de 60 min) **57×** vs. com 15 min de folga (75 min)
  apenas **10×** → a regra dos 15 min hoje **não** é aplicada de forma consistente.
- **Conclusão:** a Laura marca a horas variadas e usa o painel como escape manual. A grelha
  nova é a **referência que a IA propõe**; a Laura mantém liberdade total no painel.

> Decisão de produto (André): **o que vale é a disponibilidade (`Schedule`)** — é o que a
> Laura configura e o que a IA usa como referência. As marcações "fora da grelha" são o
> escape manual dela e apenas **ocupam** espaço; a IA nunca propõe por cima delas.

## 4. Âmbito

### Nesta fase (A)
- Reservar 15 min de arrumação entre sessões no cálculo de disponibilidade.
- **Ancorar o cálculo nos agendamentos reais** do dia (não numa grelha teórica fixa).
- Tornar o intervalo **configurável por tenant** (default 0 → zero regressão nas outras clínicas).
- Reservar sessão + arrumação também para **marcações manuais** (deteção de conflito no booking).

### Fora desta fase → **Fase B** (design próprio)
- A sessão que **come a pausa de almoço** (ex.: 11:30–12:30) e a **sessão extra que
  ultrapassa o fecho** — ambas passam a exigir **perguntar à Laura por WhatsApp e esperar
  decisão** (fluxo assíncrono human-in-the-loop). Na Fase A **não** são oferecidas
  automaticamente.

## 5. Princípio central — ancorar na realidade

Cada sessão **ocupa o seu tempo + 15 min de arrumação a seguir**. A IA preenche os buracos
reais do dia: arranca no início de cada espaço livre e encaixa sessões de 60 min separadas
por 15, medindo sempre a partir do **que está mesmo marcado** — não de uma grelha imaginária.

Os "pontos de arranque" de um espaço livre são:
- o **início de um bloco de trabalho** (abertura, ou fim da pausa), ou
- o **fim + 15 min de uma marcação existente**.

**Exemplo (caso real do André):** marcações às **20:30** e **21:45**.
- 20:30 ocupa 20:30–21:30 **+ arrumação até 21:45**
- 21:45 ocupa 21:45–22:45 **+ arrumação até 23:00**
- → próximo livre real: **23:00**
- antes das 20:30, a última sessão possível termina às 20:15 (deixa 15 min) → começa **19:15**

## 6. Algoritmo (Fase A)

Entrada: `Schedule` do dia (+ `ScheduleException`), agendamentos reais do dia, `duração`
(default 60), `intervalo` (default 0).

```
1. Determinar janela(s) de trabalho para a data:
   - fechado (exceção "fechado" ou dia inativo)         → sem slots
   - se há pausa dentro da janela → DOIS blocos:
        manhã = [abertura, início-pausa]
        tarde = [fim-pausa, fecho]
     senão → UM bloco [abertura, fecho]

2. Reservas ocupadas = agendamentos (status Agendado/Confirmado) do dia,
   cada um como [início, início + duração + intervalo]   (arrumação a seguir).

3. Para cada bloco [B_ini, B_fim]:
     cursor = B_ini
     enquanto cursor + duração <= B_fim:
       - se cursor cai dentro de uma reserva ocupada → saltar para o fim dessa reserva; continuar
       - candidato = [cursor, cursor + duração]
       - se candidato NÃO colide com reserva ocupada
             e (não é hoje  OU  cursor > agora):
           emitir slot(cursor)
           cursor += duração + intervalo      # cadência ancorada neste ponto
         senão:
           cursor = próximo limite relevante (fim da reserva que bloqueia)

4. Limites do bloco: um slot só entra se terminar até ao limite do bloco
   (`slotEnd <= B_fim`, onde `B_fim` é o início da pausa OU o fecho). NÃO há lógica
   automática de "encostar" nem de "ultrapassar" o limite. O encaixe fino do fim de cada
   bloco controla-se AJUSTANDO a janela no painel (ex: pôr o fecho a 20:15 faz o slot
   19:15→20:15 caber). Vale igual para a pausa de almoço e para o fecho.
```

**Notas de implementação**
- `duração` e `intervalo` são somados **só na cadência e na reserva** — a sessão em si
  continua a ocupar `duração` minutos.
- Com `intervalo = 0`, o passo volta a ser `duração` e o resultado é **idêntico ao atual**.

## 7. Componentes

1. **Config nova** — `Tenant.configuracoes.intervaloEntreSessoes: { type: Number, default: 0 }`
   (minutos), ao lado de `duracaoSessaoPadrao`. Laura = 15. Propagado a `resolveAvailableSlots`.
2. **Núcleo** — reescrever a geração de slots dentro de `resolveAvailableSlots()`
   (`scheduleController.js`) para o algoritmo da §6. Continua a ser função pura → testável.
   Ler `intervaloEntreSessoes` do `Tenant` e passá-lo ao helper (o endpoint interno e o
   `getAvailableSlots` já resolvem o tenant).
3. **Conflito no booking** — ao criar/reagendar (IA **e** painel), a validação de
   sobreposição passa a considerar `duração + intervalo` (reserva a arrumação). Cobre o
   caminho interno de clientes (`clienteInternalRoutes.js`) e o do painel
   (`agendamentoController.js`). Alinha com o índice único parcial por `dataHora`.
4. **Fonte única / sem regressão** — como o helper alimenta IA + painel + PWA, todos passam
   a ver a mesma grelha. `intervalo = 0` para os outros tenants → nenhum notará diferença.
5. **Observabilidade (pedido do André)** — a janela vem sempre do `Schedule`, por isso
   ajustar no painel (ex.: fecho 20:00 → 20:15) reflete-se **de imediato** nos slots. Não há
   cache no cálculo. Adicionar log estruturado dos slots calculados por dia (nº de slots,
   janela, intervalo) para se poder observar o efeito de cada ajuste.

## 8. Decisões confirmadas

- **(i)** Fim de bloco por **ajuste da janela**, não por lógica automática. ✅ (André,
  2026-07-02). Descoberta ao detalhar: "encostar" uma sessão extra ao fecho colidiria com os
  15 min de arrumação da sessão anterior — "respeitar 15 min desde o início" e "encostar ao
  fecho" não coexistem a menos que a janela seja múltiplo de 75. Resolução: a grelha nunca
  ultrapassa o limite do bloco; a Laura controla onde a última sessão cai ajustando a
  pausa/fecho no painel (ex: fecho 20:15 → cabe 19:15). Igual para almoço e fecho. Filosofia:
  **"nada engessado"** — horários flexíveis, controlados pela config, não por regras rígidas.
- **(ii)** A sessão no almoço e a sessão além do fecho são **só Fase B** (perguntar à Laura),
  nunca automáticas. ✅
- **Fonte de verdade** = `Schedule` (painel); prompt deprecado ignorado. ✅

## 9. Testes (função pura → unitários)

Cenários mínimos:
- dia vazio → cadência limpa a partir da abertura (com pausa a dividir em dois blocos);
- marcações **alinhadas** à grelha → slots restantes corretos;
- marcações **a horas soltas** (caso 20:30 / 21:45) → ancoragem correta, próximo livre 23:00;
- pausa de almoço → nenhum slot invade a pausa; blocos manhã/tarde independentes;
- fecho → "encostar ao fecho" (decisão i) gera a última sessão quando cabe;
- `intervalo = 0` → **resultado idêntico ao atual** (guarda de regressão);
- "hoje" → não propõe horas já passadas.

Testes de integração: `GET /api/internal/disponibilidade` e `GET /api/schedules/available-slots`
devolvem a mesma grelha (paridade da fonte única) para o mesmo tenant/dia/duração.

## 10. Riscos e mitigações

- 🟡 **Transição** — marcações antigas hora-a-hora podem, com a arrumação, bloquear slots da
  grelha nova nos próximos dias. Mitigado por: intervalo por-tenant (só Laura) + ancoragem na
  realidade (a IA propõe o que sobra, sem "corrigir" o passado).
- 🟡 **Fonte única** — erro no cálculo afeta IA + painel + PWA. Mitigado por: `intervalo = 0`
  default (outros tenants intactos) + testes de regressão + função pura.
- 🟡 **Duração dos agendamentos existentes** — o `Agendamento` não guarda duração própria;
  assume-se a `duração` do pedido (60). Se existirem sessões de outra duração, a arrumação
  pode ficar sub/sobre-estimada. Aceite para Fase A; reavaliar se surgirem serviços com
  durações diferentes.

## 11. Fora de âmbito (explicitamente)

- Fluxo de perguntar à Laura / esperar resposta (Fase B).
- A "parte comentada" (a IA validar sempre disponibilidade + agendamento) — adiada por decisão
  do André.
- Atualizar o horário real da Laura no `Schedule` (09–20 vs 07–20:30) — decisão dela, feita no
  painel; não é código.
- Limpar a config incoerente de Sábado (pausa 14:00–14:30 com fecho às 13:00) — arrumação à
  parte, quando ela mexer no painel.
