---
name: Bug Dashboard — Nome do cliente não aparece na Agenda de Hoje
description: Bug activo na branch feature/fluxo-financas — nome do cliente/lead não aparece nos cards da Agenda de Hoje no Dashboard
type: project
---

## Bug: Nome do cliente não aparece na Agenda de Hoje

**Branch:** `feature/fluxo-financas`

**Sintoma:** Os cards da "Agenda de Hoje" mostram apenas "● Avaliação" ou "● Serviço Geral" sem o nome do cliente ou lead.

**Causa raiz:** O `.select()` em `dashboardController.js` não incluía os campos `tipo` e `lead`.

**Fix aplicado (backend):**
`src/controllers/dashboardController.js` — 3 endpoints corrigidos (`getAgendamentosDeHoje`, `getAgendamentosAmanha`, `getProximosAgendamentos`):
```javascript
// antes
.select('dataHora status cliente pacote servicoAvulsoNome observacoes')
// depois
.select('dataHora status tipo cliente lead pacote servicoAvulsoNome observacoes')
```

**Fix aplicado (frontend):**
`laura-saas-frontend/src/pages/Dashboard.jsx` — removido badge "Lead" desnecessário. Nome já estava correcto no código: `{ag.cliente?.nome || ag.lead?.nome || 'Sem nome'}`.

**Estado:** Backend fix feito mas pode não estar redeployado no Render ainda.

**Próximo passo a verificar:** Se após o redeploy do Render o nome ainda não aparece para agendamentos de Sessão (não Avaliação), verificar se o `populate('cliente', 'nome')` está a funcionar correctamente em DB-per-tenant. O `req.models.Agendamento.find().populate('cliente', 'nome')` deveria resolver dentro da mesma conexão de tenant.

**Ficheiros alterados:**
- `src/controllers/dashboardController.js` (3 selects corrigidos)
- `laura-saas-frontend/src/pages/Dashboard.jsx` (badge Lead removido)
