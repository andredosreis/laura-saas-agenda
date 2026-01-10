# 🚀 Guia de Início Rápido - Laura SAAS

Este guia fornece um caminho direto para começar a trabalhar no projeto ou validar o trabalho da última sessão.

---

## ⚡ Início Ultra-Rápido (5 minutos)

### Opção A: Validar Última Sessão

```bash
# 1. Iniciar backend (Terminal 1)
cd /Users/andredosreis/Documents/Projetos/laura-saas-agenda
npm run dev

# 2. Iniciar frontend (Terminal 2)
cd laura-saas-frontend
npm run dev

# 3. Executar script de índices (Terminal 3)
node scripts/add-analytics-indexes.js

# 4. Abrir no navegador
# http://localhost:5173

# 5. Login
# Email: laura@laesteticaavancada.pt
# Senha: Laura@2024!

# 6. Testar drag-and-drop
# - Ir para /calendario
# - Arrastar um agendamento
# - Confirmar remarcação
# - Verificar se funcionou ✅
```

---

### Opção B: Entender o Projeto

```bash
# 1. Ler documentação consolidada (10 min)
# Abrir: .claude/docs/sessao_2026-01-10_consolidado.md

# 2. Ver código modificado
# Dashboard:     laura-saas-frontend/src/pages/Dashboard.jsx
# Calendar:      laura-saas-frontend/src/pages/CalendarView.jsx
# CSS:           laura-saas-frontend/src/index.css
# Backend:       src/controllers/agendamentoController.js

# 3. Executar testes pendentes
# Seguir: .claude/docs/proximo_passo_fase2.md
```

---

## 📋 Checklist Rápido de Validação

Execute isso para garantir que tudo está funcionando:

```bash
# ✅ Backend está rodando?
curl http://localhost:5000/api/health
# Deve retornar: {"status":"OK"}

# ✅ Frontend está rodando?
curl http://localhost:5173
# Deve retornar HTML

# ✅ MongoDB está conectado?
# Verifique logs do backend - deve dizer "MongoDB Connected"

# ✅ JWT está configurado?
grep JWT_SECRET .env
# Deve mostrar uma string aleatória
```

---

## 🎯 Teste Rápido das Funcionalidades

### 1. Dashboard (2 min)
- [ ] Acesse http://localhost:5173/dashboard
- [ ] Verifique se KPIs carregam
- [ ] Role até "Visão Semanal"
- [ ] Confirme que mostra agendamentos reais
- [ ] Clique em um agendamento
- [ ] Deve navegar para edição ✅

### 2. Calendário (3 min)
- [ ] Acesse http://localhost:5173/calendario
- [ ] Verifique se eventos aparecem
- [ ] Arraste um evento para outro horário
- [ ] Modal "Confirmar Remarcação" deve abrir
- [ ] Adicione nota e confirme
- [ ] Evento deve mover com sucesso ✅

### 3. Mobile (2 min)
- [ ] Pressione F12 (DevTools)
- [ ] Clique no ícone de mobile
- [ ] Selecione "iPhone 12 Pro"
- [ ] Navegue pelo dashboard
- [ ] Tudo deve ser legível e funcional ✅

---

## 🐛 Problemas Comuns e Soluções

### Erro: "Cannot connect to MongoDB"
```bash
# Solução: Verificar MONGO_URI no .env
cat .env | grep MONGO_URI

# Testar conexão
mongosh "sua-connection-string-aqui"
```

### Erro: "Port 5000 already in use"
```bash
# Solução: Matar processo
lsof -ti:5000 | xargs kill -9

# Ou usar porta diferente
PORT=5001 npm run dev
```

### Erro: "JWT malformed"
```bash
# Solução: Limpar localStorage
# 1. Abrir DevTools (F12)
# 2. Application → Local Storage
# 3. Clicar com botão direito → Clear
# 4. Fazer login novamente
```

### Erro: "Drag-and-drop não funciona"
```bash
# Solução: Verificar se correção foi aplicada
grep -A 10 "confirmReschedule" laura-saas-frontend/src/pages/CalendarView.jsx

# Deve mostrar:
# cliente: appointment.cliente?._id || appointment.cliente,
# pacote: appointment.pacote?._id || appointment.pacote || null,
```

### Erro: "Visão Semanal vazia"
```bash
# Solução: Verificar se há agendamentos futuros
# 1. Criar alguns agendamentos de teste
# 2. Garantir que dataHora está nos próximos 7 dias
# 3. Atualizar dashboard

# Verificar endpoint diretamente:
curl "http://localhost:5000/api/agendamentos?dataInicio=2026-01-10&dataFim=2026-01-17" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

---

## 📊 Onde Estamos no Projeto

```
Fase 1: Autenticação + MVP ████████████████████ 100% ✅
Fase 2A: Calendário         ████████████████████ 100% ✅
Fase 2B: Analytics          ████████████████████ 100% ✅
Fase 2C: Polimento          ███████████████████░  95% 🟡
─────────────────────────────────────────────────────
Fase 2 Total:               ███████████████████░  95% 🟢
```

**Status:** Pronto para testes com usuários reais!

---

## 🎯 O Que Fazer Agora?

### Cenário 1: Você é Desenvolvedor
1. Leia [sessao_2026-01-10_consolidado.md](.claude/docs/sessao_2026-01-10_consolidado.md)
2. Revise código modificado (4 arquivos)
3. Execute testes em [proximo_passo_fase2.md](.claude/docs/proximo_passo_fase2.md)
4. Reporte bugs ou sugestões

### Cenário 2: Você é Tester/QA
1. Leia [proximo_passo_fase2.md](.claude/docs/proximo_passo_fase2.md)
2. Execute os 7 testes listados
3. Documente bugs encontrados
4. Valide em dispositivos reais

### Cenário 3: Você é Product Owner
1. Leia [resumo_final_sessao.md](.claude/docs/resumo_final_sessao.md)
2. Revise conquistas e pendências
3. Decida próximos passos (Fase 3?)
4. Aprove deploy para staging

### Cenário 4: Você Quer Deploy
1. Execute build: `cd laura-saas-frontend && npm run build`
2. Teste preview: `npm run preview`
3. Valide variáveis de ambiente
4. Siga checklist em [proximo_passo_fase2.md](.claude/docs/proximo_passo_fase2.md)

---

## 📞 Informações Úteis

### Credenciais de Teste
- **Email:** laura@laesteticaavancada.pt
- **Senha:** Laura@2024!

### URLs
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:5000
- **Dashboard:** http://localhost:5173/dashboard
- **Calendário:** http://localhost:5173/calendario
- **Financeiro:** http://localhost:5173/financeiro

### Documentação
- **Início:** [README.md](.claude/docs/README.md)
- **Consolidado:** [sessao_2026-01-10_consolidado.md](.claude/docs/sessao_2026-01-10_consolidado.md)
- **Testes:** [proximo_passo_fase2.md](.claude/docs/proximo_passo_fase2.md)

---

## 🏆 Bugs Corrigidos (Última Sessão)

| Bug | Status |
|-----|--------|
| Drag-and-drop erro "Dados inválidos" | ✅ Corrigido |
| Status inexistente no enum | ✅ Corrigido |
| Dados mock no dashboard | ✅ Removidos |
| Scrollbar sobrepondo cards | ✅ Corrigido |
| Navegação quebrada | ✅ Corrigida |

---

## 🎨 Melhorias Implementadas (Última Sessão)

| Melhoria | Status |
|----------|--------|
| Visão Semanal com dados reais | ✅ Implementada |
| Filtros de data no backend | ✅ Implementados |
| KPIs dinâmicos | ✅ Implementados |
| Responsividade mobile | ✅ Completa |
| CSS scrollbar customizado | ✅ Implementado |
| Loading states | ✅ Implementados |

---

## ⚡ Comandos Mais Usados

```bash
# Iniciar desenvolvimento
npm run dev                          # Backend
cd laura-saas-frontend && npm run dev # Frontend

# Migração de índices
node scripts/add-analytics-indexes.js

# Build de produção
cd laura-saas-frontend
npm run build
npm run preview

# Logs
pm2 logs laura-saas-backend         # Se usando PM2
tail -f logs/backend.log             # Se usando arquivo de log

# Limpar e reinstalar
rm -rf node_modules package-lock.json
npm install
```

---

## 🚨 Antes de Fazer Deploy

- [ ] Executar todos os testes em [proximo_passo_fase2.md](.claude/docs/proximo_passo_fase2.md)
- [ ] Validar isolamento multi-tenant
- [ ] Build de produção sem erros
- [ ] Variáveis de ambiente configuradas
- [ ] Backup do banco de dados
- [ ] Testar em dispositivos reais
- [ ] Code review completo

---

## 📈 Próximas Fases (Backlog)

### Fase 3: Notificações (Planejada)
- Sistema de notificações em tempo real
- Integração WhatsApp Business API
- Lembretes automáticos
- Push notifications (PWA)

### Fase 4: Gestão Avançada (Backlog)
- Múltiplos profissionais
- Gestão de comissões
- Controle de estoque
- Relatórios avançados

---

**Última atualização:** 10/01/2026
**Autor:** Claude Code
**Versão:** v2.0 (Fase 2 - 95%)
**Próximo marco:** Deploy para Staging

---

## 💡 Dica Final

Se você tem **5 minutos**, leia [resumo_final_sessao.md](.claude/docs/resumo_final_sessao.md)

Se você tem **15 minutos**, leia [sessao_2026-01-10_consolidado.md](.claude/docs/sessao_2026-01-10_consolidado.md)

Se você tem **30 minutos**, execute os testes em [proximo_passo_fase2.md](.claude/docs/proximo_passo_fase2.md)

Se você tem **1 hora**, faça code review completo de todos os arquivos modificados

**Boa sorte! 🚀**
