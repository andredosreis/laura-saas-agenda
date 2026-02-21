# Melhorias Identificadas — Marcai

Registo das melhorias e problemas conhecidos, organizados por prioridade.
Actualizado a: 2026-02-21 (Batches 1-3 concluídos)

---

## Críticas (bloqueiam crescimento)

### 1. Sem verificação de email obrigatória
- **Estado:** email enviado no registo mas não é obrigatório para aceder
- **Impacto:** utilizadores com emails errados ficam sem recuperação de senha
- **Solução:** bloquear acesso até verificar, ou pelo menos mostrar banner persistente

### 2. Sem rate limiting nas rotas públicas ✅ CONCLUÍDO
- **Estado:** ~~`/auth/register`, `/auth/login`, `/auth/forgot-password` sem limite~~
- **Solução aplicada:** `rateLimiter.js` com `express-rate-limit`, aplicado em `authRoutes.js`

### 3. Webhook WhatsApp sem validação de assinatura ✅ CONCLUÍDO
- **Estado:** ~~qualquer POST ao `/webhook/whatsapp` é processado~~
- **Solução aplicada:** `webhookAuth.js` middleware com validação de token Z-API

---

## Importantes (melhoram qualidade)

### 4. Sem paginação consistente em todas as listagens ✅ CONCLUÍDO
- **Estado:** ~~alguns endpoints sem paginação~~
- **Solução aplicada:** `?page&limit` em `clienteController`, `agendamentoController`, `pacoteController`. Resposta: `{ success, data, pagination: { total, page, pages, limit } }`. Frontend actualizado.

### 5. Sem logging estruturado ✅ CONCLUÍDO
- **Estado:** ~~apenas `console.log/error`~~
- **Solução aplicada:** `src/utils/logger.js` com Pino. `errorHandler.js`, `app.js`, `server.js` actualizados.

### 6. Cobertura de testes muito baixa
- **Estado:** ~0% de testes activos (jest configurado mas sem testes)
- **Solução:** começar pelos controllers críticos (auth, clientes, agendamentos)

### 7. `expiresIn` no frontend não é usado
- **Estado:** o frontend guarda o token mas não verifica expiração localmente
- **Impacto:** depende 100% do interceptor 401 para detectar expiração
- **Solução:** verificar `exp` do JWT no AuthContext para refresh proactivo

### 8. Sem gestão de erros global no Express
- **Estado:** cada controller tem o seu próprio try/catch
- **Solução:** middleware de erro centralizado no final do `app.js`

---

## Desejáveis (melhoram produto)

### 9. Dashboard sem gráficos/charts
- **Estado:** KPIs em números, sem visualização temporal
- **Solução:** Recharts (já instalado) para gráfico de agendamentos por semana/mês

### 10. Sem notificação de trial a expirar ✅ CONCLUÍDO
- **Estado:** ~~utilizador não é alertado quando o trial está a terminar~~
- **Solução aplicada:** banner âmbar no Dashboard quando `tenant.plano.status === 'trial' && diasRestantesTrial <= 3`

### 1. Sem verificação de email — banner ✅ CONCLUÍDO (parcial)
- **Solução aplicada:** banner azul no Dashboard quando `user.emailVerificado === false`

### 11. Página de configurações do tenant incompleta ✅ CONCLUÍDO
- **Estado:** ~~não existe página para editar dados da empresa~~
- **Solução aplicada:** `src/pages/Configuracoes.jsx` + rota `/configuracoes` em `App.tsx` + endpoint `PUT /api/auth/tenant`

### 12. Sem confirmação de agendamento por WhatsApp
- **Estado:** lembrete enviado mas cliente não pode confirmar/cancelar via WhatsApp
- **Solução:** chatbot processa resposta "confirmar" / "cancelar" e actualiza estado

### 13. Módulo financeiro incompleto
- **Estado:** páginas existem mas lógica de relatórios/caixa incompleta
- **Solução:** fechar o ciclo: receita por período, comissões, exportação

### 14. PWA — ícones ainda são placeholder
- **Estado:** favicon SVG feito, mas ícones PNG (192x192, 512x512) são os originais
- **Solução:** gerar PNGs do novo ícone Marcai e substituir em `/public/icons/`

---

## Dívida técnica

### 15. `manifest.json` duplicado ✅ CONCLUÍDO
- **Solução aplicada:** `/public/manifest.json` removido; apenas o do Vite PWA permanece.

### 16. `nodemailer` no frontend ✅ CONCLUÍDO
- **Solução aplicada:** removido de `laura-saas-frontend/package.json`

### 17. `web-push` no frontend ✅ CONCLUÍDO
- **Solução aplicada:** removido de `laura-saas-frontend/package.json`

### 18. `service-worker.ts` e `service-worker.js` duplicados em `/public` ✅ CONCLUÍDO
- **Solução aplicada:** ambos removidos; apenas o service worker do Vite PWA é usado

---

## Próximos passos sugeridos (por ordem)

1. Rate limiting (segurança)
2. Banner de trial a expirar (retenção)
3. Página de configurações do tenant
4. Limpar dependências desnecessárias no frontend
5. Gráficos no dashboard (Recharts)
6. Ícones PWA em PNG com branding Marcai
