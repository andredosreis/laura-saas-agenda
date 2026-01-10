# 🔐 Variáveis de Ambiente - Backend no Render

## ✅ O QUE VOCÊ JÁ TEM

- ✅ **ZAPI** (WhatsApp)
- ✅ **OPENAI** (IA)
- ✅ **MONGODB** (Banco de dados)

---

## 📋 CHECKLIST COMPLETO - Variáveis Necessárias no Render

### ✅ 1. MONGODB (JÁ TEM)

```env
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/lauraDB?retryWrites=true&w=majority
```

**Status:** ✅ Configurado

---

### ✅ 2. Z-API - WHATSAPP (JÁ TEM)

```env
ZAPI_INSTANCE_ID=seu_instance_id
ZAPI_TOKEN=seu_token
```

**Status:** ✅ Configurado

---

### ✅ 3. OPENAI (JÁ TEM)

```env
OPENAI_API_KEY=sk-proj-...
```

**Status:** ✅ Configurado

---

## ⚠️ VARIÁVEIS QUE PODEM ESTAR FALTANDO

### 🔴 4. JWT - AUTENTICAÇÃO (CRÍTICO!)

```env
JWT_SECRET=sua-chave-secreta-super-segura-de-64-caracteres-ou-mais
JWT_REFRESH_SECRET=outra-chave-diferente-para-refresh-tokens-64-chars
```

**Como gerar:**
Execute no terminal (cada comando gera uma chave):

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Execute 2 vezes e use uma chave para cada variável.

**Por que é importante?**
- Sem isso, o login NÃO funciona!
- É a chave que assina os tokens de autenticação

**Status:** ⚠️ VERIFICAR SE EXISTE

---

### 🟡 5. WEB PUSH - NOTIFICAÇÕES (IMPORTANTE)

```env
VAPID_PUBLIC_KEY=BPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_PRIVATE_KEY=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
VAPID_SUBJECT=mailto:laura@laesteticaavanc.com
```

**Como gerar:**
Execute no terminal:

```bash
npx web-push generate-vapid-keys
```

Vai retornar:
```
=======================================
Public Key:
BPx...

Private Key:
qrs...
=======================================
```

**Por que é importante?**
- Permite notificações push no navegador
- Sem isso, lembretes automáticos NÃO funcionam

**Status:** ⚠️ PROVAVELMENTE FALTANDO

---

### 🟡 6. AMBIENTE E PORTA

```env
NODE_ENV=production
PORT=5000
```

**Por que é importante?**
- `NODE_ENV=production` ativa otimizações
- `PORT` pode ser necessário (Render usa variável PORT automática)

**Status:** ⚠️ VERIFICAR

**Nota:** O Render geralmente define PORT automaticamente, mas NODE_ENV você precisa adicionar.

---

### 🟡 7. FRONTEND URL (CORS)

```env
FRONTEND_URL=https://seu-frontend.vercel.app
```

**Substitua pela URL real do seu frontend no Vercel!**

**Por que é importante?**
- Configura CORS corretamente
- Sem isso, frontend NÃO consegue fazer chamadas à API

**Exemplo:**
```env
FRONTEND_URL=https://laura-saas-agenda.vercel.app
```

**Status:** ⚠️ PROVAVELMENTE FALTANDO

---

### 🟢 8. EMAIL (OPCIONAL - Recuperação de Senha)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=laura@laesteticaavanc.com
SMTP_PASS=sua_senha_de_app_do_google
SMTP_FROM=Laura Estética <noreply@laesteticaavanc.com>
```

**Como configurar Gmail:**
1. Acesse: https://myaccount.google.com/security
2. Ative "Verificação em 2 etapas"
3. Em "Senhas de app", crie uma nova senha
4. Use essa senha em `SMTP_PASS`

**Por que é importante?**
- Permite recuperação de senha
- Envio de emails automáticos

**Status:** 🟢 OPCIONAL (mas recomendado)

---

## 📊 RESUMO - O QUE ADICIONAR NO RENDER

### 🔴 CRÍTICO (SEM ISSO NÃO FUNCIONA):

```env
JWT_SECRET=<gere com crypto.randomBytes>
JWT_REFRESH_SECRET=<gere com crypto.randomBytes>
FRONTEND_URL=https://seu-frontend.vercel.app
NODE_ENV=production
```

### 🟡 IMPORTANTE (SEM ISSO PERDE FUNCIONALIDADES):

```env
VAPID_PUBLIC_KEY=<gere com web-push>
VAPID_PRIVATE_KEY=<gere com web-push>
VAPID_SUBJECT=mailto:laura@laesteticaavanc.com
```

### 🟢 OPCIONAL (MAS ÚTIL):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=laura@laesteticaavanc.com
SMTP_PASS=<senha de app do Google>
SMTP_FROM=Laura Estética <noreply@laesteticaavanc.com>
```

---

## 🎯 COMO ADICIONAR NO RENDER

1. Acesse seu projeto no Render
2. Vá em **Dashboard** → **Environment**
3. Clique em **"Add Environment Variable"**
4. Adicione cada variável (Nome + Valor)
5. Clique em **"Save Changes"**
6. O Render vai fazer redeploy automaticamente

---

## 🚀 COMANDOS PARA GERAR AS CHAVES

### JWT Secrets (execute 2 vezes):

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Exemplo de saída:**
```
a3f9d8e7c6b5a4321fedcba9876543210abcdef123456789abcdef0123456789abcdef...
```

### VAPID Keys (execute 1 vez):

```bash
npx web-push generate-vapid-keys
```

**Exemplo de saída:**
```
Public Key:
BPxK8fG...

Private Key:
qrstuv...
```

---

## ✅ CHECKLIST FINAL

Antes de fazer deploy do frontend, certifique-se:

- [ ] `MONGODB_URI` - ✅ Já tem
- [ ] `ZAPI_INSTANCE_ID` - ✅ Já tem
- [ ] `ZAPI_TOKEN` - ✅ Já tem
- [ ] `OPENAI_API_KEY` - ✅ Já tem
- [ ] `JWT_SECRET` - ⚠️ Adicionar
- [ ] `JWT_REFRESH_SECRET` - ⚠️ Adicionar
- [ ] `VAPID_PUBLIC_KEY` - ⚠️ Adicionar
- [ ] `VAPID_PRIVATE_KEY` - ⚠️ Adicionar
- [ ] `VAPID_SUBJECT` - ⚠️ Adicionar
- [ ] `NODE_ENV=production` - ⚠️ Adicionar
- [ ] `FRONTEND_URL` - ⚠️ Adicionar (depois do deploy do frontend)
- [ ] `SMTP_*` (5 variáveis) - 🟢 Opcional

---

## 🎯 PRÓXIMOS PASSOS

1. **Gere as chaves faltantes** (JWT e VAPID)
2. **Adicione no Render** as variáveis marcadas com ⚠️
3. **Aguarde o redeploy** automático
4. **Teste o backend:** `https://seu-backend.onrender.com/api/health`
5. **Deploy do frontend** no Vercel
6. **Volte no Render** e adicione `FRONTEND_URL`
7. **Pronto!** 🚀

---

**Última atualização:** Janeiro 2026
