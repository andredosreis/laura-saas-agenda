# 📋 TASK LIST - Laura SAAS Comercial

## Fase 1A: Autenticação + Tenant (Semana 1)

### Backend - Modelos
- [x] 1.1 Criar modelo `Tenant.js`
- [x] 1.2 Criar modelo `User.js`
- [x] 1.3 Adicionar `tenantId` a modelos existentes (Cliente, Agendamento, Pacote, Schedule, Conversa)

### Backend - Autenticação
- [x] 1.4 Instalar dependências (bcryptjs, jsonwebtoken)
- [x] 1.5 Criar `authController.js` (register, login, logout, refresh, me)
- [x] 1.6 Criar `authRoutes.js`
- [x] 1.7 Criar middleware `auth.js` (authenticate, authorize, requirePlan)
- [x] 1.8 Criar middleware `injectTenant.js` (incluído em auth.js)
- [x] 1.9 Atualizar `app.js` com novas rotas e middlewares

### Backend - Migration
- [x] 1.10 Criar script de migração para adicionar tenantId
- [ ] 1.11 Executar migração para criar tenant "Laura" com dados existentes

### Frontend - Autenticação
- [x] 1.12 Criar `AuthContext.jsx`
- [x] 1.13 Criar página `Login.jsx`
- [x] 1.14 Criar página `Register.jsx`
- [x] 1.15 Criar componente `ProtectedRoute.jsx`
- [x] 1.16 Atualizar `api.js` com interceptor JWT
- [x] 1.17 Atualizar `App.tsx` com rotas protegidas

### Testes
- [ ] 1.18 Executar migração para criar tenant "Laura"
- [ ] 1.19 Testar fluxo register → login → dashboard
- [ ] 1.20 Testar refresh token
- [ ] 1.21 Testar isolamento de dados por tenant

---

## Fase 1B: Novo Dashboard Design (Semana 2)
- [ ] Pendente...

## Fase 2: Calendário + Analytics (Semanas 3-4)
- [ ] Pendente...

## Fase 3: Multi-Tenant Completo (Semanas 5-6)
- [ ] Pendente...
