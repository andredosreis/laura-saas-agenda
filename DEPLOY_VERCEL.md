# 🚀 Guia de Deploy - Laura SAAS no Vercel

Este guia detalha o processo completo de deploy da aplicação Laura SAAS no Vercel.

---

## 📋 PRÉ-REQUISITOS

Antes de começar, certifique-se de ter:

- ✅ Conta no [Vercel](https://vercel.com)
- ✅ Conta no [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (banco de dados em produção)
- ✅ Repositório Git (GitHub, GitLab ou Bitbucket)
- ✅ Chaves de API necessárias:
  - OpenAI API Key (se usar IA)
  - Z-API credentials (WhatsApp)
  - VAPID Keys (notificações push)

---

## 🎯 ESTRATÉGIA DE DEPLOY

O projeto será dividido em **2 deploys separados** no Vercel:

1. **Backend API** - Node.js/Express (serverless)
2. **Frontend** - React/Vite (static site)

---

## 📦 PARTE 1: DEPLOY DO BACKEND

### 1.1. Preparar Banco de Dados (MongoDB Atlas)

1. Acesse [MongoDB Atlas](https://cloud.mongodb.com)
2. Crie um cluster (se ainda não tiver)
3. Configure o acesso de rede:
   - Em **Network Access**, adicione `0.0.0.0/0` (permitir de qualquer lugar)
4. Crie um usuário de banco de dados:
   - Em **Database Access**, crie um usuário com senha forte
5. Copie a **Connection String**:
   ```
   mongodb+srv://usuario:senha@cluster.mongodb.net/lauraDB?retryWrites=true&w=majority
   ```

### 1.2. Gerar Chaves VAPID (Notificações Push)

Execute no terminal:

```bash
npx web-push generate-vapid-keys
```

**Salve as chaves geradas:**
```
Public Key: BPx...
Private Key: qrs...
```

### 1.3. Deploy do Backend no Vercel

#### Via Interface Web do Vercel:

1. Acesse [Vercel Dashboard](https://vercel.com/dashboard)
2. Clique em **"Add New"** → **"Project"**
3. Importe seu repositório Git
4. Configure o projeto:

**Configurações:**
```
Framework Preset: Other
Root Directory: ./
Build Command: (deixe vazio)
Output Directory: (deixe vazio)
Install Command: npm install
```

5. **Adicione as Variáveis de Ambiente:**

Clique em **"Environment Variables"** e adicione:

```env
# MongoDB
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/lauraDB?retryWrites=true&w=majority

# JWT
JWT_SECRET=sua-chave-secreta-super-segura-aqui-64-caracteres
JWT_REFRESH_SECRET=outra-chave-secreta-para-refresh-token-64-caracteres

# OpenAI (opcional)
OPENAI_API_KEY=sk-proj-...

# Z-API WhatsApp
ZAPI_INSTANCE_ID=seu_instance_id
ZAPI_TOKEN=seu_token

# Web Push (VAPID)
VAPID_PUBLIC_KEY=BPx...
VAPID_PRIVATE_KEY=qrs...
VAPID_SUBJECT=mailto:seu@email.com

# Ambiente
NODE_ENV=production
PORT=5000

# Frontend URL (será preenchido após deploy do frontend)
FRONTEND_URL=https://seu-frontend.vercel.app

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu@email.com
SMTP_PASS=sua_senha_de_app_google
SMTP_FROM=Laura SAAS <noreply@laurasaas.com>
```

6. Clique em **"Deploy"**

7. **Anote a URL do backend gerada:**
   ```
   https://laura-saas-backend.vercel.app
   ```

### 1.4. Verificar Deploy do Backend

Teste a API acessando:
```
https://laura-saas-backend.vercel.app/api/health
```

Deve retornar: `{ "status": "OK" }`

---

## 🎨 PARTE 2: DEPLOY DO FRONTEND

### 2.1. Atualizar Variável de Ambiente do Frontend

1. Edite o arquivo `laura-saas-frontend/.env`:

```env
VITE_API_URL=https://laura-saas-backend.vercel.app/api
```

2. **IMPORTANTE:** Adicione este arquivo ao `.gitignore` e configure no Vercel

### 2.2. Deploy do Frontend no Vercel

#### Via Interface Web do Vercel:

1. Acesse [Vercel Dashboard](https://vercel.com/dashboard)
2. Clique em **"Add New"** → **"Project"**
3. Importe o **MESMO repositório** novamente
4. Configure o projeto:

**Configurações:**
```
Framework Preset: Vite
Root Directory: laura-saas-frontend
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

5. **Adicione a Variável de Ambiente:**

```env
VITE_API_URL=https://laura-saas-backend.vercel.app/api
```

*(Substitua pela URL real do seu backend)*

6. Clique em **"Deploy"**

7. **Anote a URL do frontend gerada:**
   ```
   https://laura-saas-frontend.vercel.app
   ```

### 2.3. Atualizar CORS no Backend

1. Volte ao projeto do **backend** no Vercel
2. Vá em **Settings** → **Environment Variables**
3. Edite a variável `FRONTEND_URL`:

```env
FRONTEND_URL=https://laura-saas-frontend.vercel.app
```

4. **Redeploy** o backend:
   - Vá em **Deployments**
   - Clique nos 3 pontinhos do último deploy
   - Clique em **"Redeploy"**

---

## ✅ PARTE 3: VERIFICAÇÕES FINAIS

### 3.1. Testar a Aplicação

1. Acesse o frontend: `https://laura-saas-frontend.vercel.app`
2. Teste o login com credenciais padrão
3. Verifique se:
   - ✅ Login funciona
   - ✅ Dashboard carrega
   - ✅ API responde corretamente
   - ✅ PWA está funcionando (ícone de instalação aparece)

### 3.2. Verificar Service Worker (PWA)

Abra DevTools (F12) → **Application** → **Service Workers**
- Deve mostrar o Service Worker registrado

### 3.3. Testar Notificações Push

1. Permita notificações no navegador
2. Teste criar um agendamento
3. Verifique se as notificações chegam

---

## 🔧 CONFIGURAÇÕES ADICIONAIS

### Domínio Personalizado

Se quiser usar um domínio próprio:

1. No Vercel, vá em **Settings** → **Domains**
2. Adicione seu domínio: `app.laurasaas.com.br`
3. Configure DNS conforme instruções do Vercel
4. **Atualize as variáveis:**
   - Backend `FRONTEND_URL=https://app.laurasaas.com.br`
   - Frontend `VITE_API_URL=https://api.laurasaas.com.br/api`

### SSL/HTTPS

O Vercel configura HTTPS automaticamente. Não precisa fazer nada!

---

## 🐛 TROUBLESHOOTING

### Erro: "Cannot connect to backend"

**Solução:**
1. Verifique se `VITE_API_URL` está correto no frontend
2. Verifique se `FRONTEND_URL` está correto no backend
3. Teste a API diretamente: `https://seu-backend.vercel.app/api/health`

### Erro: "CORS Policy"

**Solução:**
1. Verifique se `FRONTEND_URL` no backend está correto
2. Certifique-se de que o backend foi redeployado após atualizar a variável

### Service Worker não está registrando

**Solução:**
1. Verifique se está em HTTPS (Vercel usa por padrão)
2. Limpe o cache: DevTools → Application → Storage → Clear site data
3. Recarregue a página

### Notificações não funcionam

**Solução:**
1. Verifique se as chaves VAPID estão corretas
2. Certifique-se de que o navegador suporta notificações
3. Verifique se o usuário deu permissão

---

## 📊 MONITORAMENTO

### Vercel Analytics

Ative o Vercel Analytics para monitorar:
- Performance
- Erros
- Tráfego
- Core Web Vitals

### Logs

Para ver logs:
1. Acesse o projeto no Vercel
2. Vá em **Functions** ou **Deployments**
3. Clique em **"View Function Logs"**

---

## 🔄 ATUALIZAÇÕES

### Deploy Automático

O Vercel está configurado para fazer deploy automático sempre que você fizer push para a branch principal:

```bash
git add .
git commit -m "feat: nova funcionalidade"
git push origin main
```

O Vercel detectará automaticamente e fará o deploy!

---

## 📝 CHECKLIST FINAL

Antes de colocar em produção, verifique:

- [ ] MongoDB Atlas configurado e acessível
- [ ] Todas as variáveis de ambiente configuradas
- [ ] CORS configurado corretamente
- [ ] Login funciona
- [ ] Dashboard carrega
- [ ] PWA instalável
- [ ] Notificações funcionam
- [ ] WhatsApp integrado
- [ ] Domínio personalizado configurado (opcional)
- [ ] SSL/HTTPS ativo (automático no Vercel)
- [ ] Backups do MongoDB configurados

---

## 🎉 PRONTO!

Sua aplicação Laura SAAS está agora em produção! 🚀

**URLs importantes:**
- Frontend: `https://laura-saas-frontend.vercel.app`
- Backend: `https://laura-saas-backend.vercel.app`

---

## 📞 SUPORTE

Se tiver problemas:
1. Verifique os logs no Vercel
2. Teste a API com Postman/Thunder Client
3. Verifique o console do navegador (F12)
4. Revise as variáveis de ambiente

---

**Última atualização:** Janeiro 2026
**Versão:** 1.0.0
