# F04 — Slot Picking in Manual Booking · Eval Report

**Feature:** F04 (ADR-028 Fase 3) — Slot Picking na marcação manual
**Data da avaliação:** 2026-07-01
**Avaliador:** evaluator (Harness Engineering)
**Contrato:** [`contract.md`](./contract.md) · **Spec:** [`spec.md`](./spec.md) · **Plano:** [`plan.md`](./plan.md)

## Resumo

**10 passed · 0 failed · 0 indeterminate (bloqueante)**

Todos os critérios do contrato (C1–C10) foram verificados deterministicamente, com
evidência (E2E Playwright com rede mockada + screenshots). Sem alterações ao backend
(feature frontend-only), sem escrita em produção, sem dados reais criados.

> **Nota de segurança:** avaliação 100 % offline — a rede foi mockada via Playwright
> `route()` (catch-all porta 5001 + handlers por endpoint). Nenhum `POST/PUT/DELETE`
> foi enviado ao backend real; nenhum agendamento real foi criado. Servidor de dev
> isolado na porta **5183** (própria deste worktree; a 5173 está ocupada por outro).

---

## Ambiente

| Item | Valor |
|---|---|
| Frontend dev server | Vite em `http://localhost:5183` (`E2E_PORT=5183`, worktree isolado) |
| Backend | **não tocado** — F04 é frontend-only; leituras mockadas na rede |
| Runner E2E | Playwright (`chromium`), rede mockada, `timezoneId=Europe/Lisbon`, `locale=pt-PT` |
| Specs | `tests/e2e/F04-slot-picking.spec.ts` (7 testes de contrato) · `tests/e2e/F04-eval.spec.ts` (5 — evidência/C8) |

## Gates determinísticos (Harness)

| Gate | Comando | Resultado |
|---|---|---|
| Build + TSC (frontend) | `npm run build` | ✅ green (`SlotPicker.tsx` type-checks; Vite build ok) |
| ESLint (frontend) | `npm run lint` | ✅ 0 errors (6 warnings **pré-existentes** em ficheiros não tocados) |
| E2E F04 (contrato) | `playwright test F04-slot-picking.spec.ts` | ✅ 7/7 passed |
| E2E F04 (evidência + C8) | `playwright test F04-eval.spec.ts` | ✅ 5/5 passed |
| Backend lint/test | — | N/A (sem alterações a `src/` do backend — ver C9) |

---

## Verificação do contrato (C1–C10)

| # | Critério | Estado | Evidência |
|---|---|---|---|
| **C1** | Reservar escolhendo um slot (caminho `dataSelecionada` revivido) | ✅ passed | E2E `C1/C2` cria o agendamento a partir do slot escolhido (toast "Agendamento criado com sucesso" + redirect `/agendamentos`). Screenshot `01` |
| **C2** | Slots vêm de `getAvailableSlots(date, duration)` (raw `{ availableSlots }`, via `scheduleService`) | ✅ passed | Chips `livre` == conjunto devolvido pelo endpoint mockado; `getAvailableSlots` mantém `response.data.availableSlots`. E2E `C1/C2` |
| **C3** | Excepções F02 reflectidas transitivamente (`fechado` → sem slots; `horas-extra`/`horario-especial` → só janela) | ✅ passed | `fechado` → empty state (E2E `C3/C7`, screenshot `02`). Sub-caso `horas-extra`: por construção — o picker consome exactamente o output de `getAvailableSlots`, que já narrowa a janela no backend (F02, endpoint inalterado). Ver nota abaixo |
| **C4** | Distinção visual dos estados (livre/ocupado/pausa/fora, não-livres não selecionáveis) | ✅ passed | E2E `C4` afirma `data-estado` + `disabled` para os 4 estados. Screenshot `01`: 09/11/13/14/16/17 indigo, 10 vermelho riscado, 12 âmbar, 15 tracejado + legenda |
| **C5** | Forçar encaixe (admin, sem hard-block) + oculto p/ não-admin | ✅ passed | Dois testes E2E: admin vê toggle + input manual + chip ocupado torna-se selecionável; `recepcionista` não vê o toggle. Screenshot `03` |
| **C6** | Responsivo a 375px (≥44px, sem scroll horizontal, reserva completa) | ✅ passed | E2E `C6`: `boundingBox().height ≥ 44`, `scrollWidth ≤ clientWidth`, reserva concluída no telemóvel. Screenshot `04` |
| **C7** | Empty/erro degradam graciosamente | ✅ passed | Empty (`availableSlots: []`) → "Sem horários disponíveis para esta data" (não erro), screenshot `02`. Erro de rede (500) → erro inline `role=alert`, formulário continua utilizável (E2E `C7 — erro de rede`) |
| **C8** | Paridade do modal rápido + payload `dataHora` inalterado (`yyyy-MM-dd'T'HH:mm`) | ✅ passed | E2E `C8` abre o `QuickAppointmentModal` a partir do calendário, escolhe slot e afirma o payload `POST /agendamentos` `dataHora === "<data>T09:00"`. Screenshot `05` |
| **C9** | Sem alterações ao backend; shapes legados preservados | ✅ passed | `git status` só mostra `laura-saas-frontend/**` + `docs/**`; nenhum ficheiro em `src/` (backend) ou `ia-service/`. `getAvailableSlots` mantém `{ availableSlots }`; `getDiaDisponibilidade` consome o raw `{ disponibilidade, agendamentos }` |
| **C10** | `npm run build && npm run lint` verdes | ✅ passed | Build ✅ (tsc + Vite) · Lint ✅ 0 errors |

### Nota sobre C3 (sub-caso `horas-extra`/`horario-especial`)
O narrowing da janela de excepção acontece **no backend** (`getAvailableSlots`, F02),
que F04 consome sem alterar. A verificação ao vivo contra o backend real é **read-only**
por política (só existe BD de produção) — pelo que o sub-caso `horas-extra` é validado
**por construção**: o `SlotPicker` renderiza como `livre` exactamente o conjunto que o
endpoint devolve. O caso `fechado` (→ `[]` → empty state) é verificado deterministicamente
na E2E. Não há caminho em F04 que recalcule a janela no cliente, logo não pode divergir
do backend.

---

## Screenshots (evidência)

Em [`./screenshots/`](./screenshots/):

| Ficheiro | Mostra |
|---|---|
| `01-slot-grid-states.png` | Grelha com os 4 estados distintos + legenda + toggle de admin (C1/C4/C5) |
| `02-empty-state.png` | Empty state "Sem horários disponíveis para esta data" (C3/C7) |
| `03-admin-force.png` | "Forçar encaixe" activo com input de hora manual (C5) |
| `04-mobile-375.png` | Picker a 375px, chips tappáveis (C6) |
| `05-quick-modal.png` | `QuickAppointmentModal` com o `SlotPicker` (superfície escura/glass) (C8) |

---

## Alterações avaliadas

- `laura-saas-frontend/src/services/scheduleService.ts` — `getDiaDisponibilidade` + tipos (`SlotEstado`, `JanelaDia`, `DiaDisponibilidade`); `getAvailableSlots` inalterado.
- `laura-saas-frontend/src/components/SlotPicker.tsx` — **novo** componente `.tsx`.
- `laura-saas-frontend/src/pages/CriarAgendamento.jsx` — caminho `dataSelecionada` revivido; data + `SlotPicker` nos dois formulários (Sessão + Avaliação).
- `laura-saas-frontend/src/components/QuickAppointmentModal.jsx` — data + `SlotPicker`; `onSubmit` inalterado.
- `laura-saas-frontend/playwright.config.ts` — porta parametrizável (`E2E_PORT`) p/ isolar worktrees.
- `laura-saas-frontend/tests/e2e/F04-slot-picking.spec.ts` + `F04-eval.spec.ts` — **novos**.

## Observações (não bloqueantes)

- Por decisão de spec (`[Auto-Accept] D6/D8`), a página `CriarAgendamento` mantém a paleta
  legada âmbar/branco; o `SlotPicker` usa acentos do design-system (indigo/purple/slate) —
  legível em ambas as superfícies (clara e escura/glass). Restyle da página está **fora de
  âmbito**. Confirmação estética fica ao critério humano (screenshots `01`/`05`).
- `auth.login.spec.ts` falha **neste worktree** por causa do `.env` local
  (`VITE_API_URL=http://localhost:5001`, sem sufixo `/api`) — esse spec usa globs
  `**/api/auth/login` que não batem sem `/api`. É um artefacto de ambiente **pré-existente
  e não relacionado com F04** (o spec F04 é robusto: usa catch-all porta 5001 + `pathname`).

## Conclusão

Contrato **cumprido** — 10/10 critérios passed, 0 failed. Gates verdes. Feature pronta.
`PRDProgress-disponibilidade.json` → `F04.status = "done"` com link para este relatório.

---

## Correcções pós-code-review (2026-07-01)

Code review de alto esforço (8 ângulos × verificação adversarial) encontrou e corrigiu:

1. **Dupla-marcação além de +7 dias:** `getDiaDisponibilidade` derivava `ocupados` do `getSchedules` (janela hoje..+7) — numa data mais distante, reservas existentes apareciam como "fora" e um admin com forçar-encaixe podia marcar por cima. Agora as reservas do dia vêm de `GET /agendamentos?dataInicio&dataFim` (válido para qualquer data), filtradas pelo mesmo whitelist de estados do backend.
2. **Submit silencioso no QuickAppointmentModal:** o `required` nativo desapareceu com o SlotPicker e os guards faziam `return` sem feedback. Agora todos os guards mostram erro inline (`role=alert`) junto às acções.
3. **"Hora manual" vazia gerava `dataHora` malformado** (`"YYYY-MM-DDT"` truthy passava a validação): guard `data && hora` nos 3 handleSlot (sessão, avaliação, modal).

Mocks E2E actualizados (GET `/agendamentos` serve as reservas do dia). Gates re-corridos: build ✅ · lint 0 erros · Playwright F04 **12/12** + disponibilidade 6/6 (2 falhas em `auth.login.spec.ts` são pré-existentes e alheias a F04).
