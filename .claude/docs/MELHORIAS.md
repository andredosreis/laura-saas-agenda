# Melhorias Identificadas — Marcai

Registo das melhorias e problemas conhecidos, organizados por prioridade.
Actualizado a: 2026-02-21

---

## Críticas (bloqueiam crescimento)

### 1. Sem verificação de email obrigatória
- **Estado:** email enviado no registo mas não é obrigatório para aceder
- **Impacto:** utilizadores com emails errados ficam sem recuperação de senha
- **Solução:** bloquear acesso até verificar, ou pelo menos mostrar banner persistente

### 2. Sem rate limiting nas rotas públicas
- **Estado:** `/auth/register`, `/auth/login`, `/auth/forgot-password` sem limite
- **Impacto:** vulnerável a brute force e spam de emails
- **Solução:** `express-rate-limit` nas rotas públicas (ex: 5 req/min no login)

### 3. Webhook WhatsApp sem validação de assinatura
- **Estado:** qualquer POST ao `/webhook/whatsapp` é processado
- **Impacto:** possível abuso/spam do chatbot
- **Solução:** validar token Z-API no header de cada request

---

## Importantes (melhoram qualidade)

### 4. Sem paginação consistente em todas as listagens
- **Estado:** alguns endpoints sem paginação — podem retornar centenas de documentos
- **Solução:** padronizar `?page=1&limit=20` com resposta `{ data, total, page, pages }`

### 5. Sem logging estruturado
- **Estado:** apenas `console.log/error`
- **Solução:** Winston ou Pino com níveis (info, warn, error) e output JSON em produção

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

### 10. Sem notificação de trial a expirar
- **Estado:** utilizador não é alertado quando o trial está a terminar
- **Solução:** banner no dashboard quando `diasRestantesTrial <= 3`

### 11. Página de configurações do tenant incompleta
- **Estado:** não existe página para editar dados da empresa (nome, contacto, timezone)
- **Solução:** página `/configuracoes` com form para editar `Tenant.contato` e `Tenant.configuracoes`

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

### 15. `manifest.json` duplicado
- **Estado:** existe `/public/manifest.json` e o manifest gerado pelo `vite-plugin-pwa`
- **Risco:** conflito entre os dois
- **Solução:** remover `/public/manifest.json` e deixar apenas o do Vite PWA

### 16. `nodemailer` no frontend
- **Estado:** `nodemailer` está nas dependências do frontend (não serve para nada no browser)
- **Solução:** remover da `laura-saas-frontend/package.json`

### 17. `web-push` no frontend
- **Estado:** mesma situação — `web-push` é uma lib de servidor, não de browser
- **Solução:** remover da `laura-saas-frontend/package.json`

### 18. `service-worker.ts` e `service-worker.js` duplicados em `/public`
- **Estado:** dois ficheiros de service worker manuais coexistem com o do Vite PWA
- **Solução:** remover os manuais, usar apenas o gerado pelo plugin

---

## Próximos passos sugeridos (por ordem)

1. Rate limiting (segurança)
2. Banner de trial a expirar (retenção)
3. Página de configurações do tenant
4. Limpar dependências desnecessárias no frontend
5. Gráficos no dashboard (Recharts)
6. Ícones PWA em PNG com branding Marcai
