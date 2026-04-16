# Express — Routes

Routes ficam em `src/routes/`. Responsabilidade: **só routing** — sem lógica de negócio.

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
