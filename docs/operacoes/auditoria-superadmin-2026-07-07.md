# Auditoria do Painel Super-Admin — 2026-07-07

Auditoria completa do painel super-admin (ADR-024, PRs #34–#43) em `main`, cobrindo backend (`src/modules/admin/`), frontend (`laura-saas-frontend/src/pages/admin/` + `components/admin/`) e comparação com práticas de mercado (OWASP Multi-Tenant Security, padrões de consolas internas SaaS).

**Conclusão:** o painel faz sentido e a fundação é acima da média — os problemas são de **hardening por concluir** (Fase 5 do ADR-024 nunca foi feita) e **gaps funcionais/UX**, não de arquitectura. O plano de correcção está em `docs/produto/PRD-superadmin-hardening.md` (features F13–F22).

---

## 1. O que está bem (preservar tal como está)

Os 4 gates estruturais tornam difícil introduzir uma rota admin insegura:

| Gate | Onde | O que garante |
|---|---|---|
| `requireSuperadmin` + 404 | `src/modules/admin/requireSuperadmin.js` | Não-superadmin recebe 404 (não revela a superfície); negação auditada (`admin.access.denied`) |
| `adminMutation` transacional | `src/modules/admin/adminMutation.js` | Mutação + entrada de audit commitam **na mesma transacção** — impossível mutar sem rasto; side-effects só em `afterCommit` |
| `getTenantDBAdmin` read-only | `src/modules/admin/getTenantDBAdmin.js` | Conexão **separada** com credencial RO (`MONGO_TENANT_RO_URI`), fail-closed — o painel é incapaz de escrever em dados de tenant |
| Sweep test paramétrico | `tests/admin-superadmin-sweep.test.js` | Introspecciona o router e afirma 404 para não-superadmin em **cada** rota montada — rota nova nasce protegida |

Reforços adicionais: ESLint proíbe `router.post/put/delete` cru em `src/modules/admin/` (`eslint.config.js:131-145`) e restringe o import de `getTenantDBAdmin` ao módulo admin; validação Zod via `validate()`; whitelists explícitas contra mass-assignment; diff `before/after` GDPR-minimal no audit; 12 ficheiros de teste cobrindo autorização, atomicidade, rollback e enforcement de suspensão.

## 2. Riscos priorizados

### 🔴 P0 — Segurança (Fase 5 do ADR-024 por fazer)

1. **Sem rate limiting nas rotas `/admin`** — Guard #4 do ADR exige-o; zero limiters no módulo (confirmado). → **F13**
2. **Sem 2FA e sem login separado** — superadmin entra pelo `POST /api/auth/login` normal. Um token roubado = acesso a todos os tenants + bypass de `authorize()` em todo o produto (`src/middlewares/auth.js:76-78`). → **F16** (2FA TOTP; login separado fica como dívida)
3. **Enforcement read-only depende cegamente da env var** `MONGO_TENANT_RO_URI` — se apontar para credencial RW, o Gate 4b colapsa em silêncio; sem verificação em runtime nem teste (o próprio teste admite: `tests/admin-tenant-uso.test.js:13-16`). → **F14**
4. **`GET /admin/tenants/:id` usa denylist de secrets** (`adminController.js:56-58` exclui só 3 campos WhatsApp) — qualquer campo secreto novo no schema `Tenant` fica exposto por omissão; devolve também `contato` (dados pessoais do dono — GDPR). → **F15**
5. **Audit log imutável só por disciplina de aplicação** (`src/models/AuditLog.js:5-14`) — sem protecção ao nível da DB (WORM/hash-chain/credencial insert-only). Aceitável ao porte actual; fica como **dívida registada** no PRD.

### 🟡 P1 — Bugs e gaps funcionais

6. **Toast de erro duplicado no audit viewer** — `useAdminAudit.ts:40` faz `toast.error` e o interceptor de `api.js:182-183` mostra outro; os hooks de tenants evitam isto de propósito. → **F17**
7. **Tudo assenta num único fetch de 100 tenants** (`useAdminTenants.ts:15`) — pesquisa, KPIs e distribuição por plano ficam errados a partir do 101.º tenant; pesquisa é client-side. → **F18**
8. **Sem indicador de ambiente** (PRODUÇÃO/DEV) na consola — zero referências a `import.meta.env` em `components/admin`/`pages/admin`. → **F20**
9. **Audit viewer esconde o que o backend regista**: filtros `from`/`to` existem no hook mas não na UI (`AuditLogPage.tsx:51-119`); `before`/`after` existem no tipo (`types/admin.ts:65-66`) mas nunca são mostrados; metadados só em hover (inacessível em touch). → **F17**
10. **Detalhe do tenant não mostra o dono nem os utilizadores** — só `totalUsuarios`; `adminEmail`/`adminNome` recolhidos na criação e nunca exibidos. → **F19**
11. **Fase 4 do ADR-024 (WhatsApp/Evolution por tenant) nunca foi implementada** — listada nas capacidades do ADR (`:49`), inexistente no código. É a funcionalidade em falta com mais valor operacional (onboarding). → **F21**
12. Menores: sem rota 404/catch-all (`App.tsx:100-203`); filtros de audit exigem colar ObjectIds à mão (sem "copiar ID"). → **F17/F20**

### 🟢 P2 — Design/qualidade de código

13. **Inconsistência visual interna**: `KpiCard`/`PlanDistributionBar` são glass `rounded-2xl` (`ConsoleUI.tsx:105,125`) mas o `ConsoleCard` dominante é flat `rounded-[3px]` (`ConsoleUI.tsx:82-88`). → **F22**
14. **Duplicação de UI**: shell de modal repetido 3× (`CreateTenantForm.tsx:52`, `EditPlanLimitsForm.tsx:160`, `SuspendReactivateControls.tsx:31`), `inputClass`/`labelClass` 4×, rodapé de paginação e spinner duplicados. → **F22**
15. **Guard test de cor é só negativo** (`no-cream-rust.test.ts`) — bloqueia hex cream/rust antigos mas não afirma a paleta correcta nem apanha classes Tailwind. → **F22**
16. Dois modelos de paginação (client-side na lista, server-side no audit) — unificar em server-side. → **F18**
17. `useAdminAudit` usa refetch manual + `eslint-disable exhaustive-deps` (`useAdminAudit.ts:48`); `computeTenantStats` assume `plano.tipo` sempre válido (`adminStats.ts:24`). → **F17/F18**

## 3. Comparação com o mercado

- O scope actual (lista, detalhe, plano/limites, suspend, audit viewer) corresponde ao núcleo das consolas internas de referência — não falta nada exótico nem há excesso a cortar.
- O que consolas maduras têm e o Marcai não: **impersonation/"login as tenant" auditado** (útil no modelo done-for-you, mas perigoso — OWASP e Azure AC tratam-no como capability que exige 2FA + audit rigoroso primeiro), **badge de ambiente**, **2FA para operadores**.
- Referências: [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html) · [WorkOS — multi-tenant architecture](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture) · [Azure Architecture Center — identity in multitenant solutions](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/identity)

## 4. Discrepância de documentação encontrada

`CLAUDE.md` (tabela Tech Stack) diz **Express 4 + Mongoose 8**, mas `package.json` tem **`express ^5.2.1` + `mongoose ^9.4.1`** (e `express-rate-limit ^8.2.1`, cuja API v8 usa `limit` em vez de `max`). Qualquer implementação nova deve seguir as versões do manifest — as specs F13+ já assumem as versões reais.

## 5. Onde está o plano

- **PRD:** `docs/produto/PRD-superadmin-hardening.md` (F13–F22, waves, critérios de aceitação)
- **Specs:** `docs/produto/features/features-super_admin/F13…F22/spec.md`
- **Progresso:** `docs/produto/PRDProgress-superadmin-hardening.json`
