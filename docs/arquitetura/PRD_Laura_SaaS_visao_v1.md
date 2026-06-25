# PRD — Laura SaaS Agenda
**Product Requirements Document — Alto Nível**

> **Versão:** 1.0  
> **Autor:** André dos Reis  
> **Data:** Abril 2026  
> **Status:** Em desenvolvimento activo — 1 cliente em produção

---

## 1. Por que esse produto existe?

Profissionais autónomos de estética e saúde (esteticistas, fisioterapeutas, nutricionistas, etc.) perdem clientes e receita por falta de organização. O agendamento é feito por WhatsApp de forma manual, os clientes faltam sem aviso, não há histórico centralizado e o controlo financeiro é inexistente ou feito em papel/Excel.

A Laura existe para resolver esse problema com uma solução acessível, simples e automatizada — sem exigir conhecimento técnico da profissional.

---

## 2. O que queremos alcançar com esse produto?

- Eliminar o agendamento manual via WhatsApp pessoal
- Reduzir faltas de clientes através de lembretes automáticos
- Dar visibilidade financeira em tempo real à profissional
- Automatizar a comunicação com clientes via chatbot WhatsApp com IA
- Ser uma plataforma multi-tenant — cada profissional tem os seus dados isolados
- Tornar-se o sistema de gestão de referência para profissionais autónomos de estética e saúde em Portugal e Brasil

---

## 3. O que esse produto vai entregar e o que não vai

### ✅ Entrega
- Sistema de agendamentos com estados (agendado, confirmado, realizado, cancelado, não compareceu)
- Gestão completa de clientes com ficha de anamnese médica
- Gestão de pacotes (criação, venda, controlo de sessões)
- Dashboard com KPIs em tempo real
- Módulo financeiro (caixa e transações)
- Chatbot WhatsApp com IA (GPT-4o-mini + Function Calling)
- Lembretes automáticos via WhatsApp (CRON diário às 19h)
- Notificações Web Push para a profissional
- PWA instalável (Android, iOS, Desktop)
- Arquitectura multi-tenant com isolamento por tenantId

### ❌ Não entrega (fora do escopo actual)
- Gestão de stock de produtos
- Contabilidade fiscal completa
- Integração com sistemas de pagamento online (Stripe, MB Way)
- App nativa iOS/Android (é PWA, não app nativa)
- Gestão de múltiplos profissionais dentro do mesmo tenant (equipa)

---

## 4. Para quem estamos construindo?

**Persona principal — A Profissional Autónoma**

- Esteticista, fisioterapeuta, nutricionista, personal trainer ou similar
- Trabalha sozinha ou com 1-2 colaboradores
- Tem entre 20-50 clientes activos
- Gere tudo pelo WhatsApp pessoal hoje
- Não tem conhecimento técnico
- Precisa de uma ferramenta simples, que funcione no telemóvel
- Valoriza automatização porque poupa tempo real

**Persona secundária — O Cliente da Profissional**

- Recebe lembretes automáticos via WhatsApp
- Pode agendar via chatbot sem falar com a profissional
- Não interage com o sistema directamente — só via WhatsApp

---

## 5. Qual problema esse produto resolve e por que ele importa?

| Problema actual | Como a Laura resolve |
|----------------|---------------------|
| Agendamentos por WhatsApp manual | Dashboard + chatbot automático |
| Clientes que faltam sem aviso | Lembretes automáticos às 19h do dia anterior |
| Sem histórico de clientes | Ficha completa com anamnese |
| Sem controlo de pacotes/sessões | Gestão de pacotes com contagem automática |
| Sem visibilidade financeira | Dashboard financeiro em tempo real |
| Notificações só por WhatsApp | Dual-channel: WhatsApp (cliente) + Web Push (profissional) |

---

## 6. Como pretendemos alcançar os objectivos?

### Stack técnica
| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 18+ (ESM) + Express 4 + MongoDB |
| Frontend | React 19 + TypeScript + Vite + Tailwind (PWA) |
| Auth | JWT (access 1h + refresh 7d) |
| WhatsApp | Evolution API (self-hosted, Docker) — migração da Z-API |
| IA | GPT-4o-mini + Function Calling |
| Notificações | Web Push (VAPID) |
| Infra | Docker + CI/CD GitHub Actions |
| Observabilidade | Sentry + Pino (logs estruturados) |

### Modelo de negócio
| Plano | Clientes | Agendamentos/mês | Preço |
|-------|----------|-----------------|-------|
| Básico (Trial 7 dias) | 50 | 100 | — |
| Pro | Ilimitado | Ilimitado | A definir |
| Elite | Ilimitado | Ilimitado + IA activa | A definir |

---

## 7. O que o produto deve ser capaz de fazer em linhas gerais?

- Permitir que a profissional gira toda a sua agenda a partir de qualquer dispositivo
- Enviar lembretes automáticos sem intervenção manual
- Permitir que clientes agendem via WhatsApp sem a profissional precisar de responder
- Mostrar em tempo real quantos agendamentos, receita e clientes activos existem
- Funcionar offline (PWA com cache)
- Garantir que os dados de cada profissional estão completamente isolados das outras

---

## 8. Como saberemos se o produto deu certo?

### Métricas de sucesso
- **Retenção da profissional** — continua a usar após 30 dias
- **Redução de faltas** — profissional reporta menos clientes que não comparecem
- **Tempo poupado** — profissional deixa de gerir agendamentos manualmente
- **Agendamentos via chatbot** — % de agendamentos feitos sem intervenção da profissional
- **NPS da profissional** — recomendaria a Laura a uma colega?

### Marcos técnicos
- Sistema sem downtime não planeado por mais de 48h
- Lembretes enviados com sucesso em 95%+ dos casos
- Tempo de resposta da API < 500ms em 95% dos requests

---

## 9. O que pode dar errado e como vamos lidar com isso?

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Ban do número WhatsApp | Média | Limitar volume de mensagens, usar Evolution API com boas práticas |
| Downtime do servidor | Baixa | Health check + alertas Sentry + deploy automatizado |
| Perda de dados MongoDB | Muito baixa | Backups automáticos MongoDB Atlas |
| Cliente insatisfeito com chatbot IA | Média | Fallback para atendimento manual, melhorar prompts iterativamente |
| Custos OpenAI inesperados | Baixa | Rate limiting no endpoint de IA, monitorização de uso |
| Vulnerabilidade de segurança | Média | Helmet, rate limiting, testes de segurança, hack ético futuro |

---

## 10. Qual o roadmap desse projecto?

### Fase 1 — Estabilidade e Segurança (Abril 2026)
- [ ] Helmet.js + Rate Limiting
- [ ] Health check endpoint
- [ ] Logs estruturados com Pino
- [ ] Sentry (error tracking)
- [ ] Índices MongoDB optimizados
- [ ] Testes unitários (controllers + middlewares)
- [ ] GitHub Actions CI/CD

### Fase 2 — Autonomia e Custo Zero (Maio 2026)
- [ ] Migração Z-API → Evolution API (Docker)
- [ ] Lembretes automáticos funcionais sem custo de API
- [ ] Containerização completa com Docker Compose
- [ ] Documentação técnica: HLD + FDD + Diagramas Mermaid

### Fase 3 — IA Completa (Junho 2026)
- [ ] Completar integração GPT-4o-mini + Function Calling
- [ ] Chatbot capaz de agendar, consultar disponibilidade e cancelar
- [ ] Doc Decoder Tool integrado na Laura
- [ ] Planos Pro e Elite com funcionalidades diferenciadas

### Fase 4 — Escala (Q3 2026)
- [ ] Onboarding de novos tenants
- [ ] Painel de administração multi-tenant
- [ ] Integração com pagamentos
- [ ] Avaliar extracção de microserviços (chatbot, notificações)

---

## 11. Quem está envolvido e qual o papel de cada um?

| Pessoa | Papel |
|--------|-------|
| André dos Reis | Product Owner + Tech Lead + Developer |
| Cliente actual (clínica de estética) | Early adopter + validação do produto |
| Utilizadores finais (clientes da clínica) | Consumidores do chatbot e lembretes |

---

## 12. Como esse produto se conecta à estratégia maior?

A Laura é o projecto central que valida a capacidade do André de:

- Construir e manter um SaaS em produção do zero
- Tomar decisões de arquitectura com impacto real
- Aplicar na prática o que está a aprender no MBA em Engenharia de Software com IA
- Demonstrar mentalidade sénior através de documentação profissional, testes, observabilidade e CI/CD

A Laura não é só um produto — é a prova concreta de que o André consegue construir sistemas que funcionam, escalam e têm cliente real.

---

*Documento vivo — actualizar conforme o produto evolui.*
