# 📝 Changelog - LAURA SAAS AGENDA

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [1.0.1] - 2025-11-16

### 🐛 Corrigido

#### Webhook WhatsApp - Resposta Automática Simples (IA Desativada)
**Problema:** Cliente enviava mensagem casual (ex: "Olá") e recebia erro "Não encontramos nenhum agendamento pendente de confirmação".

**Causa:** Webhook estava configurado apenas para processar confirmações (SIM/NÃO) de agendamentos.

**Solução:** Implementado **roteamento inteligente** no webhook com **resposta automática simples**:
- Se mensagem é `SIM/NÃO` → Processa confirmação de agendamento
- Se mensagem é outra coisa → Envia resposta automática ÚNICA baseada no horário
- Se cliente já recebeu resposta → IGNORA (Laura tratará manualmente)
- **IA (GPT-4o-mini) DESATIVADA por enquanto**

**Arquivos modificados:**
- `src/controllers/webhookController.js` - Adicionada função `delegarParaIA()`
- `src/controllers/webhookController.js` - Modificada lógica de roteamento (linhas 51-62)

**Resultado:**
```
Antes:
Cliente: "Olá"
Sistema: ❌ "Não encontramos nenhum agendamento pendente"

Depois (v1.0.1):
Cliente: "Olá" (primeira vez)
Sistema: ✅ "Boa tarde! 👋 Tudo bem? Sou um assistente virtual da Laura.
          Em breve ela entrará em contato para mais informações. 💆‍♀️✨"

Cliente: "Olá" (segunda vez - mesmo cliente)
Sistema: ✅ (NENHUMA resposta - Laura tratará manualmente)
```

**Funcionalidades:**
- ✅ Saudação baseada no horário (Bom dia/Boa tarde/Boa noite)
- ✅ Responde APENAS UMA VEZ por cliente (evita spam)
- ✅ Marca cliente como 'aguardando_laura' após primeira resposta
- ✅ Ignora mensagens subsequentes (Laura trata manualmente)
- ✅ Confirmações de agendamento (SIM/NÃO) continuam funcionando

**Documentação:**
- [assets/docs/WEBHOOK_RESPOSTA_AUTOMATICA.md](assets/docs/WEBHOOK_RESPOSTA_AUTOMATICA.md) - Documentação completa
- [assets/docs/FIX_WEBHOOK_WHATSAPP.md](assets/docs/FIX_WEBHOOK_WHATSAPP.md) - Análise do problema original

---

### 📦 Adicionado

#### Dependência `lucide-react`
**Problema:** Build do frontend falhava com erro "Failed to resolve import lucide-react".

**Solução:** Instalada dependência `lucide-react@0.553.0` no frontend.

**Arquivo modificado:**
- `laura-saas-frontend/package.json` - Adicionado `"lucide-react": "^0.553.0"`

**Uso:** Componente `InstallPrompt.tsx` utiliza ícones `Download` e `X`.

---

### 📚 Documentação

#### Nova Documentação Completa
Criada documentação técnica detalhada do projeto:

1. **[ANALISE_COMPLETA.md](assets/docs/ANALISE_COMPLETA.md)** (73KB)
   - Análise de 127 arquivos (~15.000 LOC)
   - Stack tecnológica completa
   - Modelos de dados (MongoDB)
   - Rotas e APIs
   - Funcionalidades implementadas
   - Integrações externas (Z-API, OpenAI, Web Push)
   - Fluxos de dados detalhados
   - Pontos de atenção e melhorias
   - Checklist de ações recomendadas

2. **[ARQUITETURA.md](assets/docs/ARQUITETURA.md)** (51KB)
   - Diagramas de arquitetura (alto nível)
   - Camadas da aplicação
   - Fluxos de dados (WhatsApp, CRON, PWA)
   - Decisões arquiteturais
   - Escalabilidade e performance
   - Segurança e LGPD

3. **[TROUBLESHOOTING.md](assets/docs/TROUBLESHOOTING.md)** (15KB)
   - Guia de solução de problemas comuns
   - Erros de build, runtime, deploy
   - Erros de banco de dados e integrações
   - Comandos úteis de debug
   - Checklist de troubleshooting

4. **[FIX_WEBHOOK_WHATSAPP.md](assets/docs/FIX_WEBHOOK_WHATSAPP.md)**
   - Análise detalhada do problema webhook
   - Solução com código completo
   - Testes e validação

5. **[README.md](README.md)** (15KB)
   - Documentação principal atualizada
   - Instruções de instalação
   - Configuração completa
   - Roadmap do projeto

#### Organização da Documentação
Movida toda documentação para `assets/docs/`:
- Centralização de documentos técnicos
- Melhor organização do repositório
- Links atualizados no README

---

### ⚙️ Instalação

#### Módulos Instalados
- **Backend:** 471 pacotes instalados com sucesso
- **Frontend:** 617 pacotes instalados (616 + lucide-react)

**Warnings:**
- Backend: 18 vulnerabilidades moderadas (executar `npm audit fix`)
- Frontend: 7 vulnerabilidades (executar `npm audit fix`)

---

## [1.0.0] - 2025-11-15

### 🎉 Lançamento Inicial (MVP)

#### Funcionalidades Principais

**✅ Gestão de Clientes**
- CRUD completo
- Ficha de anamnese médica (20+ campos LGPD)
- Controle de sessões restantes
- Histórico de conversas WhatsApp

**✅ Gestão de Agendamentos**
- CRUD completo
- 6 estados (Agendado, Confirmado, Realizado, Cancelado Pelo Cliente, Cancelado Pelo Salão, Não Compareceu)
- Suporte para pacotes e serviços avulsos
- Sistema de confirmação (pendente/confirmado/rejeitado)
- Envio manual de lembretes

**✅ Gestão de Pacotes**
- CRUD completo
- Categorização de serviços
- Controle de sessões e valores
- Status ativo/inativo

**✅ Dashboard Inteligente**
- Agendamentos de hoje e amanhã
- Próximos 5 agendamentos
- Clientes atendidos na semana (últimos 7 dias)
- Alertas de sessões baixas (≤ 2 sessões)
- Totais do sistema

**✅ Chatbot WhatsApp com IA**
- OpenAI GPT-4o-mini
- Function Calling (criar cliente, agendar, reagendar, cancelar)
- Detecção de intenção
- Histórico de conversas
- Personalidade profissional (PT-PT)

**✅ Notificações Dual-Channel**
- **WhatsApp** (para clientes): Lembretes 24h antes via Z-API
- **Web Push** (para Laura): Novos agendamentos, alertas
- **CRON jobs**: Diário às 19h (timezone: Europe/Lisbon)

**✅ Progressive Web App (PWA)**
- Instalável (Android, iOS, Desktop)
- Offline-first (Service Worker)
- Push notifications
- Ícones adaptáveis (Android Adaptive Icons + Apple Touch Icons)
- Prompt de instalação automático

**✅ Gestão de Disponibilidade**
- Configuração por dia da semana (0-6)
- Horário de funcionamento + intervalo de almoço
- Timezone: Europe/Lisbon

#### Stack Tecnológica

**Backend:**
- Node.js (ES Modules)
- Express.js 4.19.2
- MongoDB 8.1.2 (Mongoose ODM)
- OpenAI API 4.26.0 (GPT-4o-mini)
- Z-API WhatsApp Business
- web-push 3.6.7 (VAPID)
- node-cron 3.0.3
- luxon 3.7.2

**Frontend:**
- React 19.0.0
- Vite 6.3.5
- TypeScript 5.9.2 (parcial)
- React Router DOM 7.5.2
- TailwindCSS 3.4.3
- vite-plugin-pwa 1.1.0
- react-toastify 11.0.5
- @vercel/speed-insights 1.2.0

**Integrações:**
- MongoDB Atlas (Database Cloud)
- OpenAI (GPT-4o-mini + GPT-3.5-turbo)
- Z-API (WhatsApp Business)
- Vercel (Deploy Frontend)
- Web Push Service (VAPID)

#### Deploy

- **Frontend:** https://laura-saas-agenda-mfqt.vercel.app
- **Backend:** (configurar URL)

---

## [Unreleased] - Roadmap Futuro

### 🚧 Em Desenvolvimento

#### v1.2 (Sprint 2-4 - 30 dias)
- [ ] Autenticação JWT
- [ ] LGPD compliance (consent forms + criptografia)
- [ ] Rate limiting (express-rate-limit)
- [ ] Logging estruturado (Winston)
- [ ] Error tracking (Sentry)
- [ ] Redis cache (KPIs, queries)
- [ ] Bull queue (WhatsApp + LLM)
- [ ] PWA offline mode completo (IndexedDB)
- [ ] MongoDB índices otimizados
- [ ] Testes E2E (Playwright)
- [ ] Coverage 80%+

#### v1.3 (Sprint 5-8 - 60 dias)
- [ ] Dashboard financeiro completo
- [ ] Analytics avançado (no-show rate, conversão)
- [ ] Integração pagamentos (Stripe)
- [ ] Multi-usuário (roles: admin, recepcionista)
- [ ] Calendário visual (FullCalendar)

#### v2.0 (Sprint 9+ - 90 dias)
- [ ] Migração para TypeScript (backend)
- [ ] LangChain.js + LangGraph
- [ ] Microserviço IA (Python)
- [ ] n8n workflow orchestration
- [ ] Mobile app nativo (React Native)
- [ ] Multi-tenant (múltiplas clínicas)

---

## Tipos de Mudanças

- `Adicionado` - Para novas funcionalidades
- `Modificado` - Para mudanças em funcionalidades existentes
- `Descontinuado` - Para funcionalidades que serão removidas
- `Removido` - Para funcionalidades removidas
- `Corrigido` - Para correções de bugs
- `Segurança` - Para vulnerabilidades de segurança

---

**Manutenção:** André dos Reis
**Última Atualização:** 16 de Novembro de 2025
