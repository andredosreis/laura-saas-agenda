# Checklist de Pendências — Marcai

**Data da análise:** 2026-07-22
**Base:** 31 ADRs (`docs/adrs/generated/`), 3 PRDs + PRDProgress (`docs/produto/`), auditorias (`docs/operacoes/`), estado real do código na branch `feat/rgpd-f01-consent-logging`.
**Autor:** levantamento automático (Claude) — revisar antes de tratar como verdade absoluta.

> Como usar: cada item é acionável e tem responsável implícito (código vs. decisão sua vs. terceiro).
> `[ ]` = aberto · `[x]` = feito · 🔒 = bloqueado por alguém de fora · 🧭 = precisa de decisão sua.

---

## 1. Panorama dos ADRs

| ADR | Assunto | Status no doc | Estado real (verificado) | Pendência |
|---|---|---|---|---|
| 001–005, 010, 011 | DB-per-tenant, registry, Mongo, JWT, RBAC, Express, modular monolith | Accepted | Em produção | ADR-011: 4 controllers ainda fora de `modules/` |
| 006, 014 | Z-API / Evolution v1 | Deprecated | Substituídos | — |
| 007 | Two-tier LLM | Accepted (v1.1 em evolução) | Em produção | — |
| 008 | Web Push PWA | Accepted | Em produção | — |
| 009 | Deploy Render+Vercel | Accepted | **Obsoleto** (Render descontinuado, ADR-023) | Marcar Superseded por ADR-023 |
| 012 | Docker | "Implementação planeada Fase 2" | **Fase 2 já feita** via ADR-023 | Atualizar status |
| 013 | BullMQ | Accepted — implementado | Em produção | — |
| 015 | Google Calendar | Proposed | **Nada implementado** (sem `googleapis` no package.json) | 🧭 decidir: fazer Fase 1 ou marcar Rejected |
| 016 | Evolution v2 | "Fase 3 concluída" | **v2 em produção** no Contabo | Fechar ADR; Fases 4–6 falam de Render (morto) |
| 017 | Lembretes de parcelas | Implementado | `src/jobs/lembreteParcelaJob.js` existe | — |
| 018 | Zod partilhado FE/BE | Deferred (pilot em clientes/) | **Backend: 12/12 módulos com `*Schemas.js`** | Falta só a parte *shared* com o frontend |
| 019, 020, 021, 022 | Webhook confirmação, paginação, instância/tenant, messaging | Accepted | Em produção | — |
| 023 | VPS Contabo | Executado | Em produção | — |
| 024 | Super-admin | Fases 1–3; 4–5 no PRD hardening | F13–F21 done, **F22 todo** | Ver §3 |
| 025 | WhatsApp oficial vs Baileys | Decisão tomada, implementação diferida | Não iniciado (por desenho) | Gatilho = arrancar tráfego pago |
| 026 | Arquivamento mensagens R2 | Proposed | **Nada implementado** (nenhum exportador) | 🧭 4 fases por decidir |
| 027 | Confirmação independente da IA | Accepted | Em produção | — |
| 028 | Disponibilidade painel+IA | **Proposed** | **F01–F05 todas em produção** | Status errado + pendências operacionais (§5) |
| 029 | Manter Contabo + backup R2 | Accepted | `backup.yml` diário ativo | — |
| 030 | Disaster recovery da stack | Proposed | **Só a BD tem backup** — `.env`, volume e pg da Evolution não | Ver §4 |
| 031 | RGPD ficha+consentimento | Accepted | F01 implementado (**não merged**), F02–F10 só especificados | Ver §2 |

---

## 2. RGPD (ADR-031) — o maior workstream aberto

Estado: `PRDProgress-rgpd.json` — F01 *Implemented*, F02–F10 *Specified*.
O commit do F01 (`e9d3229`) está na branch atual, **fora da `main`**.

### 2.1 Bloqueios externos 🔒
- [ ] Jurista de proteção de dados (PT) valida a matriz Q1–Q14 (`docs/operacoes/rgpd-matriz-juridica.md`) — o pacote pronto pra enviar já existe em `rgpd-perguntas-jurista.md`
- [ ] **DPA** redigido/revisto pelo jurista — é a entrega nº1 pra vender a clínicas (Marcai = processor)
- [ ] Política de privacidade (PT) + versionamento
- [ ] Publicar lista de sub-processadores + processo de pré-aviso de 30 dias
- [ ] DPIA documentada

### 2.2 Implementação (ondas do plano)
- [x] **F01** Consent Logging Foundation — *implementado, falta merge para `main`*
- [ ] Merge/PR da branch `feat/rgpd-f01-consent-logging`
- [ ] **W1 · F02** Need-to-Know Clinical Access Control
- [ ] **W2 · F07** Erasure & Anonymization (pseudonimização alargada)
- [ ] **W2 · F06** Data Subject Export (acesso | portabilidade, com allowlists)
- [ ] **W2 · F09** Communications Consent Capture (opt-in só pelo titular)
- [ ] **W2 · F03** Clinical Tab no registo do cliente
- [ ] **W2 · F04** Formulário self-service de anamnese + consentimento (o diferencial)
- [ ] **W3 · F05** Entrega do link do formulário por WhatsApp
- [ ] **W3 · F08** Job automático de retenção/anonimização (BullMQ)
- [ ] **W4 · F10** Estado de privacidade + `notaOperacional` no agendamento (nunca `observacoes` → IA)

### 2.3 Dívida conhecida
- [ ] 🧭 Resíduo na BD partilhada `laura-saas`: 6 docs pré-migração invisíveis ao export/apagamento RGPD, sendo 3 compras ativas (inclui €275 com 5 sessões). Auditar com `scripts/tools/auditar-residuo-bd-partilhada.mjs` e decidir — **não apagar sem decisão sua**
- [ ] Redaction dos dados enviados a LLMs/LangSmith (item também da auditoria de segurança)

---

## 3. Super-admin (ADR-024 / PRD hardening)

- [x] F13–F21 implementados e merged (PRs #90, #91, #93, #94, #95)
- [ ] **F22 — Console UI Consolidation** (único `todo`; refatora ficheiros tocados por F17/F18/F19/F21)
- [ ] **Rollout do 2FA (F16):** enrolar o operador, fazer login com TOTP e só então pôr `SUPERADMIN_REQUIRE_2FA=true` no VPS
- [ ] **Deploy do F21** exige `PUBLIC_API_URL` + `EVOLUTION_WEBHOOK_SECRET` no `.env` do VPS
- [ ] Dívida registrada (do próprio PRDProgress):
  - [ ] superfície de login separada pro super-admin (rever quando houver >1 operador)
  - [ ] imutabilidade do audit log ao nível da BD (WORM / hash-chain / role insert-only)
  - [ ] impersonation "login as tenant" (só depois do F16 ativo)
  - [ ] renomear planos `basico`/`elite` → `essencial`/`custom`

---

## 4. Segurança e infraestrutura

### 4.1 Itens abertos da auditoria de 2026-07-11
- [ ] Rever acessos/retenção do **Dozzle** e invalidar tokens se houver suspeita de exposição *(Wave 0 — último item aberto)*
- [ ] Testes negativos paramétricos para todas as roles
- [ ] Exigir verificação de email para acesso completo
- [x] MFA/step-up para superadmin — *feito via F16; falta só ligar a flag (§3)*
- [ ] Refresh token em cookie HttpOnly
- [ ] Reduzir capabilities/socket do Docker
- [ ] Centralizar rate limits no Redis
- [ ] Quotas de IA por tenant
- [ ] Confirmação determinística + auditoria pras tools da IA com efeitos reais

### 4.2 Backup / disaster recovery
- [x] Dump diário da BD → R2 (`.github/workflows/backup.yml`) + `scripts/maintenance/restore-backup.sh`
- [ ] **ADR-030 não implementado:** falta backup de `.env` cifrado, `pg_dump` da Evolution e volume `evolution_data`
- [ ] Runbook de restauro **testado pelo menos uma vez** (backup nunca restaurado não é backup)
- [ ] 🧭 Decidir se cancela o auto-backup pago do Contabo depois do backup seletivo rodar

### 4.3 Env vars inertes em produção
- [ ] `RESEND_API_KEY` e `SENTRY_DSN` estão **vazios** em `/opt/marcai/.env` — reset de password nunca funcionou em prod e o alerta de WhatsApp em baixo (PR #89) está inerte
- [ ] Adicionar `ALERT_EMAIL` + `EVOLUTION_MANAGER_URL` e reiniciar o backend
- [ ] 🔒 Verificar domínio de email (bloqueado pelo rename — `docs/operacoes/pendente-nome-dominio-email.md`)

### 4.4 Branch órfã
- [ ] `fix/auditoria-seguranca-2026-06-10` tem 3 commits commitados mas **nunca merged** — decidir merge ou descarte

---

## 5. Disponibilidade (ADR-028) — pendências operacionais

- [ ] Corrigir o **Domingo 00:00–18:00** na config do painel (enforcement ativo já condiciona a marcação manual)
- [ ] 🧭 Decidir a **Segunda-feira**
- [ ] Criar a **exceção de Natal**
- [ ] Confirmar o horário real com a Laura — config diz Seg–Sex 09:00–20:00, a realidade das marcações é 07:00–20:30
- [ ] UI de configuração do intervalo de arrumação (hoje só via script)
- [ ] Fase B — aprovação da Laura por WhatsApp (HITL): por desenhar
- [ ] Marcação da Sílvia 4/8 no painel (encaixe forçado) + pausa de almoço 12–13 desalinhada da realidade
- [ ] Atualizar o status do ADR-028 de *Proposed* para *Accepted — implementado*

---

## 6. ADRs que precisam de decisão sua 🧭

- [ ] **ADR-015 Google Calendar** — Fase 1 (link no email, ~3h) depende de email funcionando, que depende do domínio. Fazer, adiar ou marcar Rejected?
- [ ] **ADR-026 Arquivamento R2** — 4 fases desenhadas, zero implementado. O objetivo declarado (análise de conversas em escala) ainda vale?
- [ ] **ADR-025 WhatsApp oficial** — sem ação até o tráfego pago arrancar; confirmar que continua sendo o gatilho
- [ ] **ADR-018 Zod partilhado** — backend já adotou por inteiro; falta decidir se vale extrair um pacote partilhado com o frontend ou fechar o ADR como parcialmente adotado

---

## 7. Backlog aprovado — features novas

### 7.1 Recuperação de Leads ("carrinho abandonado") — SPECS PRONTAS 2026-07-22

Dá à clínica a lista de quem não converteu (nome, telefone, motivo), exportável em CSV e acionável dentro do app com botão de WhatsApp por pessoa. Resolve três buracos atuais: não dá para saber quantos leads *reais* chegaram (todo número desconhecido vira Lead, incluindo engano e spam), o motivo de perda é texto livre que aceita `'sem motivo'`, e quem some no meio da conversa nunca é marcado — fica invisível para sempre.

**Planejamento (método Harness) — concluído:**
- [x] Desenho aprovado — `docs/superpowers/specs/2026-07-22-recuperacao-leads-design.md`
- [x] PRD — `docs/produto/PRD-recuperacao-leads.md` (5 features, grafo de dependências, critérios de aceitação)
- [x] Specs F01–F05 — `docs/produto/features/features-recuperacao-leads/F0X-*/` (spec+plan+contract cada; geradas por Sonnet, verificadas contra o código e reconciliadas pelo orquestrador em 4 pontos: clamp no controller/service unclamped, `Access-Control-Expose-Headers` no export, `RECUPERACAO_RESULTADO_VALUES` em `pipelineConstants`, labels do frontend re-exportados de `types/lead.ts`)
- [x] Progress tracker — `docs/produto/PRDProgress-recuperacao-leads.json` (5× `Specified`)

**Implementação (`/implement-feature` → `/evaluator`, uma wave por vez):**
- [ ] **W1 · F01** Standardized Loss Reasons Foundation — enum 8 motivos, campos `perdido.motivoCodigo` + `recuperacao`, 2 índices, validação no `transitionStage`, modal do Kanban, backfill (dry-run — `.env` = produção!)
- [ ] **W2 · F02** Recovery Report API — `GET /leads/recuperacao` (antes de `/:id`), regra dos 14 dias derivada, exclusões (`nao_e_lead`, cool-off 30d), `$facet` resumo
- [ ] **W3 · F03** Recovery CSV Export — BOM, sanitização anti-injection, teto 5000 + `X-Export-Truncated`, log de export (registo RGPD)
- [ ] **W4 · F04** Recovery Page UI — `/leads/recuperacao`, 7 tiles, quebra por motivo, filtros, link no **Sidebar.jsx**, download via axios blob
- [ ] **W5 · F05** WhatsApp Action & Contact Tracking — `wa.me` + normalização E.164 (351), `PATCH /:id/recuperacao`, janela 30 dias

**Ligações:** 🔒 o opt-out do **F09 (RGPD)** passa a filtrar a lista quando existir · disparo em massa foi **rejeitado** (risco de ban no Baileys, ADR-025) · IA inferir o motivo dos esfriados fica como fase 2, em cima da base que esta feature cria · dívidas registadas: template da mensagem por tenant, N dias configurável na UI, unificar export do `Transacoes.jsx`, parsing de erro em blob no `api.js`.

---

## 8. Higiene documental (barato e evita erro futuro)

- [ ] `CLAUDE.md` diz **Express 4 / Mongoose 8**; o `package.json` tem **Express 5.2.1 / Mongoose 9.4.1**
- [ ] `.claude/rules/express-middlewares.md` afirma que `requirePermission` foi removido como código morto — **falso**, está em uso em ~112 rotas desde 2026-07-11
- [ ] Regras e ADRs ainda citam Render e Z-API em vários pontos
- [ ] Atualizar status dos ADRs 009, 012, 016, 028 (§1)
- [ ] `docs/planejamento/MELHORIAS.md` é de 17/04/2026 e está todo resolvido — arquivar

---

## 9. Ordem sugerida

1. **Desbloquear o que só depende de você:** env vars do VPS (§4.3), flag do 2FA (§3), config de disponibilidade (§5)
2. **Enviar o pacote ao jurista** (§2.1) — é o caminho crítico mais longo, roda em paralelo com tudo
3. **Merge do F01 RGPD** e seguir W1 → F02 (§2.2)
4. **ADR-030** — backup do `.env`/Evolution + teste de restauro (§4.2): risco alto, custo baixo
5. **Recuperação de Leads W1** (§7.1) — única entrega deste checklist que gera receita direta; não depende de nada em curso
6. **F22** fecha o super-admin (§3)
7. Higiene documental (§8) num único PR
8. Decisões dos ADRs em aberto (§6) quando as ondas RGPD estiverem rodando
