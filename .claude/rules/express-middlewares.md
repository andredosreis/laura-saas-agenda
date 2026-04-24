# Express — Middlewares

Middlewares ficam em `src/middlewares/`.

## authenticate (obrigatório em rotas privadas)

```javascript
// src/middlewares/auth.js
// Verifica JWT, popula req.user = { _id, tenantId, role }
import { authenticate } from '../middlewares/auth.js';

router.use(authenticate);
```

Após `authenticate`, `req.user.tenantId` está sempre disponível — usar em todas as queries.

## authorize (RBAC — único mecanismo de autorização)

```javascript
import { authorize } from '../middlewares/auth.js';

// rota só para admin
router.delete('/:id', authenticate, authorize('admin'), ctrl.remover);

// rota para múltiplos roles
router.get('/', authenticate, authorize('admin', 'gerente', 'recepcionista'), ctrl.listar);
```

Roles suportados: `superadmin`, `admin`, `gerente`, `recepcionista`, `terapeuta`.
`superadmin` ignora `authorize` e tem sempre acesso.

O campo `User.permissoes` existe apenas para o frontend mostrar/esconder botões — nunca é verificado no backend. A fonte de verdade de autorização é sempre `req.user.role` + `authorize()`.

Não existe `requirePermission`/`hasPermission` — foi removido em 2026-04-24 como código morto. Se precisares de granularidade fina por utilizador, abre ADR antes de adicionar.

## requirePlan (rotas que consomem limite do plano)

```javascript
import { requirePlan } from '../middlewares/requirePlan.js';

// Aplicar antes do controller em rotas de criação
router.post('/', requirePlan, ctrl.criar);
```

## Rate Limiting (rotas públicas de auth)

```javascript
// src/middlewares/rateLimiter.js
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  message: { success: false, error: 'Demasiadas tentativas. Tente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  message: { success: false, error: 'Limite de registos atingido. Tente mais tarde.' },
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, error: 'Limite atingido. Tente em 1 hora.' },
});
```

Verificar que `app.set('trust proxy', 1)` está em `app.js` (necessário no Render).

## validateWebhook (WhatsApp Z-API)

```javascript
export const validateWebhook = (req, res, next) => {
  const token = req.headers['x-api-token'];
  if (!token || token !== process.env.ZAPI_WEBHOOK_TOKEN) {
    return res.status(401).json({ success: false, error: 'Webhook não autorizado' });
  }
  next();
};
```

Sempre usar header `x-api-token` — nunca query string (query params são logados por proxies).

## Hardening global em `app.js`

```javascript
import helmet from 'helmet';
import cors from 'cors';

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL })); // nunca '*' em produção
app.use(express.json({ limit: '10kb' }));
```

## Regras

- Nunca remover o bloqueio de conta por tentativas falhadas (5 tentativas → 423 → 2h)
- Nunca alterar tempos de expiração JWT sem aprovação explícita
- Nunca usar `*` no CORS em produção
