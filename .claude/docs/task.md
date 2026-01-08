# 📋 TASK LIST - Laura SAAS Comercial

## Fase 1A: Autenticação + Tenant ✅ COMPLETA

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
- [x] 1.10 Implementar recuperação de senha (forgot/reset password)
- [x] 1.11 Configurar serviço de email (nodemailer)

### Backend - Migration
- [x] 1.12 Criar script de migração para adicionar tenantId
- [x] 1.13 Executar migração para criar tenant "Laura" com dados existentes

### Frontend - Autenticação
- [x] 1.14 Criar `AuthContext.jsx`
- [x] 1.15 Criar página `Login.jsx`
- [x] 1.16 Criar página `Register.jsx`
- [x] 1.17 Criar componente `ProtectedRoute.jsx`
- [x] 1.18 Atualizar `api.js` com interceptor JWT
- [x] 1.19 Atualizar `App.tsx` com rotas protegidas
- [x] 1.20 Criar página `ForgotPassword.jsx`
- [x] 1.21 Criar página `ResetPassword.jsx`
- [x] 1.22 Adicionar toggle mostrar/ocultar senha
- [x] 1.23 Adicionar link voltar para Landing Page

### Testes
- [x] 1.24 Testar fluxo register → login → dashboard
- [x] 1.25 Testar refresh token
- [x] 1.26 Testar isolamento de dados por tenant
- [x] 1.27 Testar fluxo de recuperação de senha

---

## Fase 1B: Novo Dashboard Design ✅ COMPLETA

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

---

## Fase 1C: Landing Page Comercial ✅ COMPLETA

### Página de Apresentação
- [x] 1C.1 Criar `LandingPage.jsx` com design premium
- [x] 1C.2 Implementar Hero Section com CTA
- [x] 1C.3 Implementar Features Section (6 funcionalidades)
- [x] 1C.4 Implementar Pricing Section (3 planos: Básico, PRO, ELITE)
- [x] 1C.5 Implementar seção WhatsApp/IA com mockup de conversa
- [x] 1C.6 Adicionar estatísticas (98% satisfação, -70% no-shows, etc)
- [x] 1C.7 Navegação fixa com glassmorphism
- [x] 1C.8 Footer com links
- [x] 1C.9 Adicionar FAQ Section
- [x] 1C.10 Implementar formulário de contato
- [x] 1C.11 Implementar animações de scroll (framer-motion)

### Rotas Atualizadas
- [x] 1C.12 Configurar `/` como Landing Page pública
- [x] 1C.13 Mover Dashboard para `/dashboard`
- [x] 1C.14 Atualizar Navbar com link correto
- [x] 1C.15 Atualizar redirecionamentos no Login e ProtectedRoute

### Pendente
- [ ] 1C.16 Adicionar screenshot real do Dashboard na Hero
- [ ] 1C.17 Adicionar seção de Testimonials/Depoimentos

---

## Fase 1D: Polimento UX 🔄 EM ANDAMENTO

### Melhorias de Interface
- [ ] 1D.1 Substituir alerts() por Toast notifications estilizados
- [ ] 1D.2 Adicionar Dark mode toggle no Dashboard
- [ ] 1D.3 Melhorar validação de formulários em tempo real
- [ ] 1D.4 Adicionar feedback visual em ações (loading states)

### Testes Finais Fase 1
- [ ] 1D.5 Testar responsividade completa (mobile, tablet, desktop)
- [ ] 1D.6 Verificar acessibilidade (contraste WCAG AA)
- [ ] 1D.7 Testar fluxo completo em dispositivos reais

---

## Fase 2: Calendário + Analytics

### Calendário Interativo
- [ ] 2.1 Instalar e configurar FullCalendar
- [ ] 2.2 Criar componente `CalendarView.jsx`
- [ ] 2.3 Integrar com agendamentos existentes
- [ ] 2.4 Implementar drag-and-drop para reagendar
- [ ] 2.5 Adicionar visualizações (dia, semana, mês)
- [ ] 2.6 Sincronizar com lista de agendamentos

### Analytics & Gráficos
- [ ] 2.7 Instalar Chart.js ou Recharts
- [ ] 2.8 Criar gráfico de evolução do faturamento (linha)
- [ ] 2.9 Criar gráfico de distribuição por serviço (pizza)
- [ ] 2.10 Criar heatmap de horários mais ocupados
- [ ] 2.11 Adicionar métricas: ticket médio, taxa conversão
- [ ] 2.12 Criar página dedicada de Analytics

### Melhorias Dashboard
- [ ] 2.13 Adicionar Centro de Ações Pendentes
- [ ] 2.14 Mostrar clientes com sessões baixas
- [ ] 2.15 Alertas de pagamentos pendentes

---

## Fase 3: Multi-Tenant Completo

### Sistema de Roles
- [ ] 3.1 Implementar roles: Admin, Recepcionista, Terapeuta
- [ ] 3.2 Criar middleware de autorização por role
- [ ] 3.3 Limitar funcionalidades por role no frontend
- [ ] 3.4 Criar página de gestão de usuários

### Onboarding
- [ ] 3.5 Criar fluxo de onboarding guiado para novos clientes
- [ ] 3.6 Wizard de configuração inicial (nome, logo, serviços)
- [ ] 3.7 Tour interativo do Dashboard

### Branding Personalizável
- [ ] 3.8 Criar modelo `TenantSettings.js` para branding
- [ ] 3.9 Implementar upload de logo
- [ ] 3.10 Permitir personalização de cores primárias/secundárias
- [ ] 3.11 Aplicar branding dinâmico no frontend
- [ ] 3.12 Preview em tempo real das alterações

### Planos e Limites
- [ ] 3.13 Definir limites por plano (clientes, agendamentos, etc)
- [ ] 3.14 Implementar verificação de limites no backend
- [ ] 3.15 Criar página de upgrade de plano
- [ ] 3.16 Integrar gateway de pagamento (Stripe)

### Autenticação Avançada
- [ ] 3.17 Implementar OAuth com Google
- [ ] 3.18 Adicionar autenticação 2FA (opcional)

### Relatórios
- [ ] 3.19 Criar página de relatórios avançados
- [ ] 3.20 Implementar export para PDF
- [ ] 3.21 Implementar export para Excel/CSV
- [ ] 3.22 Relatórios agendados por email

---

## 📊 Resumo de Progresso

| Fase | Status | Progresso |
|------|--------|-----------|
| 1A - Autenticação | ✅ Completa | 100% |
| 1B - Dashboard Design | ✅ Completa | 100% |
| 1C - Landing Page | ✅ Completa | 95% |
| 1D - Polimento UX | 🔄 Em andamento | 0% |
| 2 - Calendário + Analytics | ⏳ Pendente | 0% |
| 3 - Multi-Tenant Completo | ⏳ Pendente | 0% |

---

## 🎯 Próximas Ações Imediatas

1. **Finalizar Fase 1C**: Screenshot do Dashboard + Testimonials
2. **Iniciar Fase 1D**: Toast notifications + Dark mode toggle
3. **Testes de QA**: Responsividade e acessibilidade
