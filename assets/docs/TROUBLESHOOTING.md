# 🔧 TROUBLESHOOTING - LAURA SAAS AGENDA

Guia de solução de problemas comuns.

---

## 📑 Índice

1. [Erros de Build](#erros-de-build)
2. [Erros de Runtime](#erros-de-runtime)
3. [Erros de Deploy](#erros-de-deploy)
4. [Erros de Banco de Dados](#erros-de-banco-de-dados)
5. [Erros de Integrações](#erros-de-integrações)

---

## 1. Erros de Build

### 1.1 ❌ Erro: "lucide-react" não encontrado

**Erro completo:**
```
Failed to resolve import "lucide-react" from "src/components/InstallPrompt.tsx".
Does the package need to be installed?
```

**Causa:**
O componente `InstallPrompt.tsx` importa ícones de `lucide-react`, mas a dependência não estava instalada no `package.json`.

**Solução:**
```bash
cd laura-saas-frontend
npm install lucide-react
```

**Versão instalada:** `lucide-react@0.553.0`

**Arquivos afetados:**
- `src/components/InstallPrompt.tsx` (linha 2: `import { Download, X } from 'lucide-react';`)

**Status:** ✅ Resolvido (16/Nov/2025)

---

### 1.2 ❌ Erro: Vulnerabilidades npm

**Erro:**
```
7 vulnerabilities (3 low, 2 moderate, 1 high, 1 critical)
```

**Solução:**
```bash
# Frontend
cd laura-saas-frontend
npm audit fix

# Backend
cd ..
npm audit fix
```

**Atenção:** Alguns pacotes podem ter breaking changes. Teste após o fix.

**Status:** ⏳ Pendente

---

### 1.3 ❌ Erro: "Cannot find module" (TypeScript)

**Causa:**
Imports TypeScript incorretos ou módulos não instalados.

**Solução:**
1. Verificar se módulo está instalado:
   ```bash
   npm list [nome-do-pacote]
   ```
2. Se não estiver, instalar:
   ```bash
   npm install [nome-do-pacote]
   ```
3. Limpar cache TypeScript:
   ```bash
   rm -rf node_modules .vite dist
   npm install
   npm run build
   ```

---

## 2. Erros de Runtime

### 2.1 ❌ Erro: "CORS policy blocked"

**Erro:**
```
Access to fetch at 'http://localhost:5000/api/...' from origin 'http://localhost:5173'
has been blocked by CORS policy
```

**Causa:**
Backend não configurado para aceitar requisições do frontend.

**Solução:**

**Backend (`src/app.js`):**
```javascript
const cors = require('cors');

const allowedOrigins = [
  'http://localhost:5173',  // Vite dev
  'https://laura-saas-agenda-mfqt.vercel.app',  // Produção
  'https://api.z-api.io'  // Z-API webhooks
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
```

**Frontend (`.env.local`):**
```env
VITE_API_URL=http://localhost:5000/api
```

**Status:** ✅ Configurado

---

### 2.2 ❌ Erro: "Network Error" ao chamar API

**Causa:**
Backend não está rodando ou URL incorreta.

**Solução:**
1. Verificar se backend está rodando:
   ```bash
   # Terminal 1
   npm run dev
   # Deve exibir: "Servidor rodando na porta 5000"
   ```
2. Verificar variável de ambiente:
   ```bash
   # Frontend
   cat laura-saas-frontend/.env.local
   # Deve ter: VITE_API_URL=http://localhost:5000/api
   ```
3. Testar API manualmente:
   ```bash
   curl http://localhost:5000/api/clientes
   ```

---

### 2.3 ❌ Erro: Service Worker não registra

**Causa:**
Service Worker só funciona em HTTPS ou localhost.

**Solução:**
- **Dev:** Usar `localhost` (não `127.0.0.1`)
- **Produção:** HTTPS obrigatório (Vercel já fornece)

**Verificar:**
```javascript
// Console do navegador
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Service Workers:', regs);
});
```

---

## 3. Erros de Deploy

### 3.1 ❌ Vercel: Build falhou (lucide-react)

**Erro:**
```
Failed to resolve import "lucide-react"
```

**Solução:**
1. Instalar dependência:
   ```bash
   cd laura-saas-frontend
   npm install lucide-react
   ```
2. Commit e push:
   ```bash
   git add package.json package-lock.json
   git commit -m "fix: Adiciona lucide-react ao package.json"
   git push
   ```
3. Vercel fará redeploy automático

**Status:** ✅ Resolvido

---

### 3.2 ❌ Vercel: Environment variables não definidas

**Causa:**
Variáveis de ambiente não configuradas no Vercel dashboard.

**Solução:**
1. Acessar: https://vercel.com/[seu-projeto]/settings/environment-variables
2. Adicionar:
   ```
   VITE_API_URL = https://[seu-backend].com/api
   VITE_VAPID_PUBLIC_KEY = BJ...
   ```
3. Redeploy:
   ```bash
   vercel --prod
   ```

---

### 3.3 ❌ Backend: "Cannot find module" em produção

**Causa:**
Dependência em `devDependencies` em vez de `dependencies`.

**Solução:**
Mover para `dependencies`:
```bash
npm install --save [pacote]  # ao invés de --save-dev
```

---

## 4. Erros de Banco de Dados

### 4.1 ❌ MongoDB: Connection timeout

**Erro:**
```
MongooseServerSelectionError: connect ETIMEDOUT
```

**Causa:**
- IP não whitelisted no MongoDB Atlas
- Credenciais incorretas
- Network/firewall bloqueando

**Solução:**
1. MongoDB Atlas → Network Access → Add IP Address → Allow from Anywhere (0.0.0.0/0)
2. Verificar MONGO_URI:
   ```bash
   cat .env.local | grep MONGO_URI
   ```
3. Testar conexão:
   ```javascript
   // test-db.js
   const mongoose = require('mongoose');
   mongoose.connect(process.env.MONGO_URI)
     .then(() => console.log('✅ Conectado'))
     .catch(err => console.error('❌ Erro:', err));
   ```

---

### 4.2 ❌ MongoDB: Duplicate key error

**Erro:**
```
E11000 duplicate key error collection: lauraDB.clientes index: telefone_1
```

**Causa:**
Tentando inserir cliente com telefone já existente.

**Solução:**
Frontend já trata (verificar antes de criar). Se persistir:
```javascript
// Backend - adicionar try/catch
try {
  const cliente = await Cliente.create(data);
} catch (error) {
  if (error.code === 11000) {
    return res.status(400).json({
      error: 'Cliente com este telefone já existe'
    });
  }
  throw error;
}
```

---

## 5. Erros de Integrações

### 5.1 ❌ Z-API: Webhook não recebe mensagens

**Causa:**
- Webhook URL incorreta
- Backend não acessível publicamente

**Solução:**
1. Usar ngrok para testes locais:
   ```bash
   ngrok http 5000
   # URL: https://abc123.ngrok.io
   ```
2. Configurar webhook no Z-API:
   ```
   POST https://api.z-api.io/instances/{instance}/token/{token}/webhook
   Body: {
     "url": "https://abc123.ngrok.io/webhook/whatsapp"
   }
   ```

---

### 5.2 ❌ OpenAI: Rate limit exceeded

**Erro:**
```
Rate limit reached for gpt-4o-mini
```

**Causa:**
Muitas requisições simultâneas.

**Solução:**
1. Implementar retry com backoff:
   ```javascript
   const retry = async (fn, retries = 3) => {
     try {
       return await fn();
     } catch (error) {
       if (retries > 0 && error.status === 429) {
         await new Promise(r => setTimeout(r, 2000 * (4 - retries)));
         return retry(fn, retries - 1);
       }
       throw error;
     }
   };
   ```
2. Aumentar tier no OpenAI (pago)

---

### 5.3 ❌ Web Push: Notificações não chegam

**Causa:**
- Permissão negada
- Subscription expirada
- VAPID keys incorretas

**Solução:**
1. Verificar permissão:
   ```javascript
   console.log('Permission:', Notification.permission);
   // Se 'denied', usuário precisa permitir manualmente
   ```
2. Resubscrever:
   ```javascript
   // Frontend
   const subscription = await serviceWorker.pushManager.getSubscription();
   if (!subscription) {
     // Criar nova subscription
   }
   ```
3. Verificar VAPID keys:
   ```bash
   # Backend
   echo $VAPID_PUBLIC_KEY
   # Frontend
   echo $VITE_VAPID_PUBLIC_KEY
   # Devem ser iguais
   ```

---

## 6. Comandos Úteis de Debug

### 6.1 Verificar Status Completo

```bash
# Backend
npm run dev  # Deve exibir "Servidor rodando na porta 5000"

# Frontend (em outro terminal)
cd laura-saas-frontend
npm run dev  # Deve exibir "Local: http://localhost:5173"

# MongoDB
# Verificar se conectou (logs do backend)

# OpenAI
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models

# Z-API
curl https://api.z-api.io/instances/{instance}/token/{token}/status
```

---

### 6.2 Limpar Cache e Reinstalar

```bash
# Backend
rm -rf node_modules package-lock.json
npm install

# Frontend
cd laura-saas-frontend
rm -rf node_modules package-lock.json .vite dist
npm install
npm run build
```

---

### 6.3 Logs Estruturados

```bash
# Backend - Adicionar Winston
npm install winston

# src/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

module.exports = logger;

// Usar
logger.info('Cliente criado', { clienteId: cliente._id });
logger.error('Erro ao criar cliente', { error: error.message });
```

---

## 7. Checklist de Troubleshooting

Quando algo não funciona, siga esta ordem:

```
□ 1. Verificar logs do console (navegador + terminal)
□ 2. Verificar .env (variáveis corretas?)
□ 3. Verificar network tab (requisições HTTP)
□ 4. Verificar se backend está rodando (curl)
□ 5. Verificar se MongoDB está conectado (logs)
□ 6. Verificar se dependências estão instaladas (npm list)
□ 7. Limpar cache (node_modules, .vite, dist)
□ 8. Reinstalar dependências (npm install)
□ 9. Testar em ambiente isolado (novo clone do repo)
□ 10. Buscar erro no Google/Stack Overflow
```

---

## 8. Contato para Suporte

Se o problema persistir:

1. **GitHub Issues**: [Criar issue](https://github.com/seu-usuario/laura-saas-agenda/issues)
2. **Email**: [seu-email@exemplo.com]
3. **Documentação**: [docs/ANALISE_COMPLETA.md](ANALISE_COMPLETA.md)

**Ao reportar erro, incluir:**
- Sistema operacional
- Versão Node.js (`node -v`)
- Mensagem de erro completa
- Logs do console/terminal
- Passos para reproduzir

---

**Última Atualização:** 16 de Novembro de 2025
**Versão:** 1.0.0
