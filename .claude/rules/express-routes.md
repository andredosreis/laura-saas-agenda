# Express — Routes

Routes ficam em `src/routes/`. Responsabilidade: **só routing** — sem lógica de negócio.

## Estrutura modular (ADR-011, migração em curso)

O projecto está a migrar de layout técnico (`src/controllers/`, `src/routes/`, ...) para layout modular em `src/modules/<módulo>/`. Cada módulo agrupa controller + routes + (services) próprios.

Módulos migrados (ADR-011 concluído):
- `src/modules/auth/` — authController, authRoutes
- `src/modules/clientes/` — clienteController, clienteRoutes
- `src/modules/notificacoes/` — notificationController, notificationRoutes
- `src/modules/ia/` — agente/whatsapp/webhook controllers+routes, openaiHelper, functionDispatcher, langchainTools, prompt/
- `src/modules/agendamento/` — agendamentoController, agendamentoRoutes, agendamentoScope
- `src/modules/financeiro/` — 6 controllers (financeiro, transacao, compraPacote, pagamento, caixa, pacote) + 6 routes + financeiroService
- `src/modules/historico/` — historicoAtendimentoController, historicoAtendimentoRoutes

Ainda em `src/controllers/` e `src/routes/` (não migrados — tooling/ambíguos):
- `dashboardController`, `analyticsController` — agregam cross-módulo; módulos próprios num sprint futuro
- `migrationController` — tooling admin
- `scheduleController` — mistura Schedule (operacional) + Agendamento (booking); refactor próprio

Em `src/models/` (crosscutting, importados por >1 módulo):
- User, Tenant, Cliente, Agendamento, Pacote, Transacao, Pagamento, CompraPacote, Conversa, Mensagem, UserSubscription, HistoricoAtendimento, Schedule, registry

Em `src/services/` e `src/utils/` (shared):
- emailService, pushService (usados por múltiplos módulos)
- evolutionClient (ia + agendamento + workers)
- notificacaoHelper, scheduleNotifications, logger
- openaiHelper moveu para ia/ (ia-only)

Enquanto a migração está em curso:
- **Novo código de um módulo já migrado** vai para `src/modules/<módulo>/`
- **Código de módulos ainda não migrados** continua em `src/controllers/`, `src/routes/`, etc.
- **User model, Tenant model, middlewares partilhados** ficam em `src/models/`, `src/middlewares/` (crosscutting — serão movidos para `src/shared/` no fim)

## Versionamento da API

Todas as rotas de recurso são montadas em dual-path em `src/app.js`:

- `/api/<recurso>` — alias legacy (mantido para clientes antigos)
- `/api/v1/<recurso>` — caminho canónico para novos clientes

Ao adicionar um novo router, usa o array `apiResources` em `app.js` para obter o dual-mount automaticamente. Nunca hardcoded `app.use('/api/foo', ...)` fora desse loop.

Webhooks ficam fora do versionamento (ex: `/webhook/*`) — o contrato é controlado pelo cliente externo (Evolution API) e não pela nossa versão.

Frontend: `VITE_API_URL` deve apontar para `/api/v1` em novos deploys. `/api/*` permanece funcional até eliminação planeada com header `Deprecation`.

## Estrutura padrão

```javascript
// src/routes/clienteRoutes.js
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requirePlan } from '../middlewares/requirePlan.js';
import * as ctrl from '../controllers/clienteController.js';

const router = Router();
router.use(authenticate); // todas as rotas protegidas por defeito

router.get('/',       ctrl.listar);
router.post('/',      requirePlan, ctrl.criar);
router.get('/:id',    ctrl.obter);
router.put('/:id',    ctrl.actualizar);
router.delete('/:id', ctrl.remover);

export default router;
```

## Nomeação de rotas

- Recursos em português e plural: `/clientes`, `/agendamentos`, `/pacotes`
- Acções não-CRUD como sub-recursos: `POST /agendamentos/:id/enviar-lembrete`
- IDs sempre em `:id` — nunca query param para identificar recurso único

## Rotas públicas (sem `authenticate`)

```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET  /api/auth/verify-reset-token/:token
GET  /api/auth/verify-email/:token
POST /api/webhook/whatsapp   ← protegido por x-api-token, não JWT
```

Todas as outras rotas exigem `authenticate`.

## Checklist ao adicionar nova rota

- [ ] Lógica vai para o controller — a rota só faz routing
- [ ] `authenticate` aplicado
- [ ] `requirePlan` aplicado se a rota consome limite do plano
- [ ] Resposta segue contrato `{ success, data/error }`
- [ ] Paginação incluída se é listagem
- [ ] Rota adicionada à referência em `.claude/docs/API.md`
