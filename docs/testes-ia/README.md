# Testes de IA — Marcai

Documentação das sessões de teste E2E do agente conversacional Python
(`ia-service`) + integração com F12 routing (`src/modules/messaging`) do
backend Node.

## Estrutura

- **[`01-sessao-2026-05-18.md`](./01-sessao-2026-05-18.md)** — Primeira
  sessão de testes E2E reais via WhatsApp. Contexto completo, conversas
  testadas, decisões tomadas, fixes aplicados.

- **[`02-problemas-pendentes.md`](./02-problemas-pendentes.md)** — Bugs
  identificados nesta sessão que **não foram totalmente resolvidos**, com
  severidade e proposta de resolução.

- **[`03-setup-local.md`](./03-setup-local.md)** — Passo-a-passo para
  reproduzir o ambiente local de testes E2E: backend Node, frontend,
  Python ia-service, ngrok, configuração Evolution webhook, env vars
  necessárias, comandos de query MongoDB.

- **[`04-proximos-passos.md`](./04-proximos-passos.md)** — Roadmap de
  trabalho identificado durante a sessão: migração para LangGraph,
  Client lifecycle, melhorias UI, etc.

## Princípio operacional dos testes

Os testes E2E são feitos **via WhatsApp real** (não fixtures sintéticas)
porque o objectivo é validar como o agente lida com mensagens orgânicas —
typos, mensagens curtas, mudanças de tom, emojis. Fixtures sintéticas
não apanham os bugs reais.

**Cada cenário começa com DB limpa** (Lead + Mensagens + Conversa +
Agendamentos do telefone de teste apagados) para garantir comportamento
determinístico.

## Pacote tecnológico testado

- **Backend Node** (`src/`) — F12 messaging router + Lead/Cliente domain modules
- **Frontend Vite** (`laura-saas-frontend/`) — Kanban Leads + Lead Detail
- **Python ia-service** (`ia-service/`) — LangChain agent + 6 tools +
  structured-output extractor
- **MongoDB Atlas** — DB partilhado entre produção e local (cuidado em testes)
- **Evolution API** — gateway WhatsApp
- **ngrok** — tunnel local → Evolution webhook
