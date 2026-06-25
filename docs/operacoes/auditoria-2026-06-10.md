# Auditoria Completa Marcai — 2026-06-10

Auditoria de segurança (backend + frontend), qualidade dos prompts do microserviço de IA, e qualidade visual/UX. Inclui o registo das correcções aplicadas nesta sessão e o roadmap do que ficou por fazer.

**Metodologia:** 3 análises exaustivas em paralelo (backend Node, frontend React, ia-service Python) + verificação manual de todos os findings críticos antes de corrigir.

---

## 1. Sumário executivo

| Área | Nota | Estado |
|---|---|---|
| Backend (segurança) | 7/10 → **9/10** após correcções | Isolamento multi-tenant sólido; críticos corrigidos nesta sessão |
| Frontend (segurança) | 7/10 | Tokens bem geridos via AuthContext; risco residual: localStorage + console.logs |
| Frontend (visual/UX) | 8/10 | Design system 100% consistente; problemas: páginas gigantes, `window.confirm()` |
| IA — prompts | 7/10 → **9/10** após correcções | Prompts muito bem trabalhados; multi-tenancy estava quebrada (corrigida) |
| IA — arquitectura | 8/10 | Graceful degrade, tools com tenant em closure, LangSmith; faltava validação cruzada (corrigida) |
| Limpeza de código | 6/10 | 51 ficheiros duplicados " 2" no git, console.logs, código morto |

**Os 3 problemas mais graves encontrados (todos corrigidos hoje):**
1. Fallbacks JWT hardcoded — permitiam forjar tokens se as env vars faltassem.
2. Identidade "L.A. Estética/Laura" hardcoded nos prompts da IA — qualquer novo tenant responderia como a Laura (bloqueava a venda a um 2.º cliente).
3. Token interno do ia-service com default `dev-token-change-in-production`.

---

## 2. Correcções aplicadas nesta sessão

### Backend Node (`src/`)

| # | Correcção | Ficheiros |
|---|---|---|
| A1 | **JWT fail-fast** — removidos os 4 fallbacks hardcoded (`'your-super-secret-key-change-in-production'`); o servidor agora aborta no arranque se `JWT_SECRET`/`JWT_REFRESH_SECRET` faltarem | `src/middlewares/auth.js:28,285`, `src/modules/auth/authController.js:11-12`, `src/server.js` (validação de startup) |
| A2 | **Webhook timing-safe** — comparação de token com `crypto.timingSafeEqual` (antes era `!==`, vulnerável a timing attack); recusa também quando o secret não está configurado | `src/middlewares/webhookAuth.js` |
| A3 | **Mass assignment eliminado** — campos explícitos em vez de `...req.body`/`req.body` directo no Model | `src/modules/financeiro/pacoteController.js` (create + update), `src/modules/historico/historicoAtendimentoController.js` (create com whitelist de 21 campos; update com campos protegidos `profissional`, `podeEditar` + validação de tenant do `agendamento`) |
| A4 | **Rate limit no refresh** — `refreshLimiter` (30 req/15 min) aplicado a `POST /api/auth/refresh` (antes sem limite — brute force possível) | `src/middlewares/rateLimiter.js`, `src/modules/auth/authRoutes.js` |
| A5 | **`error.message` removido de ~75 respostas HTTP 500** — detalhes internos (paths, queries, nomes de collections) já não vazam ao cliente; os logs completos mantêm-se no servidor | `agendamentoController`, `caixaController`, `compraPacoteController`, `transacaoController`, `pagamentoController`, `analyticsController`, `dashboardController`, `scheduleController`, `historicoAtendimentoController`, `whatsappController`, `migrationController`, `agenteController` |

Mantidos intencionalmente: erros de negócio controlados com `err.statusCode` (leads/clientes internal routes — mensagens desenhadas para o consumidor) e o 400 de `usarSessao` (mensagem de validação do próprio model).

### ia-service Python

| # | Correcção | Ficheiros |
|---|---|---|
| B1 | **Token interno obrigatório** — removido o default `"dev-token-change-in-production"`; o serviço não arranca sem `INTERNAL_SERVICE_TOKEN` | `ia-service/src/ia_service/config.py` |
| B2 | **Validação cruzada tenant** — quando o Node envia `lead_id`/`cliente_id`, o orchestrator confirma que o documento existe na DB *desse* tenant antes de processar (defesa em profundidade sobre o isolamento DB-per-tenant) | `lead_orchestrator.py`, `client_orchestrator.py` |
| B3 | **Prompts multi-tenant** — toda a identidade hardcoded ("L.A. Estética Avançada", "Laura", "terapeuta e esteticista", morada de Leiria) substituída por placeholders `{{clinica_nome}}`, `{{owner_nome}}`, `{{owner_profissao}}` renderizados por tenant. Novo `clinica.md` por tenant (formato `chave: valor`) com fallback `_default/`. Tenant da Laura preservado com os valores actuais — **zero mudança de comportamento em produção**. Corrigida também a contradição do `voz.md` ("Bem-vinda à Marcai" quando o prompt proíbe dizer "Marcai") | `system_lead_agent.md` (41× Laura, 4× L.A., 2× morada), `system_client_agent.md` (22× Laura), `tenant_knowledge.py` (novo `load_clinica_config`), `prompt_renderer.py`, `tenants/_default/clinica.md` (novo), `tenants/695413fb…/clinica.md` (novo), `tenants/_default/voz.md` |

### Verificação

- `npm test`: **297 passed** / 2 failed — as 2 falhas (`tests/webhook-audio.test.js`, mock `getMediaBase64`) são **pré-existentes**: falham de forma idêntica com o código original (verificado por A/B com git stash). É o smoke-test pendente do PR #22.
- `pytest` (ia-service): **42 passed** / 1 failed — a falha (`test_process_lead_returns_error_on_evolution_failure`) é **pré-existente** e depende do ambiente local (o `.env` do developer tem `OPENAI_API_KEY`, o teste entra no caminho do agente real). Falha igual com o código original.
- Smoke do renderer: tenant Laura renderiza "L.A. Estética Avançada"/"Laura"; tenant desconhecido renderiza identidade genérica; **zero placeholders por resolver** nos 4 cenários (lead/client × laura/default).
- Greps: zero `change-in-production` no código; zero `...req.body`.
- Novo teste: `test_render_clinica_identity_per_tenant` garante que a identidade de um tenant nunca vaza para outro.

> ⚠️ **Deploy:** as alterações ao ia-service exigem rebuild da imagem Docker no Contabo. O backend segue o pipeline normal. Confirmar que `INTERNAL_SERVICE_TOKEN`, `JWT_SECRET` e `JWT_REFRESH_SECRET` estão definidos em produção **antes** de fazer deploy (agora são obrigatórios — fail-fast).

---

## 3. Findings completos

### 3.1 Backend — segurança

**Corrigidos nesta sessão:** ver secção 2 (A1-A5, B1-B3).

**Correcção a um falso positivo:** a análise automática reportou "`.env` commitado no git" como crítico. **Verificado: é falso** — `git ls-files` e `git log --all -- .env` confirmam que o `.env` nunca esteve no repositório e está no `.gitignore`. O ficheiro existe apenas localmente (normal). Não é preciso rodar secrets por esta via.

**Por corrigir (roadmap):**

| Sev | Finding | Localização | Correcção sugerida |
|---|---|---|---|
| 🟠 | Dockerfile corre como root | `Dockerfile` | Adicionar `USER appuser` non-root |
| 🟡 | `console.log` com dados de negócio em controllers (em vez de Pino) | `agendamentoController` (linhas 273-320), `transacaoController:50`, outros | Substituir por `logger.info()` estruturado |
| 🟡 | `new Date(dataInicio)` em queries de datas ignora timezone Europe/Lisbon | `historicoAtendimentoController:69-70`, `dashboardController`, outros | Usar Luxon `DateTime.fromISO().setZone('Europe/Lisbon')` (padrão já existe em `transacaoController:77`) |
| 🟡 | `sortBy` de `req.query` sem whitelist no sort | `historicoAtendimentoController:80` | Whitelist `ALLOWED_SORTS` |
| 🟡 | Respostas fora do contrato `{ success, data/error }` — uso de `message`/`details` em dezenas de respostas (pacote, transacao, dashboard, agendamento devolve o doc cru) | módulos financeiro/agendamento/dashboard | Padronizar gradualmente (1 módulo por sessão); coordenar com o frontend |
| 🟡 | Validação de ObjectId em falta antes de queries por `_id` em alguns controllers | `historicoAtendimentoController` e outros | `mongoose.Types.ObjectId.isValid()` no topo |
| 🔵 | Credenciais do Dozzle em comentário no `.env` local | `.env` (local) | Mover para gestor de passwords |
| 🔵 | Script de migração loga password em plaintext | `src/migrations/createLauraTenant.js:135` | Não logar a senha |

**Pontos positivos verificados:** isolamento `tenantId` respeitado na esmagadora maioria dos controllers (com DB-per-tenant como segunda camada), `errorHandler` central não vaza stack traces em produção, `requireServiceToken` já era timing-safe, CORS com whitelist, helmet, rate limiting em login/register/forgot, rotação de refresh token, bcrypt, índices compostos com `tenantId`, bloqueio de conta 5 tentativas → 423.

### 3.2 Frontend — segurança

| Sev | Finding | Localização | Nota |
|---|---|---|---|
| 🟡 | Tokens em `localStorage` (`laura_access_token`, `laura_refresh_token`) — legíveis por XSS | `src/services/api.js:27-29` | Mitigado por React escaping + helmet/CSP no servidor. Alternativa robusta: refresh token em cookie httpOnly (exige mudança no backend). Aceitável para já |
| 🟠 | ~98 `console.log/error` em produção, alguns com payloads de API e detalhes de push | `notificationService.ts:34-38`, `Dashboard.jsx`, `Financeiro.jsx`, `api.js:56` | Gate com `import.meta.env.DEV` ou remover |
| 🟠 | Cache do service worker PWA — risco de servir respostas `/api/*` cacheadas (há histórico de cache agressivo) | `vite.config.js` / SW | Garantir `NetworkOnly` para `/api/*` e limpar caches no logout |
| 🟡 | Zod não cobre todos os formulários (transações, kanban de leads editam sem schema) | `src/schemas/` | Acrescentar schemas em falta |
| ✅ | **Positivos:** zero `fetch` fora de `api.js`; zero leitura de tokens fora do AuthContext; zero `dangerouslySetInnerHTML`; interceptor de refresh com fila anti-race; VAPID public key via env; `ProtectedRoute` com roles | | |

### 3.3 Frontend — visual / UX / limpeza

| Sev | Finding | Detalhe |
|---|---|---|
| ✅ | **Design system impecável** — 100% das páginas auditadas usam a paleta oficial (indigo-500/purple-500/slate-900), glassmorphism nos cards de auth, gradiente nos botões primários. Nenhuma cor fora da paleta encontrada | |
| ✅ | Dark/light theme consistente via `ThemeContext`; timezone Europe/Lisbon correcta nas datas; PWA com InstallPrompt/UpdatePrompt; responsividade mobile-first correcta | |
| 🔴 | **Páginas gigantes** — `Transacoes.jsx` 1357 linhas, `PacotesAtivos.jsx` 1077, mais 7 páginas >600 linhas (CalendarView 765, VenderPacote 760, LandingPage 758, Dashboard 750, Configuracoes 698, EditarAgendamento 684, Agendamentos 635) | Misturam filtros + modais + tabelas + forms. Extrair modais para componentes e lógica para custom hooks (`useTransacoes`), 1 página por sprint |
| 🟠 | **`window.confirm()` ×14** — diálogo nativo do browser, fora do design system e bloqueante | `Clientes.jsx:98`, `Transacoes.jsx`, `PacotesAtivos.jsx`, `Leads.tsx`, +10. Criar `<ConfirmModal>` reutilizável com glassmorphism |
| 🟠 | **51 ficheiros duplicados com sufixo " 2" tracked no git** — `FunilAvaliacaoModal 2.jsx`, `tests/agendamento-funil.test 2.js`, `.claude/rules/* 2.md`, `.playwright-cli/* 2.*`, etc. | Código morto que confunde (e os ficheiros de teste " 2" **correm na suite**, duplicando tempo de CI). Apagar todos |
| 🟡 | Empty states em falta em algumas tabelas (lista vazia mostra só o header) | Adicionar mensagem "Sem registos" + call-to-action |
| 🟡 | Acessibilidade parcial — labels e aria OK no Login; faltam `aria-label` em menus "..." e `scope` em headers de tabela | |
| 🟡 | `Home.jsx` aparenta não ser importado (código morto a confirmar) | |
| 🔵 | Migração TS a 25% (18 `.tsx` vs 55 `.jsx`) — estratégia correcta (novos em TS); 7 usos de `any` | |

### 3.4 IA — prompts e arquitectura

**Corrigido nesta sessão:** identidade multi-tenant (ver 2/B3).

**Avaliação geral dos prompts (muito bom trabalho de base):**
- ✅ Calendário de 14/30 dias injectado dinamicamente — elimina alucinação de datas.
- ✅ Gates estruturais anti-bug (turn_number contra saudações repetidas, gate de confirmação de nome, gate anti-fabricação de slots) — corrigem bugs reais de produção de forma robusta.
- ✅ Guard-rails clínicos exemplares (condições médicas → pedir autorização médica; anti-promessa de resultados; anti-conselhos de saúde) — reduzem risco legal real no vertical estética/saúde.
- ✅ Estado persistido do lead injectado no prompt (nome, motivo, urgência, score) — o agente nunca "esquece".
- ✅ Day-by-day flow de slots como uma recepcionista real; tools com `tenant_id` em closure (o LLM não consegue trocar de tenant).

**Por melhorar (roadmap):**

| Sev | Finding | Detalhe |
|---|---|---|
| 🟡 | Prompt do lead com 1078 linhas (~18 KB) injectado em **cada** turno | Custo de tokens + diluição de contexto. Dividir em sub-prompts (identidade/core ~300 linhas, guardrails, persuasão) e concatenar — permite também A/B por secção |
| 🟡 | Preços e serviços em markdown estático (`servicos.md`) | Mudar preço = editar ficheiro + rebuild do container. Mover para MongoDB (`Tenant.servicos`) com query em tempo real |
| 🟡 | Retry do agente sem backoff (2 tentativas imediatas) | `lead_orchestrator.py:166` — adicionar backoff exponencial (1s, 2s) para rate limits transitórios do Gemini |
| 🟡 | Transcrição de áudio sem fallback de modelo | `routers/transcribe.py` — se o Gemini falhar/esgotar quota, áudio fica sem transcrição. Fallback OpenAI |
| 🟡 | Prompt promete "lembrete automático antes da sessão" incondicionalmente | `system_client_agent.md` — injectar flag `{{reminders_enabled}}` para não prometer o que pode estar desligado |
| 🟡 | `mensagem` sem limites de tamanho no payload | `routers/process.py` — `Field(min_length=1, max_length=2000)` |
| 🔵 | Prompt injection via WhatsApp: risco real **baixo** (input do lead nunca é re-renderizado como template; Pydantic valida tipos; tools com argumentos restritos) | Hardening barato: escapar `{{`/`}}` no input antes de persistir em `observacoes` |
| 🔵 | Género da dona assumido feminino nos prompts ("a {{owner_nome}}", "dona") | Acrescentar campo `genero` ao `clinica.md` quando houver um tenant masculino |
| 🔵 | Teste pré-existente vermelho: `test_process_lead_returns_error_on_evolution_failure` espera 500 mas o orchestrator devolve `status:"error"` com HTTP 200 | Alinhar o teste com o comportamento actual (ou mudar o contrato do router); CI não corre pytest do ia-service — considerar adicionar job |
| 🔵 | Teste pré-existente vermelho: `tests/webhook-audio.test.js` (2 casos, mock `getMediaBase64`) | Smoke-test pendente do PR #22 — corrigir o wiring do mock |

---

## 4. Diferenciais competitivos de IA (sugestões priorizadas)

O posicionamento do Marcai é "IA de conversão" — estas melhorias atacam directamente esse diferencial face a chatbots genéricos (ManyChat, Zenvia, etc.) e a software de agenda sem IA (Fresha, Noona). Ordenadas por impacto/esforço:

| # | Diferencial | O que é | Esforço | Porquê ganha |
|---|---|---|---|---|
| 1 | **Follow-up automático de leads frios** | Lead que ficou em silêncio >24h em `em_conversa` recebe mensagem de follow-up gerada pela IA (máx. 1/semana). Job BullMQ novo + prompt de follow-up | 2-3 dias | Nenhum concorrente de agenda faz reengajamento inteligente; é onde a "conversão" se ganha. Estimativa: +15-20% de leads recuperados |
| 2 | **Resumos de conversa para a dona** | Após cada conversa >3 turnos, a IA gera resumo + próximo passo recomendado, guardado em `Conversa.resumoIA` e visível no inbox | 2-3 dias | A dona deixa de ler 20 mensagens por lead. Reduz tempo de gestão ~40% — argumento de venda directo |
| 3 | **Métricas de conversão da IA no dashboard** | Funnel leads→avaliação→cliente, % marcações feitas pela IA, tempo médio de resposta. Os dados já existem (`Lead.stage`, `Agendamento.criadoPorIA`) | 3-4 dias | Torna o valor da IA **visível e mensurável** — é o que justifica o preço Pro/Elite na renovação |
| 4 | **Detecção de desistência + intervenção** | O extractor já detecta `intent=desistir`; acrescentar notificação push à dona ("Lead X a desistir — intervém") + oferta automática configurável | 1-2 dias | Transforma um dado que já existe em acção que salva vendas |
| 5 | **FAQ por tenant no painel (+ injecção no prompt)** | UI em Configurações para a dona criar FAQs; `find_faq` já existe no ia-service mas `faqs.md` está vazio | 1-2 dias | Reduz "vou confirmar com a equipa" em ~60%; self-service para novos tenants |
| 6 | **A/B de prompts via LangSmith** | 2 variantes do system prompt distribuídas 50/50; medir taxa `lead→agendado` por variante (dataset `marcai-lead-agent` já existe, baseline 92%) | 2 dias | Melhoria contínua de conversão baseada em dados — fosso competitivo crescente |
| 7 | **Multi-idioma (pt-BR, es, en)** | `clinica.md` + prompts por idioma; tenant escolhe na config | 3-4 dias | Abre mercado Brasil/Espanha; fica natural depois do trabalho de placeholders feito hoje |

**Recomendação:** começar por 1+4 (mesma área de código, ~3-4 dias juntos) — é o que mais reforça o posicionamento "não deixamos cair leads".

---

## 5. Roadmap de execução sugerido

1. **Agora (antes do próximo deploy):** commitar as correcções desta sessão; confirmar env vars em produção (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_SERVICE_TOKEN`); rebuild do ia-service no Contabo.
2. **Sprint seguinte (limpeza, ~1 dia):** apagar os 51 ficheiros " 2"; gate dos `console.log` do frontend; `Dockerfile` non-root; `<ConfirmModal>`.
3. **Sprint +2 (qualidade):** refactor `Transacoes.jsx` (a maior); whitelist de `sortBy`; datas com Luxon nos controllers em falta; corrigir os 2 testes pré-existentes vermelhos; job de pytest no CI.
4. **Sprints de produto:** diferenciais #1-#4 da secção 4.
5. **Contínuo:** padronização do contrato `{ success, data/error }` e migração TS — 1 módulo/página por sessão, como já está a ser feito.
