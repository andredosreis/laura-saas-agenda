# FDD — Inbox de Conversas (com handoff humano da IA)

**Status:** Proposed
**Data:** 2026-05-29
**Módulo:** MESSAGING / FRONTEND
**Autor:** André dos Reis
**Relacionado:** ADR-022 (messaging cross-cutting), ADR-024 (super-admin), ADR-014/021 (Evolution/WhatsApp)

---

## 1. Objectivo

Dar um **inbox único e limpo** onde o utilizador vê e gere **todas as conversas de WhatsApp** (leads + clientes) num só sítio, e onde pode **pausar a IA e assumir** uma conversa quando quiser (handoff humano).

> **Não é funcionalidade nova.** O motor já existe (pausa da IA, resposta manual, thread, classificação/routing). Esta FDD é sobretudo **organização + UI** que dá superfície ao que o sistema já faz. O âmbito é maioritariamente **frontend + 1 endpoint consolidado + extensão da pausa aos clientes**.

Inspiração de UX: o painel de "Conversas" estilo HYPE FLOW/GoHighLevel — **mas só essa parte.** Ver §8 (fora de âmbito).

---

## 2. Princípio nuclear (o que evita confusão)

> **Um número de telemóvel = uma conversa contínua.** O que muda é o *estado* do contacto: começa **🌱 Lead** e, quando converte, passa **👤 Cliente** — a thread é a mesma, o histórico não se parte.

- **Vista unificada, motor separado.** O utilizador vê uma lista única de conversas com um selo (🌱/👤). Nos bastidores, o routing já existente decide o agente (lead vs cliente) — o utilizador não gere isso.
- Quando há conversão, o selo muda 🌱→👤 e o painel de contexto adapta-se (pipeline → pacotes/agendamentos). A conversa continua a mesma.

---

## 3. Conversão é configurável por tipo de negócio (regra crítica)

O fluxo de conversão **não é único** — depende do tenant. O inbox e a IA **não podem impor** um fluxo.

**Exemplo (Laura — estética):** a IA **não dá preços nem fecha pacotes no WhatsApp**. O seu papel com um lead é **marcar a avaliação**. A venda fecha-se **presencialmente**, e é aí que o lead vira cliente.

**Outro negócio:** pode querer que a IA dê preços, feche pacote e/ou peça sinal pelo WhatsApp.

Implicações de design:
- **Comportamento da IA** (até onde vai: só marca avaliação vs fecha venda) é governado pelo **prompt + conhecimento por tenant** (`prompts/<tenant>/`, `servicos.md`) — já configurável, não hardcoded.
- **Gatilho de conversão** (lead→cliente) é **específico do negócio**: para a Laura é uma acção humana após a avaliação, não algo que o WhatsApp fecha. O inbox **não deve** forçar conversão automática.

---

## 4. O que já existe (reaproveitar, não reconstruir)

**Backend:**
- `Lead.iaAtiva` (boolean) — pausa/retoma a IA por lead
- `messageRouter.js` — decide `MANUAL_SILENT` (IA calada) vs `IA_LEAD`/`CLIENT_LIFECYCLE`
- `POST /leads/:id/reply` — envio manual outbound (via Evolution)
- `POST /leads/:id/pause-ai` — pausar/retomar IA
- Handler `manualSilent.js` — persiste inbound sem responder

**Frontend:**
- `components/leads/ConversationThread.tsx` — thread agrupada por dia
- `components/leads/ManualReplyComposer.tsx` — input + envio + toggle "pausar IA"
- `pages/LeadDetalhe.tsx` — thread + info + composer (polling 5s)

**Dados:**
- `Conversa` (tenantId, telefone, estado, dados, ultimaInteracao)
- `Mensagem` (tenantId, telefone, mensagem, origem [cliente|laura], direcao [entrada|saida], data, conversa)

---

## 5. Lacunas a fechar

| Lacuna | Decisão |
|---|---|
| Sem inbox consolidado (só detalhe lead-a-lead) | Nova página `/conversas` (3 painéis) |
| Clientes não têm pausa de IA (`iaAtiva` só no Lead) | **Mover `iaAtiva` para a `Conversa`** — sobrevive à conversão lead→cliente (telemóvel é estável) |
| Não se distingue resposta da IA vs do humano | Adicionar metadata à `Mensagem` (ex: `geradoPor: 'ia' \| 'humano' \| 'cliente'`) |
| Routing de cliente não respeita pausa | Estender a verificação de `iaAtiva` ao ramo de cliente do router |

---

## 6. Backend (seguir `.claude/rules/`)

Regras aplicáveis: `multi-tenant.md`, `express-common-conventions.md`, `mongoose-queries.md`, `express-routes.md`.

1. **`iaAtiva` na `Conversa`** (default `true`). Router (lead **e** cliente) consulta a `Conversa` do telefone; se `false` → `MANUAL_SILENT`.
2. **`GET /conversas`** — listagem consolidada (leads + clientes) com paginação (≤100), ordenada por `ultimaInteracao` desc. Cada item: contacto, tipo (🌱/👤), última mensagem, estado da IA, contagem de não lidas. `tenantId` obrigatório em todas as queries; contrato `{ success, data, pagination }`.
3. **`GET /conversas/:id/mensagens`** — thread paginada de uma conversa.
4. **Resposta manual unificada** — generalizar `reply`/`pause-ai` para funcionar por **conversa** (não só por lead), cobrindo clientes. Reutilizar `sendWhatsAppMessage` (Evolution).
5. **Metadata** — gravar `geradoPor` nas mensagens outbound (IA vs humano).
6. Acesso cruzado entre tenants → 404. Imports ESM com `.js`.

---

## 7. Frontend (seguir `.claude/rules/react-*`)

Regras aplicáveis: `react-components.md`, `react-hooks.md` (usar `useAuth`, `api.js`; design system indigo/purple/slate, glassmorphism).

1. **Página `/conversas`** — layout 3 painéis:
   - **Esquerda:** lista de conversas (selo 🌱/👤, badge IA ligada/pausada, última mensagem). Filtro `[ Todas | 🌱 Leads | 👤 Clientes ]`.
   - **Centro:** thread (reutilizar `ConversationThread`) + composer (reutilizar `ManualReplyComposer`) + **toggle "IA ligada/pausada"** visível no topo.
   - **Direita:** contexto do contacto (pipeline para lead; pacotes/agendamentos para cliente; ações: ver perfil, agendar).
2. **Sidebar colapsável** — expandida (com texto) nas outras páginas; **recolhe automaticamente para ícones** ao entrar em `/conversas`, para libertar largura. (Decisão a validar em teste.)
3. **Lista única com selo + filtro** (não abas separadas — preserva a continuidade na conversão).
4. Polling (reutilizar o padrão de 5s do `LeadDetalhe`); realtime fica para fase posterior.

---

## 8. Fora de âmbito (anti scope-creep)

O moat do Marcai é **a IA que converte sozinha**, não ser um GoHighLevel. Por isso **NÃO** entram nesta FDD:
- Marketing, Playbooks, Formulários, Reputação, Campanhas, Pagamentos-como-módulo (o sprawl do GHL)
- Multicanal (Instagram/Email) — só depois de dominar WhatsApp+IA
- Reescrita total do frontend — esta página define o novo padrão "clean" e propaga depois, sem rewrite de uma vez

---

## 9. Fases (construir sem partir nada)

1. **Dados + routing** — `iaAtiva` na `Conversa`; router (lead + cliente) respeita; metadata `geradoPor`. Testes (incl. handoff de cliente).
2. **Endpoints** — `GET /conversas` consolidado + `GET /conversas/:id/mensagens` + reply/pause por conversa. Testes de isolamento multi-tenant.
3. **Frontend inbox** — página `/conversas` (3 painéis) reutilizando componentes; toggle de pausa.
4. **Sidebar colapsável** + polimento visual (design system).
5. (Posterior) realtime, multicanal.

---

## 10. Riscos / Notas

- **Pausa por conversa, não por lead** — garante que o handoff sobrevive à conversão lead→cliente. Migração: espelhar/mover `iaAtiva` do `Lead` para a `Conversa` (script idempotente; ver `db-migration`).
- **Conversão por vertical** (§3) — não automatizar o gatilho lead→cliente no inbox; manter configurável.
- **Caveat WhatsApp oficial** — para tráfego pago em escala, ver a decisão futura Baileys vs WhatsApp Business API (ADR a abrir). Não bloqueia esta FDD.
