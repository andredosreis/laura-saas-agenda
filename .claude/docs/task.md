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
- [x] 1.11 Executar migração para criar tenant "Laura" com dados existentes

### Frontend - Autenticação
- [x] 1.12 Criar `AuthContext.jsx`
- [x] 1.13 Criar página `Login.jsx`
- [x] 1.14 Criar página `Register.jsx`
- [x] 1.15 Criar componente `ProtectedRoute.jsx`
- [x] 1.16 Atualizar `api.js` com interceptor JWT
- [x] 1.17 Atualizar `App.tsx` com rotas protegidas

### Testes
- [x] 1.18 Executar migração para criar tenant "Laura"
- [x] 1.19 Testar fluxo register → login → dashboard
- [x] 1.20 Testar refresh token
- [x] 1.21 Testar isolamento de dados por tenant

---

## Fase 1B: Novo Dashboard Design (Semana 2)

### Design System Premium
- [x] 1B.1 Atualizar `tailwind.config.js` com paleta premium (indigo, amber, slate)
- [x] 1B.2 Adicionar CSS variables para glassmorphism em `index.css`
- [x] 1B.3 Criar classes utilitárias para cards glass e animações

### Dashboard - Visual
- [x] 1B.4 Implementar fundo escuro (slate-900) no layout
- [x] 1B.5 Criar componente `SkeletonCard.jsx` para loading states
- [x] 1B.6 Redesenhar header com saudação personalizada por hora do dia
- [x] 1B.7 Redesenhar KPI cards com design glassmorphism
- [x] 1B.8 Adicionar animações hover e transições suaves

### Dashboard - Novos KPIs
- [x] 1B.9 Criar endpoint `GET /dashboard/financeiro` no backend
- [x] 1B.10 Adicionar card de Faturamento Mensal (€)
- [x] 1B.11 Adicionar card de Taxa de Comparecimento (%)

### Dashboard - Cards de Agendamento
- [x] 1B.12 Redesenhar cards de agendamentos com estilo glass
- [x] 1B.13 Melhorar status badges com cores vibrantes
- [x] 1B.14 Adicionar ícones Lucide em todos os cards

### Testes Visuais
- [ ] 1B.15 Testar responsividade (mobile, tablet, desktop)
- [ ] 1B.16 Testar dark mode em todos os componentes
- [ ] 1B.17 Verificar acessibilidade (contraste de cores)

## Fase 2: Calendário + Analytics (Semanas 3-4)
- [ ] Pendente...

## Fase 3: Multi-Tenant Completo (Semanas 5-6)
- [ ] Pendente...

---

## Fase 1C: Landing Page Comercial (Adicionada)

### Página de Apresentação
- [x] 1C.1 Criar `LandingPage.jsx` com design premium
- [x] 1C.2 Implementar Hero Section com CTA
- [x] 1C.3 Implementar Features Section (6 funcionalidades)
- [x] 1C.4 Implementar Pricing Section (3 planos: Básico, PRO, ELITE)
- [x] 1C.5 Implementar seção WhatsApp/IA com mockup de conversa
- [x] 1C.6 Adicionar estatísticas (98% satisfação, -70% no-shows, etc)
- [x] 1C.7 Navegação fixa com glassmorphism
- [x] 1C.8 Footer com links

### Rotas Atualizadas
- [x] 1C.9 Configurar `/` como Landing Page pública
- [x] 1C.10 Mover Dashboard para `/dashboard`
- [x] 1C.11 Atualizar Navbar com link correto
- [x] 1C.12 Atualizar redirecionamentos no Login e ProtectedRoute

### Pendente
- [ ] 1C.13 Adicionar screenshot real do Dashboard na Hero
- [ ] 1C.14 Implementar animações de scroll (AOS ou similar)
- [ ] 1C.15 Adicionar seção de Testimonials/Depoimentos
- [x] 1C.16 Adicionar FAQ Section
- [x] 1C.17 Implementar formulário de contato
