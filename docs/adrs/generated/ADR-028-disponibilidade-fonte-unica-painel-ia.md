# ADR-028: Disponibilidade como Fonte Única de Verdade (Painel + IA)

**Status:** Proposed
**Data:** 2026-06-18
**Módulo:** AGENDAMENTO (backend `src/`) + IA (`ia-service/`) — cross-cutting
**Autor:** André dos Reis (proposta)
**Relacionado:** ADR-011 (modular monolith), ADR-022 (messaging orquestrador), subsistema `Schedule` + `agent_business_rules.py`

> Esta ADR **propõe** um desenho. Não há implementação associada — fica registada para decisão futura.

---

## Contexto

A "disponibilidade" (horário em que o salão aceita marcações) existe hoje em **dois sítios independentes que não se falam**:

| Fonte | Onde | Estado | Quem usa |
|---|---|---|---|
| Model `Schedule` (Mongo) + página `Disponibilidade.tsx` + API `/schedules` | backend | **inerte** — tem UI funcional mas nada o lê | ninguém |
| `agent_business_rules.py` — `RULES_PER_TENANT` (semana) + `DATE_OVERRIDES_PER_TENANT` (datas) | ia-service (Python, **hardcoded**) | **activo** | a IA, ao propor horários ao cliente |

Estado detalhado do subsistema `Schedule`:
- ✅ Model `Schedule` (dia da semana, activo, início/fim, pausa).
- ✅ API `/schedules` montada (`getSchedules`, `updateSchedule`, `getAvailableSlots`).
- ✅ `getAvailableSlots` calcula slots livres respeitando horário + pausa + marcações existentes.
- ✅ Página `Disponibilidade.tsx` funcional (lê e grava horários).
- ❌ Link na navbar **comentado** (`Navbar.jsx`) — página órfã.
- ❌ Picking de slots no `CriarAgendamento` é **código morto** (`dataSelecionada` nunca é setado).
- ❌ Enforcement no `createAgendamento` **comentado** (agendamentos livres, sem validação de expediente).

**Consequências do estado actual:**
1. Para mudar os horários que **a IA oferece**, é preciso **editar código Python e fazer rebuild do ia-service** — não há self-service.
2. A página de Disponibilidade dá a ilusão de configurar algo que não tem efeito nenhum.
3. Risco de incoerência: a IA pode propor um horário que o painel marcaria fora de horas (e vice-versa), porque as duas fontes podem divergir.

---

## Decisão (proposta)

Adoptar **uma fonte única de verdade para a disponibilidade**: o model `Schedule` (Mongo), editável pela UI de Disponibilidade, **lido por todos os consumidores** — a marcação manual no painel **e** a IA.

### Princípios

1. **Uma fonte, vários leitores.** A Laura define a disponibilidade uma vez no painel; o painel e a IA leem a mesma coisa. Eliminar o `agent_business_rules.py` hardcoded como fonte.
2. **Self-service e ao vivo.** Mudanças de horário aplicam-se sem editar código nem rebuild do ia-service.
3. **Coerência garantida.** A IA nunca propõe um slot que o backend rejeitaria — ambos usam a mesma lógica/fonte.
4. **Não destrutivo / faseado.** Cada fase entrega valor isolado e é reversível. Começar sem enforcement (permissivo), endurecer só no fim.
5. **Reutilizar o que existe.** `getAvailableSlots` (backend) e `find_available_slots` (IA) já calculam slots — o trabalho é **unificar a fonte de dados**, não reescrever o cálculo.

### Estratégia de enforcement

A disponibilidade deve começar como **assistente de escolha**, não como bloqueio rígido. Na primeira fase útil, o painel deve sugerir slots livres, destacar horários ocupados/fora do expediente e avisar quando a marcação sair da regra configurada, mas ainda permitir que um utilizador autorizado force um encaixe.

Só depois de a UI, a IA e o backend estarem a ler a mesma fonte de verdade é que faz sentido transformar a disponibilidade numa **regra obrigatória**, sempre com override explícito para casos reais de operação, como encaixes, horários especiais e decisões manuais da clínica.

### Faseamento proposto

- **Fase 0 — Reexpor a UI.** Religar o link da Disponibilidade na navbar. A Laura passa a poder definir o horário semanal. Sem enforcement.
- **Fase 1 — Excepções por data.** Adicionar ao model + UI excepções específicas (fechar dia X, horas extra no dia Y). Substitui o `DATE_OVERRIDES_PER_TENANT`. Cobre "a profissional precisa de indicar os dias dela manualmente".
- **Fase 2 — A IA lê o `Schedule` (o grande ganho).** Apontar o `find_available_slots` da IA ao `Schedule` no Mongo (em vez do `agent_business_rules.py`). Mudanças no painel fluem para a IA ao vivo.
- **Fase 3 — Slots na marcação manual.** Ligar `CriarAgendamento`/`QuickAppointmentModal` ao `getAvailableSlots` (substituir o input livre de data/hora por escolha de slots).
- **Fase 4 (opcional) — Enforcement no backend.** Reactivar a validação no `createAgendamento`, com **override** para encaixes (ex: admin força fora de horas).

---

## Alternativas Consideradas

1. **Manter dois sistemas (status quo).** Rejeitada — obriga a editar Python + rebuild para qualquer mudança de horário, e arrisca incoerência IA↔painel.
2. **A IA continua dona da disponibilidade; o painel lê do `agent_business_rules.py`.** Rejeitada — mantém a config em código (sem self-service) e inverte a responsabilidade (regras de negócio do salão deviam estar nos dados, não no microserviço de IA).
3. **Fonte única no ia-service (expor a config da IA por API).** Rejeitada — a disponibilidade é um conceito de negócio do salão, não da IA; pertence ao backend/DB onde já vive o `Schedule` e a UI.

---

## Consequências

**Positivas:**
- Laura autónoma: define horários e excepções sem código nem deploy.
- IA fiável: propõe sempre slots reais e coerentes com o painel.
- Base sólida para a marcação automática via WhatsApp (o caso de uso central do produto).

**Negativas / a vigiar:**
- **Por profissional:** o `Schedule` é por tenant (assume 1 profissional). Multi-profissional exige estender o model — fora do âmbito da v1.
- Migração: as regras hoje em `RULES_PER_TENANT`/`DATE_OVERRIDES_PER_TENANT` precisam de ser passadas para o `Schedule` do tenant (one-off).
- Acoplamento ia-service→backend: a IA passa a depender de uma leitura do Schedule (endpoint ou Mongo directo). Definir o contrato na fase 2.

**Recomendação de prioridade:** o maior valor está na **Fase 2** (a IA ler a disponibilidade do painel). As fases 3–4 são bónus de UX/robustez. Abrir com este ADR aceite antes de implementar.

---

## Notas de UI (página `Disponibilidade.tsx`)

A página actual é uma grelha semanal colorida (verde=livre, indigo=marcado, vermelho=pausa, cinza=fechado) com legenda e modal de edição por dia. A base visual é razoável e segue o design system. Pontos a melhorar quando o subsistema for reaberto (por prioridade):

1. **🔴 Clareza recorrente-vs-data (o mais importante).** A página mostra-se como uma "semana específica" (datas, navegação entre semanas), mas editar um dia muda **todas** as ocorrências desse dia da semana. É enganador. Separar visualmente **"Horário base"** (repete toda a semana) de **"Excepções desta data"** (fechar/abrir um dia específico). Liga directamente à **Fase 1** (excepções por data).
2. **Configuração mais rápida.** Editar 7 dias um a um via modal é lento. Adicionar **"copiar para os outros dias / dias úteis"**. (Fase 0/1)
3. **Janela de horas dinâmica.** O range visível está hardcoded a 08:00–19:30 (`timeSlots`). Derivar do horário real (menor início / maior fim) ou tornar configurável. (Fase 0/1)
4. **Agendamentos com duração real.** Um card de agendamento ocupa só uma célula de 30 min mesmo sendo de 60 min — devia esticar pela duração. (Fase 3)
5. **Mobile.** A grelha 8 colunas × 24 linhas é dura no telemóvel (e isto é uma PWA usada no telemóvel). Vista dia-a-dia (accordion) em ecrã pequeno.
6. **Estado vazio / onboarding.** Sem horários configurados a grelha fica toda cinza sem orientação — adicionar um CTA "Define o teu horário" no primeiro uso. (Fase 0)
7. **Consistência com o shell da app.** A página monta o seu próprio fundo full-screen e `max-w-[1600px]` (feita à parte) — confirmar que assenta bem dentro do `ProtectedLayout` como as outras páginas.

> Estas notas só fazem sentido executar com as fases acima a andar — polir um ecrã que hoje não tem efeito nenhum seria esforço perdido.
