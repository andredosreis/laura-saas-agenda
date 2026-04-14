# Security Guidelines — Laura SaaS Agenda

Lê este ficheiro ao tocar em auth, middlewares ou rotas públicas.

---

## Rate Limiting (rotas públicas)

```javascript
// src/middlewares/rateLimiter.js
import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 5,
  message: { success: false, error: 'Demasiadas tentativas. Tente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hora
  max: 3,
  message: { success: false, error: 'Limite de registos atingido. Tente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, error: 'Limite atingido. Tente em 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});
```

Aplicar em `authRoutes.js`. Verificar que `app.set('trust proxy', 1)` está em `app.js` (necessário no Render).

---

## Validação de Webhook WhatsApp

```javascript
// src/middlewares/webhookAuth.js
export const validateWebhook = (req, res, next) => {
  const token = req.headers['x-api-token'];
  if (!token || token !== process.env.ZAPI_WEBHOOK_TOKEN) {
    return res.status(401).json({ success: false, error: 'Webhook não autorizado' });
  }
  next();
};
```

- Usar sempre header `x-api-token`, nunca query string
- `ZAPI_WEBHOOK_TOKEN` vem exclusivamente de env var
- Nunca aceitar token via `?token=` (query param é logado por proxies)

---

## JWT — Configuração Obrigatória

```javascript
// Criação — sempre com algoritmo explícito e expiração
const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
  algorithm: 'HS256',
  expiresIn: '1h',
});

const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
  algorithm: 'HS256',
  expiresIn: '7d',
});
```

- `JWT_SECRET` e `JWT_REFRESH_SECRET` obrigatoriamente via env var — nunca hardcoded
- Refresh token validado contra base de dados — não apenas a assinatura JWT
- Rotação correcta: invalidar token antigo ao emitir novo
- Access: 1h. Refresh: 7d. Não alterar sem instrução explícita.

---

## Hardening Global (verificar em `src/app.js`)

```javascript
import helmet from 'helmet';
import cors from 'cors';

app.set('trust proxy', 1);                       // necessário no Render
app.use(helmet());                               // headers de segurança
app.use(cors({ origin: process.env.FRONTEND_URL })); // nunca '*' em produção
app.use(express.json({ limit: '10kb' }));        // limitar payload
```

---

## O Que Nunca Fazer

- Remover bloqueio de conta por tentativas falhadas (5 tentativas → 423 → 2h de bloqueio)
- Alterar tempos de expiração JWT sem aprovação explícita
- Aceitar `any` como tipo de token (verificar algoritmo explicitamente)
- Expor `JWT_SECRET` em logs ou respostas
- Usar `*` no CORS em produção
- Aceitar webhook sem validação de token

---

## Classificação de Severidade

| Condição | Severidade |
|---|---|
| Rota pública sem rate limit | 🔴 Crítico |
| Webhook sem validação de token | 🔴 Crítico |
| JWT sem expiração ou segredo hardcoded | 🔴 Crítico |
| `helmet()` ausente | 🟡 Importante |
| CORS com `*` em produção | 🟡 Importante |
| Logs com tokens ou passwords | 🟡 Importante |

---

## Checklist Antes de Commitar

- [ ] Nenhuma rota privada ficou sem `authenticate` middleware
- [ ] Rate limit em `register`, `login`, `forgot-password`
- [ ] Webhook rejeita requests sem `x-api-token` válido
- [ ] JWT continua funcional (login, refresh, logout)
- [ ] Nenhum segredo hardcoded
- [ ] `helmet()` e CORS configurados
- [ ] Nenhum dado sensível (password, token) em logs
