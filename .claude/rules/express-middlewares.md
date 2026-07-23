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

## requirePermission (permissão granular — EM USO)

> ⚠️ **Corrigido em 2026-07-20.** Esta secção afirmava que `requirePermission` não existia
> ("removido em 2026-04-24 como código morto") e que `User.permissoes` nunca era verificado
> no backend. **Ambas as afirmações eram falsas**: o middleware foi (re)introduzido a
> 2026-07-11 pela remediação da auditoria de segurança (`a186246`) e é hoje usado em
> **112 rotas** de **17 ficheiros de rotas**. Remover `requirePermission` a pensar que é
> código morto derrubaria a autorização em quase toda a API.

```javascript
// src/middlewares/auth.js
import { requirePermission } from '../middlewares/auth.js';

router.get('/', requirePermission('verClientes'), ctrl.listar);
router.post('/', requirePermission('criarClientes'), validate(createClienteSchema), ctrl.criar);
```

- Verifica `req.user.permissoes[permission] === true` (carregado da BD pelo `authenticate`); caso contrário **403**.
- `superadmin` faz bypass, tal como no `authorize`.
- Os defaults por role vivem em `User.getDefaultPermissions(role)` (`src/models/User.js`).

**As duas camadas coexistem e são complementares:**

| Camada | Pergunta que responde | Exemplo |
|---|---|---|
| `authorize('admin','gerente')` | O **cargo** pode fazer isto? | só admin/gerente despacham WhatsApp manual |
| `requirePermission('verClientes')` | **Este utilizador** tem a permissão activa? | recepcionista com `verClientes` desligado |

Em rotas sensíveis usam-se as duas em conjunto (ver `src/modules/ia/whatsappRoutes.js`).
`User.permissoes` **é** verificado no backend — não é apenas cosmética de frontend.

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

Verificar que `app.set('trust proxy', 1)` está em `app.js` (necessário atrás do nginx reverse proxy no VPS Contabo).

## validateWebhook (WhatsApp Evolution API)

O webhook do WhatsApp usa o header **`apikey`** — herança da Evolution API, não da
Z-API (descontinuada). A fonte de verdade é `src/middlewares/webhookAuth.js`, e a
Evolution envia este mesmo header ao configurar a instância (ver `EVOLUTION_WEBHOOK_SECRET`
em `evolutionClient.js`). **Não** é `x-api-token`/`ZAPI_WEBHOOK_TOKEN` — usar isso faz a
instância nascer muda (recebe mensagens, o backend recusa-as todas).

```javascript
// src/middlewares/webhookAuth.js
export const validateWebhook = (req, res, next) => {
  const token = req.headers['apikey'] || req.body?.apikey;
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  // Sem secret configurado, recusa sempre — nunca aceitar por omissão.
  if (!expected || !token || !safeEqual(String(token), expected)) {
    return res.status(401).json({ success: false, error: 'Webhook não autorizado' });
  }
  next();
};
```

Header `apikey`, nunca query string (query params são logados por proxies). A comparação
é constant-time (`safeEqual` / `crypto.timingSafeEqual`), não `===`.

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
